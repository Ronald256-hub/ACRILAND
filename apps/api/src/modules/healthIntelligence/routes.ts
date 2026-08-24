import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";
import {
  acknowledgementDueAt,
  acknowledgementIsOverdue,
  average,
  buildRepeatFaultIntelligence,
  openAgeBand,
  type HealthPolicy,
  type ManagedHealthState
} from "../../domain/healthIntelligence.js";

export const healthIntelligenceRouter = Router();
const hourMs = 3_600_000;
const dayMs = 86_400_000;

const policyInput = z.object({
  healthCriticalAckMinutes: z.number().int().min(5).max(1440),
  healthAttentionAckHours: z.number().int().min(1).max(168),
  healthFreshnessHours: z.number().int().min(4).max(168),
  healthRepeatWindowDays: z.number().int().min(7).max(365)
});

function toPolicy(row: {
  healthCriticalAckMinutes: number;
  healthAttentionAckHours: number;
  healthFreshnessHours: number;
  healthRepeatWindowDays: number;
}): HealthPolicy {
  return {
    criticalAckMinutes: row.healthCriticalAckMinutes,
    attentionAckHours: row.healthAttentionAckHours,
    freshnessHours: row.healthFreshnessHours,
    repeatWindowDays: row.healthRepeatWindowDays
  };
}

healthIntelligenceRouter.get("/summary", requirePermission(PERMISSIONS.HEALTH_INTELLIGENCE_VIEW), async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const now = new Date();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      healthCriticalAckMinutes: true,
      healthAttentionAckHours: true,
      healthFreshnessHours: true,
      healthRepeatWindowDays: true
    }
  });
  const policy = toPolicy(organization);
  const freshnessStart = new Date(now.getTime() - policy.freshnessHours * hourMs);
  const repeatStart = new Date(now.getTime() - policy.repeatWindowDays * dayMs);

  const [healthGroups, activeAssignments, freshDailyChecks, openReports, recentManagedReports, faultRows] = await Promise.all([
    prisma.vehicle.groupBy({
      by: ["healthState"],
      where: { organizationId, archivedAt: null },
      _count: { _all: true }
    }),
    prisma.vehicleAssignment.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: {
        vehicleId: true,
        driverId: true,
        vehicle: { select: { registrationNumber: true, make: true, model: true, healthState: true, healthUpdatedAt: true, status: true } },
        driver: { select: { fullName: true, employeeNumber: true } }
      },
      orderBy: { startAt: "asc" }
    }),
    prisma.vehicleInspection.findMany({
      where: { organizationId, type: "DAILY", createdAt: { gte: freshnessStart } },
      select: { vehicleId: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.vehicleInspection.findMany({
      where: { organizationId, managerStatus: { not: "RESOLVED" }, healthState: { in: ["ATTENTION", "CRITICAL"] } },
      select: {
        id: true,
        vehicleId: true,
        healthState: true,
        managerStatus: true,
        createdAt: true,
        acknowledgedAt: true,
        repairRequest: true,
        vehicleBehavior: true,
        loadState: true,
        workOrderId: true,
        odometerKm: true,
        vehicle: { select: { registrationNumber: true, make: true, model: true, status: true } },
        driver: { select: { fullName: true, employeeNumber: true } },
        _count: { select: { evidence: true } }
      },
      orderBy: [{ healthState: "asc" }, { createdAt: "asc" }],
      take: 300
    }),
    prisma.vehicleInspection.findMany({
      where: { organizationId, createdAt: { gte: repeatStart }, healthState: { in: ["ATTENTION", "CRITICAL"] } },
      select: { id: true, healthState: true, managerStatus: true, createdAt: true, acknowledgedAt: true, resolvedAt: true, workOrderId: true }
    }),
    prisma.inspectionResult.findMany({
      where: {
        result: { in: ["FAIL", "ATTENTION_REQUIRED"] },
        inspection: { organizationId, createdAt: { gte: repeatStart }, healthState: { in: ["ATTENTION", "CRITICAL"] } }
      },
      select: {
        result: true,
        isCritical: true,
        labelSnapshot: true,
        templateItem: { select: { code: true } },
        inspection: { select: { vehicleId: true, createdAt: true, vehicle: { select: { registrationNumber: true } } } }
      },
      take: 5000
    })
  ]);

  const health = { HEALTHY: 0, ATTENTION: 0, CRITICAL: 0, UNKNOWN: 0 };
  for (const row of healthGroups) {
    const key = row.healthState in health ? row.healthState as keyof typeof health : "UNKNOWN";
    health[key] += row._count._all;
  }

  const freshVehicleIds = new Set(freshDailyChecks.map((row) => row.vehicleId));
  const assignedVehicleIds = [...new Set(activeAssignments.map((row) => row.vehicleId))];
  const staleAssignments = activeAssignments.filter((row) => !freshVehicleIds.has(row.vehicleId)).map((row) => ({
    vehicleId: row.vehicleId,
    registrationNumber: row.vehicle.registrationNumber,
    vehicle: `${row.vehicle.make} ${row.vehicle.model}`,
    vehicleStatus: row.vehicle.status,
    healthState: row.vehicle.healthState,
    healthUpdatedAt: row.vehicle.healthUpdatedAt,
    driverId: row.driverId,
    driverName: row.driver.fullName,
    employeeNumber: row.driver.employeeNumber
  }));
  const freshAssigned = assignedVehicleIds.filter((id) => freshVehicleIds.has(id)).length;

  const ageBuckets = { UNDER_4_HOURS: 0, "4_TO_24_HOURS": 0, "1_TO_3_DAYS": 0, OVER_3_DAYS: 0 };
  let overdueResponses = 0;
  let overdueCriticalResponses = 0;
  const queue = openReports.map((row) => {
    const state = row.healthState as ManagedHealthState;
    const dueAt = acknowledgementDueAt(row.createdAt, state, policy);
    const responseOverdue = acknowledgementIsOverdue({
      createdAt: row.createdAt,
      acknowledgedAt: row.acknowledgedAt,
      managerStatus: row.managerStatus,
      state,
      policy,
      now
    });
    if (responseOverdue) {
      overdueResponses += 1;
      if (state === "CRITICAL") overdueCriticalResponses += 1;
    }
    const band = openAgeBand(row.createdAt, now);
    ageBuckets[band] += 1;
    return {
      id: row.id,
      healthState: row.healthState,
      managerStatus: row.managerStatus,
      createdAt: row.createdAt,
      dueAt,
      responseOverdue,
      ageMinutes: Math.max(0, Math.floor((now.getTime() - row.createdAt.getTime()) / 60_000)),
      vehicleId: row.vehicleId,
      registrationNumber: row.vehicle.registrationNumber,
      vehicle: `${row.vehicle.make} ${row.vehicle.model}`,
      vehicleStatus: row.vehicle.status,
      driverName: row.driver?.fullName ?? null,
      employeeNumber: row.driver?.employeeNumber ?? null,
      odometerKm: row.odometerKm,
      loadState: row.loadState,
      repairRequest: row.repairRequest,
      vehicleBehavior: row.vehicleBehavior,
      workOrderId: row.workOrderId,
      evidenceCount: row._count.evidence
    };
  });

  const observations = faultRows.map((row) => ({
    vehicleId: row.inspection.vehicleId,
    vehicleRegistration: row.inspection.vehicle.registrationNumber,
    code: row.templateItem.code,
    label: row.labelSnapshot,
    isCritical: row.isCritical || row.result === "FAIL",
    observedAt: row.inspection.createdAt
  }));
  const repeat = buildRepeatFaultIntelligence(observations);

  const acknowledgementMinutes = recentManagedReports
    .filter((row) => row.acknowledgedAt)
    .map((row) => Math.max(0, (row.acknowledgedAt!.getTime() - row.createdAt.getTime()) / 60_000));
  const resolutionHours = recentManagedReports
    .filter((row) => row.resolvedAt)
    .map((row) => Math.max(0, (row.resolvedAt!.getTime() - row.createdAt.getTime()) / hourMs));
  const workOrderReports = recentManagedReports.filter((row) => Boolean(row.workOrderId)).length;

  return res.json({
    generatedAt: now,
    policy: {
      healthCriticalAckMinutes: organization.healthCriticalAckMinutes,
      healthAttentionAckHours: organization.healthAttentionAckHours,
      healthFreshnessHours: organization.healthFreshnessHours,
      healthRepeatWindowDays: organization.healthRepeatWindowDays
    },
    fleetHealth: {
      healthy: health.HEALTHY,
      attention: health.ATTENTION,
      critical: health.CRITICAL,
      unknown: health.UNKNOWN,
      total: Object.values(health).reduce((sum, value) => sum + value, 0)
    },
    reportingCompliance: {
      activeAssignedVehicles: assignedVehicleIds.length,
      freshDailyChecks: freshAssigned,
      staleOrMissingChecks: staleAssignments.length,
      compliancePercent: assignedVehicleIds.length ? Math.round((freshAssigned / assignedVehicleIds.length) * 1000) / 10 : 100,
      staleAssignments
    },
    responseControl: {
      openReports: queue.length,
      openCritical: queue.filter((row) => row.healthState === "CRITICAL").length,
      openAttention: queue.filter((row) => row.healthState === "ATTENTION").length,
      overdueResponses,
      overdueCriticalResponses,
      ageBuckets,
      queue
    },
    repeatFaults: {
      windowDays: policy.repeatWindowDays,
      faultSystems: repeat.faultSystems.slice(0, 12),
      repeatVehicleFaults: repeat.repeatVehicleFaults.slice(0, 30)
    },
    followThrough: {
      managedReportsInWindow: recentManagedReports.length,
      acknowledgedReports: acknowledgementMinutes.length,
      resolvedReports: resolutionHours.length,
      workOrderReports,
      workOrderConversionPercent: recentManagedReports.length ? Math.round((workOrderReports / recentManagedReports.length) * 1000) / 10 : 0,
      averageAcknowledgementMinutes: average(acknowledgementMinutes),
      averageResolutionHours: average(resolutionHours)
    }
  });
});

healthIntelligenceRouter.patch("/policy", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const input = policyInput.parse(req.body);
  const current = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });
  const updated = await prisma.organization.update({
    where: { id: current.id },
    data: input,
    select: {
      healthCriticalAckMinutes: true,
      healthAttentionAckHours: true,
      healthFreshnessHours: true,
      healthRepeatWindowDays: true
    }
  });
  await audit(req, {
    action: "UPDATE",
    recordType: "VEHICLE_HEALTH_POLICY",
    recordId: current.id,
    oldValue: {
      healthCriticalAckMinutes: current.healthCriticalAckMinutes,
      healthAttentionAckHours: current.healthAttentionAckHours,
      healthFreshnessHours: current.healthFreshnessHours,
      healthRepeatWindowDays: current.healthRepeatWindowDays
    },
    newValue: updated
  });
  return res.json(updated);
});
