import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { assertDriverAssignable, assertVehicleAssignable } from "../../domain/rules.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize.js";

export const assignmentsRouter = Router();
function routeId(value: string | string[] | undefined): string | null { return typeof value === "string" ? value : null; }

assignmentsRouter.get("/", requireAnyPermission(PERMISSIONS.ASSIGNMENT_VIEW, PERMISSIONS.ASSIGNMENT_VIEW_SELF), async (req, res) => {
  const canViewAll = req.auth!.permissions.has(PERMISSIONS.ASSIGNMENT_VIEW);
  let driverId: string | undefined;
  if (!canViewAll) {
    const driver = await prisma.driver.findFirst({ where: { organizationId: req.auth!.organizationId, userId: req.auth!.userId, archivedAt: null }, select: { id: true } });
    if (!driver) return res.json({ items: [] });
    driverId = driver.id;
  }
  const items = await prisma.vehicleAssignment.findMany({
    where: { organizationId: req.auth!.organizationId, ...(driverId ? { driverId } : {}) },
    include: {
      vehicle: { select: { id: true, registrationNumber: true, fleetNumber: true, make: true, model: true, status: true, currentOdometerKm: true } },
      driver: { select: { id: true, employeeNumber: true, fullName: true, status: true, licenceExpiry: true } },
      assignedBy: { select: { id: true, fullName: true } }, endedBy: { select: { id: true, fullName: true } }
    }, orderBy: { startAt: "desc" }, take: 100
  });
  return res.json({ items });
});

assignmentsRouter.post("/", requirePermission(PERMISSIONS.ASSIGNMENT_CREATE), async (req, res) => {
  const input = z.object({ vehicleId: z.string().uuid(), driverId: z.string().uuid(), assignmentType: z.enum(["PRIMARY", "TEMPORARY"]).default("PRIMARY"), purpose: z.string().min(2).max(500).optional(), startAt: z.coerce.date().optional(), handoverConfirmed: z.boolean().default(false) }).parse(req.body);
  const [vehicle, driver] = await Promise.all([
    prisma.vehicle.findFirst({ where: { id: input.vehicleId, organizationId: req.auth!.organizationId, archivedAt: null } }),
    prisma.driver.findFirst({ where: { id: input.driverId, organizationId: req.auth!.organizationId, archivedAt: null } })
  ]);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  if (!driver) return res.status(404).json({ error: "Driver not found." });
  assertVehicleAssignable(vehicle.status); assertDriverAssignable(driver.status, driver.licenceExpiry);
  const [vehicleAssignment, driverAssignment] = await Promise.all([
    prisma.vehicleAssignment.findFirst({ where: { vehicleId: vehicle.id, status: "ACTIVE" } }),
    prisma.vehicleAssignment.findFirst({ where: { driverId: driver.id, status: "ACTIVE" } })
  ]);
  if (vehicleAssignment) return res.status(409).json({ error: "Vehicle already has an active driver assignment." });
  if (driverAssignment) return res.status(409).json({ error: "Driver already has an active vehicle assignment." });
  const created = await prisma.$transaction(async (tx) => {
    const assignment = await tx.vehicleAssignment.create({ data: { organizationId: req.auth!.organizationId, vehicleId: vehicle.id, driverId: driver.id, assignmentType: input.assignmentType, purpose: input.purpose ?? null, startAt: input.startAt ?? new Date(), assignedByUserId: req.auth!.userId, handoverConfirmed: input.handoverConfirmed }, include: { vehicle: true, driver: true } });
    await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: "ASSIGNED" } }); return assignment;
  });
  await audit(req, { action: "CREATE", recordType: "VEHICLE_ASSIGNMENT", recordId: created.id, newValue: created }); return res.status(201).json(created);
});

assignmentsRouter.post("/:id/end", requirePermission(PERMISSIONS.ASSIGNMENT_END), async (req, res) => {
  const assignmentId = routeId(req.params.id); if (!assignmentId) return res.status(400).json({ error: "Invalid assignment id." });
  const input = z.object({ reason: z.string().min(3).max(500), handoverConfirmed: z.boolean().default(false) }).parse(req.body);
  const current = await prisma.vehicleAssignment.findFirst({ where: { id: assignmentId, organizationId: req.auth!.organizationId, status: "ACTIVE" }, include: { vehicle: true, trips: { where: { status: "ACTIVE" }, select: { id: true } } } });
  if (!current) return res.status(404).json({ error: "Active assignment not found." });
  if (current.trips.length > 0 || current.vehicle.status === "ON_TRIP") return res.status(409).json({ error: "Cannot end an assignment while the vehicle has an active trip." });
  const ended = await prisma.$transaction(async (tx) => {
    const assignment = await tx.vehicleAssignment.update({ where: { id: current.id }, data: { status: "ENDED", endAt: new Date(), endedByUserId: req.auth!.userId, handoverConfirmed: input.handoverConfirmed } });
    if (current.vehicle.status === "ASSIGNED") await tx.vehicle.update({ where: { id: current.vehicleId }, data: { status: "AVAILABLE" } });
    return assignment;
  });
  await audit(req, { action: "UPDATE", recordType: "VEHICLE_ASSIGNMENT", recordId: ended.id, oldValue: current, newValue: ended, reason: input.reason }); return res.json(ended);
});
