import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const workspaceRouter = Router();
const num = (value: unknown) => Number(value ?? 0);
const dayMs = 86_400_000;

workspaceRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ query: q, items: [] });
  const organizationId = req.auth!.organizationId;
  const p = req.auth!.permissions;
  const items: Array<{ type: string; id: string; title: string; subtitle: string; status?: string; href: string }> = [];
  if (p.has(PERMISSIONS.VEHICLE_VIEW)) {
    const rows = await prisma.vehicle.findMany({ where: { organizationId, archivedAt: null, OR: [{ registrationNumber: { contains: q, mode: "insensitive" } }, { fleetNumber: { contains: q, mode: "insensitive" } }, { vin: { contains: q, mode: "insensitive" } }, { make: { contains: q, mode: "insensitive" } }, { model: { contains: q, mode: "insensitive" } }] }, select: { id: true, registrationNumber: true, fleetNumber: true, make: true, model: true, status: true }, take: 6, orderBy: { registrationNumber: "asc" } });
    items.push(...rows.map((row) => ({ type: "VEHICLE", id: row.id, title: row.registrationNumber, subtitle: `${row.make} ${row.model}${row.fleetNumber ? ` · ${row.fleetNumber}` : ""}`, status: row.status, href: `/vehicles/${row.id}` })));
  }
  if (p.has(PERMISSIONS.DRIVER_VIEW)) {
    const rows = await prisma.driver.findMany({ where: { organizationId, archivedAt: null, OR: [{ fullName: { contains: q, mode: "insensitive" } }, { employeeNumber: { contains: q, mode: "insensitive" } }, { licenceNumber: { contains: q, mode: "insensitive" } }] }, select: { id: true, fullName: true, employeeNumber: true, licenceNumber: true, status: true }, take: 6, orderBy: { fullName: "asc" } });
    items.push(...rows.map((row) => ({ type: "DRIVER", id: row.id, title: row.fullName, subtitle: `${row.employeeNumber} · Licence ${row.licenceNumber}`, status: row.status, href: `/drivers/${row.id}` })));
  }
  if (p.has(PERMISSIONS.TRIP_VIEW)) {
    const rows = await prisma.trip.findMany({ where: { organizationId, OR: [{ tripNumber: { contains: q, mode: "insensitive" } }, { purpose: { contains: q, mode: "insensitive" } }, { origin: { contains: q, mode: "insensitive" } }, { destination: { contains: q, mode: "insensitive" } }] }, select: { id: true, tripNumber: true, purpose: true, origin: true, destination: true, status: true }, take: 6, orderBy: { createdAt: "desc" } });
    items.push(...rows.map((row) => ({ type: "TRIP", id: row.id, title: row.tripNumber, subtitle: `${row.origin} → ${row.destination} · ${row.purpose}`, status: row.status, href: "/trips" })));
  }
  if (p.has(PERMISSIONS.MAINTENANCE_VIEW)) {
    const rows = await prisma.maintenanceWorkOrder.findMany({ where: { organizationId, OR: [{ workOrderNumber: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }] }, select: { id: true, workOrderNumber: true, title: true, status: true }, take: 6, orderBy: { openedAt: "desc" } });
    items.push(...rows.map((row) => ({ type: "WORK_ORDER", id: row.id, title: row.workOrderNumber, subtitle: row.title, status: row.status, href: "/maintenance" })));
  }
  if (p.has(PERMISSIONS.INCIDENT_VIEW)) {
    const rows = await prisma.incidentReport.findMany({ where: { organizationId, OR: [{ incidentNumber: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, select: { id: true, incidentNumber: true, type: true, severity: true, status: true, location: true }, take: 6, orderBy: { occurredAt: "desc" } });
    items.push(...rows.map((row) => ({ type: "INCIDENT", id: row.id, title: row.incidentNumber, subtitle: `${row.type.replaceAll("_", " ")} · ${row.location} · ${row.severity}`, status: row.status, href: "/incidents" })));
  }
  if (p.has(PERMISSIONS.VENDOR_VIEW)) {
    const rows = await prisma.vendor.findMany({ where: { organizationId, OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }] }, select: { id: true, code: true, name: true, category: true, status: true }, take: 6, orderBy: { name: "asc" } });
    items.push(...rows.map((row) => ({ type: "VENDOR", id: row.id, title: row.name, subtitle: `${row.code} · ${row.category}`, status: row.status, href: "/vendors" })));
  }
  return res.json({ query: q, items: items.slice(0, 30) });
});

workspaceRouter.get("/vehicles/:id", requirePermission(PERMISSIONS.VEHICLE_VIEW), async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const organizationId = req.auth!.organizationId;
  const p = req.auth!.permissions;
  const vehicle = await prisma.vehicle.findFirst({ where: { id, organizationId, archivedAt: null }, include: { branch: true, department: true } });
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  const canAssignment = p.has(PERMISSIONS.ASSIGNMENT_VIEW);
  const canTrips = p.has(PERMISSIONS.TRIP_VIEW);
  const canMaintenance = p.has(PERMISSIONS.MAINTENANCE_VIEW);
  const canFuel = p.has(PERMISSIONS.FUEL_VIEW);
  const canCompliance = p.has(PERMISSIONS.COMPLIANCE_VIEW);
  const canTyres = p.has(PERMISSIONS.TYRE_VIEW);
  const canPm = p.has(PERMISSIONS.PM_VIEW);
  const canTelemetry = p.has(PERMISSIONS.TELEMETRY_VIEW);
  const canIncidents = p.has(PERMISSIONS.INCIDENT_VIEW);
  const canDispatch = p.has(PERMISSIONS.DISPATCH_VIEW);
  const canLifecycle = p.has(PERMISSIONS.LIFECYCLE_VIEW);
  const [assignment, trips, maintenance, fuel, compliance, tyres, pm, telemetry, incidents, dispatches, costs, disposal] = await Promise.all([
    canAssignment ? prisma.vehicleAssignment.findFirst({ where: { organizationId, vehicleId: id, status: "ACTIVE" }, include: { driver: { select: { id: true, fullName: true, employeeNumber: true, status: true, licenceExpiry: true } } }, orderBy: { startAt: "desc" } }) : Promise.resolve(null),
    canTrips ? prisma.trip.findMany({ where: { organizationId, vehicleId: id }, select: { id: true, tripNumber: true, purpose: true, origin: true, destination: true, status: true, requestedDeparture: true, actualDeparture: true, actualReturn: true, distanceKm: true, driver: { select: { id: true, fullName: true } } }, orderBy: { requestedDeparture: "desc" }, take: 12 }) : Promise.resolve([]),
    canMaintenance ? prisma.maintenanceWorkOrder.findMany({ where: { organizationId, vehicleId: id }, orderBy: { openedAt: "desc" }, take: 12 }) : Promise.resolve([]),
    canFuel ? prisma.fuelTransaction.findMany({ where: { organizationId, vehicleId: id }, orderBy: { requestedAt: "desc" }, take: 15 }) : Promise.resolve([]),
    canCompliance ? prisma.complianceDocument.findMany({ where: { organizationId, vehicleId: id }, orderBy: { expiryDate: "asc" } }) : Promise.resolve([]),
    canTyres ? prisma.tyreAsset.findMany({ where: { organizationId, currentVehicleId: id, status: "FITTED" }, orderBy: { position: "asc" } }) : Promise.resolve([]),
    canPm ? prisma.preventiveMaintenancePlan.findMany({ where: { organizationId, vehicleId: id, status: "ACTIVE" }, orderBy: { nextDueAt: "asc" } }) : Promise.resolve([]),
    canTelemetry ? prisma.telemetrySnapshot.findFirst({ where: { organizationId, vehicleId: id }, orderBy: { recordedAt: "desc" } }) : Promise.resolve(null),
    canIncidents ? prisma.incidentReport.findMany({ where: { organizationId, vehicleId: id }, orderBy: { occurredAt: "desc" }, take: 10 }) : Promise.resolve([]),
    canDispatch ? prisma.dispatchPlan.findMany({ where: { organizationId, vehicleId: id }, orderBy: { plannedDeparture: "desc" }, take: 10 }) : Promise.resolve([]),
    canLifecycle ? prisma.vehicleCostEntry.findMany({ where: { organizationId, vehicleId: id }, orderBy: { occurredAt: "desc" }, take: 100 }) : Promise.resolve([]),
    canLifecycle ? prisma.vehicleDisposal.findFirst({ where: { organizationId, vehicleId: id, status: { in: ["REQUESTED", "APPROVED"] } }, orderBy: { requestedAt: "desc" } }) : Promise.resolve(null)
  ]);
  let economics: { acquisition: number; fuelSpend: number; fuelLitres: number; maintenanceSpend: number; explicitCost: number; tco: number; costPerKm: number | null } | null = null;
  if (canLifecycle) {
    const [issuedFuel, closedMaintenance] = await Promise.all([
      prisma.fuelTransaction.aggregate({ where: { organizationId, vehicleId: id, status: "ISSUED" }, _sum: { totalCost: true, issuedLitres: true } }),
      prisma.maintenanceWorkOrder.aggregate({ where: { organizationId, vehicleId: id, status: "CLOSED" }, _sum: { totalCost: true } })
    ]);
    const explicitCost = costs.reduce((sum, row) => sum + num(row.amount), 0);
    const acquisition = num(vehicle.purchasePrice);
    const fuelSpend = num(issuedFuel._sum.totalCost);
    const maintenanceSpend = num(closedMaintenance._sum.totalCost);
    const tco = acquisition + fuelSpend + maintenanceSpend + explicitCost;
    economics = { acquisition, fuelSpend, fuelLitres: num(issuedFuel._sum.issuedLitres), maintenanceSpend, explicitCost, tco, costPerKm: vehicle.currentOdometerKm > vehicle.initialOdometerKm ? tco / (vehicle.currentOdometerKm - vehicle.initialOdometerKm) : null };
  }
  return res.json({ vehicle, assignment, trips, maintenance, fuel, compliance, tyres, preventiveMaintenance: pm, telemetry, incidents, dispatches, costs, disposal, economics, access: { assignment: canAssignment, trips: canTrips, maintenance: canMaintenance, fuel: canFuel, compliance: canCompliance, tyres: canTyres, preventiveMaintenance: canPm, telemetry: canTelemetry, incidents: canIncidents, dispatch: canDispatch, lifecycle: canLifecycle } });
});

workspaceRouter.get("/drivers/:id", requirePermission(PERMISSIONS.DRIVER_VIEW), async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const organizationId = req.auth!.organizationId;
  const p = req.auth!.permissions;
  const driver = await prisma.driver.findFirst({ where: { id, organizationId, archivedAt: null }, include: { branch: true, department: true, user: { select: { id: true, email: true, status: true, lastLoginAt: true } } } });
  if (!driver) return res.status(404).json({ error: "Driver not found." });
  const canAssignment = p.has(PERMISSIONS.ASSIGNMENT_VIEW);
  const canTrips = p.has(PERMISSIONS.TRIP_VIEW);
  const canSafety = p.has(PERMISSIONS.SAFETY_VIEW);
  const canIncidents = p.has(PERMISSIONS.INCIDENT_VIEW);
  const canInspections = p.has(PERMISSIONS.INSPECTION_VIEW);
  const canFuel = p.has(PERMISSIONS.FUEL_VIEW);
  const canDispatch = p.has(PERMISSIONS.DISPATCH_VIEW);
  const [assignment, trips, score, safetyEvents, incidents, inspections, fuel, dispatches] = await Promise.all([
    canAssignment ? prisma.vehicleAssignment.findFirst({ where: { organizationId, driverId: id, status: "ACTIVE" }, include: { vehicle: { select: { id: true, registrationNumber: true, fleetNumber: true, make: true, model: true, status: true, currentOdometerKm: true } } }, orderBy: { startAt: "desc" } }) : Promise.resolve(null),
    canTrips ? prisma.trip.findMany({ where: { organizationId, driverId: id }, select: { id: true, tripNumber: true, purpose: true, origin: true, destination: true, status: true, requestedDeparture: true, actualDeparture: true, actualReturn: true, distanceKm: true }, orderBy: { requestedDeparture: "desc" }, take: 15 }) : Promise.resolve([]),
    canSafety ? prisma.driverScoreSnapshot.findFirst({ where: { organizationId, driverId: id }, orderBy: { calculatedAt: "desc" } }) : Promise.resolve(null),
    canSafety ? prisma.driverSafetyEvent.findMany({ where: { organizationId, driverId: id }, orderBy: { occurredAt: "desc" }, take: 20 }) : Promise.resolve([]),
    canIncidents ? prisma.incidentReport.findMany({ where: { organizationId, driverId: id }, orderBy: { occurredAt: "desc" }, take: 10 }) : Promise.resolve([]),
    canInspections ? prisma.vehicleInspection.findMany({ where: { organizationId, driverId: id }, select: { id: true, type: true, status: true, odometerKm: true, completedAt: true, createdAt: true, vehicle: { select: { registrationNumber: true } } }, orderBy: { createdAt: "desc" }, take: 15 }) : Promise.resolve([]),
    canFuel ? prisma.fuelTransaction.findMany({ where: { organizationId, driverId: id }, select: { id: true, requestNumber: true, status: true, requestedLitres: true, issuedLitres: true, totalCost: true, requestedAt: true, vehicle: { select: { registrationNumber: true } } }, orderBy: { requestedAt: "desc" }, take: 15 }) : Promise.resolve([]),
    canDispatch ? prisma.dispatchPlan.findMany({ where: { organizationId, driverId: id }, orderBy: { plannedDeparture: "desc" }, take: 10 }) : Promise.resolve([])
  ]);
  const { photoUrl, ...safeDriver } = driver;
  const totalDistance = trips.reduce((sum, row) => sum + (row.distanceKm ?? 0), 0);
  const completedTrips = trips.filter((row) => row.status === "CLOSED").length;
  const failedInspections = inspections.filter((row) => row.status === "FAILED").length;
  return res.json({ driver: { ...safeDriver, photoAvailable: Boolean(photoUrl), photoEndpoint: photoUrl ? `/api/drivers/${driver.id}/photo?v=${driver.updatedAt.getTime()}` : null }, assignment, trips, score, safetyEvents, incidents, inspections, fuel, dispatches, summary: { totalDistanceKm: totalDistance, completedTrips, failedInspections, openIncidents: incidents.filter((row) => row.status !== "CLOSED").length, licenceDaysRemaining: Math.ceil((driver.licenceExpiry.getTime() - Date.now()) / dayMs) }, access: { assignment: canAssignment, trips: canTrips, safety: canSafety, incidents: canIncidents, inspections: canInspections, fuel: canFuel, dispatch: canDispatch } });
});

workspaceRouter.get("/action-centre", requirePermission(PERMISSIONS.DASHBOARD_VIEW), async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const p = req.auth!.permissions;
  const items: Array<{ type: string; id: string; title: string; subtitle: string; severity: "INFO" | "WARNING" | "CRITICAL"; href: string; createdAt: Date }> = [];
  if (p.has(PERMISSIONS.ALERT_VIEW)) {
    const rows = await prisma.operationalAlert.findMany({ where: { organizationId, status: { not: "CLOSED" } }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], take: 12 });
    items.push(...rows.map((row) => ({ type: "ALERT", id: row.id, title: row.title, subtitle: row.message, severity: row.severity, href: "/operational-alerts", createdAt: row.createdAt })));
  }
  if (p.has(PERMISSIONS.TRIP_APPROVE)) {
    const rows = await prisma.trip.findMany({ where: { organizationId, status: "REQUESTED" }, orderBy: { createdAt: "asc" }, take: 8 });
    items.push(...rows.map((row) => ({ type: "TRIP_APPROVAL", id: row.id, title: `${row.tripNumber} awaiting approval`, subtitle: `${row.origin} → ${row.destination} · ${row.purpose}`, severity: "WARNING" as const, href: "/trips", createdAt: row.createdAt })));
  }
  if (p.has(PERMISSIONS.FUEL_APPROVE)) {
    const rows = await prisma.fuelTransaction.findMany({ where: { organizationId, status: "REQUESTED" }, orderBy: { requestedAt: "asc" }, take: 8 });
    items.push(...rows.map((row) => ({ type: "FUEL_APPROVAL", id: row.id, title: `${row.requestNumber} awaiting fuel approval`, subtitle: `${num(row.requestedLitres).toLocaleString()} L requested`, severity: "WARNING" as const, href: "/fuel", createdAt: row.requestedAt })));
  }
  if (p.has(PERMISSIONS.MAINTENANCE_APPROVE)) {
    const rows = await prisma.maintenanceWorkOrder.findMany({ where: { organizationId, status: "AWAITING_APPROVAL" }, orderBy: { openedAt: "asc" }, take: 8 });
    items.push(...rows.map((row) => ({ type: "MAINTENANCE_APPROVAL", id: row.id, title: `${row.workOrderNumber} awaiting repair approval`, subtitle: `${row.title} · estimated ${num(row.estimatedCost).toLocaleString()} UGX`, severity: row.priority === "CRITICAL" ? "CRITICAL" as const : "WARNING" as const, href: "/maintenance", createdAt: row.openedAt })));
  }
  if (p.has(PERMISSIONS.PROCUREMENT_APPROVE)) {
    const rows = await prisma.procurementRequest.findMany({ where: { organizationId, status: "REQUESTED" }, orderBy: { createdAt: "asc" }, take: 8 });
    items.push(...rows.map((row) => ({ type: "PROCUREMENT_APPROVAL", id: row.id, title: `${row.requestNumber} awaiting procurement approval`, subtitle: row.justification, severity: "WARNING" as const, href: "/inventory", createdAt: row.createdAt })));
  }
  if (p.has(PERMISSIONS.DISPOSAL_APPROVE)) {
    const rows = await prisma.vehicleDisposal.findMany({ where: { organizationId, status: "REQUESTED" }, orderBy: { requestedAt: "asc" }, take: 8 });
    items.push(...rows.map((row) => ({ type: "DISPOSAL_APPROVAL", id: row.id, title: "Vehicle disposal awaiting decision", subtitle: row.reason, severity: "WARNING" as const, href: "/lifecycle", createdAt: row.requestedAt })));
  }
  items.sort((a, b) => (a.severity === b.severity ? b.createdAt.getTime() - a.createdAt.getTime() : ({ CRITICAL: 0, WARNING: 1, INFO: 2 }[a.severity] - { CRITICAL: 0, WARNING: 1, INFO: 2 }[b.severity])));
  return res.json({ items: items.slice(0, 30), summary: { total: items.length, critical: items.filter((row) => row.severity === "CRITICAL").length, approvals: items.filter((row) => row.type.endsWith("APPROVAL")).length } });
});

workspaceRouter.get("/settings", requirePermission(PERMISSIONS.DASHBOARD_VIEW), async (req, res) => {
  const organization = await prisma.organization.findUnique({ where: { id: req.auth!.organizationId }, select: { id: true, name: true, slug: true, currency: true, timezone: true, isActive: true, createdAt: true, updatedAt: true } });
  const [branches, departments, activeUsers, lockedUsers, activeSessions] = await Promise.all([
    prisma.branch.count({ where: { organizationId: req.auth!.organizationId, isActive: true } }),
    prisma.department.count({ where: { organizationId: req.auth!.organizationId, isActive: true } }),
    prisma.user.count({ where: { organizationId: req.auth!.organizationId, status: "ACTIVE", archivedAt: null } }),
    prisma.user.count({ where: { organizationId: req.auth!.organizationId, status: "LOCKED", archivedAt: null } }),
    prisma.session.count({ where: { user: { organizationId: req.auth!.organizationId }, revokedAt: null, expiresAt: { gt: new Date() } } })
  ]);
  return res.json({ organization, security: { activeUsers, lockedUsers, activeSessions }, structure: { branches, departments } });
});

workspaceRouter.patch("/settings", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const input = z.object({ name: z.string().min(2).max(160).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), timezone: z.string().min(3).max(80).optional() }).parse(req.body);
  const current = await prisma.organization.findUnique({ where: { id: req.auth!.organizationId } });
  if (!current) return res.status(404).json({ error: "Organization not found." });
  const data: Prisma.OrganizationUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.timezone !== undefined) data.timezone = input.timezone;
  const updated = await prisma.organization.update({ where: { id: current.id }, data });
  await audit(req, { action: "UPDATE", recordType: "ORGANIZATION_SETTINGS", recordId: current.id, oldValue: { name: current.name, currency: current.currency, timezone: current.timezone }, newValue: { name: updated.name, currency: updated.currency, timezone: updated.timezone } });
  return res.json(updated);
});
