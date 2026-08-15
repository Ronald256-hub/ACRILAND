import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const dashboardRouter = Router();
dashboardRouter.get("/summary", requirePermission(PERMISSIONS.DASHBOARD_VIEW), async (req, res) => {
  const organizationId = req.auth!.organizationId; const now = new Date(); const ninetyDaysFromNow = new Date(now.getTime() + 90 * 86_400_000); const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86_400_000); const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000); const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
  const [vehicles, drivers, activeDrivers, licencesExpiring, branches, users, activeAssignments, activeTrips, pendingTripApprovals, inspectionFailures, activeMaintenance, maintenanceApprovals, readyForRelease, pendingFuelApprovals, complianceDue30, fuelSpend30, maintenanceSpend90, openIncidents, criticalIncidents, openOperationalAlerts, criticalOperationalAlerts, tyresInRepair, pendingProcurement, telemetryVehicles, dispatchReady, dispatchBlocked, openGeofenceBreaches, activeVendors, pendingDisposals, pendingNotifications, failedNotifications] = await prisma.$transaction([
    prisma.vehicle.count({ where: { organizationId, archivedAt: null } }), prisma.driver.count({ where: { organizationId, archivedAt: null } }),
    prisma.driver.count({ where: { organizationId, archivedAt: null, status: "ACTIVE", licenceExpiry: { gte: now } } }), prisma.driver.count({ where: { organizationId, archivedAt: null, licenceExpiry: { gte: now, lte: ninetyDaysFromNow } } }),
    prisma.branch.count({ where: { organizationId, isActive: true } }), prisma.user.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.vehicleAssignment.count({ where: { organizationId, status: "ACTIVE" } }), prisma.trip.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.trip.count({ where: { organizationId, status: "REQUESTED" } }), prisma.vehicleInspection.count({ where: { organizationId, status: "FAILED", createdAt: { gte: thirtyDaysAgo } } }),
    prisma.maintenanceWorkOrder.count({ where: { organizationId, status: { in: ["OPEN","DIAGNOSIS","AWAITING_APPROVAL","APPROVED","IN_PROGRESS","QC","READY_FOR_RELEASE"] } } }),
    prisma.maintenanceWorkOrder.count({ where: { organizationId, status: "AWAITING_APPROVAL" } }), prisma.maintenanceWorkOrder.count({ where: { organizationId, status: "READY_FOR_RELEASE" } }),
    prisma.fuelTransaction.count({ where: { organizationId, status: "REQUESTED" } }), prisma.complianceDocument.count({ where: { organizationId, expiryDate: { lte: thirtyDaysFromNow } } }),
    prisma.fuelTransaction.aggregate({ where: { organizationId, status: "ISSUED", issuedAt: { gte: thirtyDaysAgo } }, _sum: { totalCost: true } }),
    prisma.maintenanceWorkOrder.aggregate({ where: { organizationId, status: "CLOSED", releasedAt: { gte: ninetyDaysAgo } }, _sum: { totalCost: true } }),
    prisma.incidentReport.count({ where: { organizationId, status: { not: "CLOSED" } } }), prisma.incidentReport.count({ where: { organizationId, status: { not: "CLOSED" }, severity: "CRITICAL" } }),
    prisma.operationalAlert.count({ where: { organizationId, status: { not: "CLOSED" } } }), prisma.operationalAlert.count({ where: { organizationId, status: { not: "CLOSED" }, severity: "CRITICAL" } }),
    prisma.tyreAsset.count({ where: { organizationId, status: "REPAIR" } }), prisma.procurementRequest.count({ where: { organizationId, status: { in: ["REQUESTED","APPROVED","ORDERED"] } } }),
    prisma.telemetrySnapshot.findMany({ where: { organizationId }, select: { vehicleId: true }, distinct: ["vehicleId"] }),
    prisma.dispatchPlan.count({ where:{ organizationId, status:"READY" } }), prisma.dispatchPlan.count({ where:{ organizationId, status:"BLOCKED" } }),
    prisma.operationalAlert.count({ where:{ organizationId, category:"GEOFENCE_BREACH", status:{ not:"CLOSED" } } }), prisma.vendor.count({ where:{ organizationId, status:"ACTIVE" } }),
    prisma.vehicleDisposal.count({ where:{ organizationId, status:{ in:["REQUESTED","APPROVED"] } } }), prisma.notificationDelivery.count({ where:{ organizationId, status:"PENDING" } }), prisma.notificationDelivery.count({ where:{ organizationId, status:"FAILED" } })
  ]);
  const statuses = await prisma.vehicle.groupBy({ by: ["status"], where: { organizationId, archivedAt: null }, orderBy: { status: "asc" }, _count: { _all: true } });
  return res.json({ vehicles, drivers, activeDrivers, licencesExpiringWithin90Days: licencesExpiring, branches, activeUsers: users, activeAssignments, activeTrips, pendingTripApprovals, inspectionFailuresLast30Days: inspectionFailures, activeMaintenance, maintenanceAwaitingApproval: maintenanceApprovals, maintenanceReadyForRelease: readyForRelease, pendingFuelApprovals, complianceDueWithin30Days: complianceDue30, fuelSpendLast30Days: Number(fuelSpend30._sum.totalCost ?? 0), maintenanceSpendLast90Days: Number(maintenanceSpend90._sum.totalCost ?? 0), openIncidents, criticalIncidents, openOperationalAlerts, criticalOperationalAlerts, tyresInRepair, pendingProcurement, telemetryReportingVehicles: telemetryVehicles.length, dispatchReady, dispatchBlocked, openGeofenceBreaches, activeVendors, pendingDisposals, pendingNotifications, failedNotifications, vehicleStatus: Object.fromEntries(statuses.map((row) => [row.status, row._count._all])) });
});
