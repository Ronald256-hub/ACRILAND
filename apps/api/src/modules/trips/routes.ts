import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { assertDifferentApprover, assertDriverAssignable, assertVehicleAssignable, validateOdometer, validateTripOdometers, BusinessRuleError } from "../../domain/rules.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize.js";
import { assertTenantReferences } from "../../lib/tenantRefs.js";

export const tripsRouter = Router();
function routeId(value: string | string[] | undefined): string | null { return typeof value === "string" ? value : null; }
function newTripNumber(): string { const day = new Date().toISOString().slice(0, 10).replaceAll("-", ""); return `TRP-${day}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function enforceDriverTripOwnership(req: Request, trip: { driver: { userId: string | null } | null }): void { if (req.auth!.roles.includes("DRIVER") && trip.driver?.userId !== req.auth!.userId) throw new BusinessRuleError("Drivers may only operate trips assigned to them.", 403); }

tripsRouter.get("/", requireAnyPermission(PERMISSIONS.TRIP_VIEW, PERMISSIONS.TRIP_VIEW_SELF), async (req, res) => {
  const canViewAll = req.auth!.permissions.has(PERMISSIONS.TRIP_VIEW);
  const where = { organizationId: req.auth!.organizationId, ...(!canViewAll ? { OR: [{ requesterUserId: req.auth!.userId }, { driver: { is: { userId: req.auth!.userId } } }] } : {}) };
  const items = await prisma.trip.findMany({ where, include: { vehicle: { select: { id: true, registrationNumber: true, make: true, model: true, status: true, currentOdometerKm: true } }, driver: { select: { id: true, employeeNumber: true, fullName: true, status: true, licenceExpiry: true, userId: true } }, requester: { select: { id: true, fullName: true } }, approvedBy: { select: { id: true, fullName: true } }, department: { select: { id: true, name: true } }, approvals: { orderBy: { createdAt: "asc" } } }, orderBy: { requestedDeparture: "desc" }, take: 100 });
  return res.json({ items });
});

tripsRouter.post("/", requirePermission(PERMISSIONS.TRIP_REQUEST), async (req, res) => {
  const input = z.object({ departmentId: z.string().uuid().optional(), purpose: z.string().min(3).max(1000), origin: z.string().min(2).max(300), destination: z.string().min(2).max(300), intermediateStops: z.array(z.string().min(1).max(300)).max(20).default([]), requestedDeparture: z.coerce.date(), expectedReturn: z.coerce.date(), passengerCount: z.number().int().min(0).max(100).default(0), cargoInfo: z.string().max(1000).optional(), notes: z.string().max(2000).optional() }).parse(req.body);
  if (input.expectedReturn < input.requestedDeparture) return res.status(400).json({ error: "Expected return cannot be earlier than requested departure." });
  if (input.departmentId) await assertTenantReferences(req.auth!.organizationId, undefined, input.departmentId);
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { departmentId: true } });
  const created = await prisma.trip.create({ data: { organizationId: req.auth!.organizationId, tripNumber: newTripNumber(), requesterUserId: req.auth!.userId, departmentId: input.departmentId ?? requester.departmentId ?? null, purpose: input.purpose, origin: input.origin, destination: input.destination, intermediateStops: input.intermediateStops, requestedDeparture: input.requestedDeparture, expectedReturn: input.expectedReturn, passengerCount: input.passengerCount, cargoInfo: input.cargoInfo ?? null, notes: input.notes ?? null, approvals: { create: { stage: "FLEET_MANAGER", decision: "PENDING" } } }, include: { approvals: true } });
  await audit(req, { action: "CREATE", recordType: "TRIP", recordId: created.id, newValue: created }); return res.status(201).json(created);
});

tripsRouter.post("/:id/decision", requirePermission(PERMISSIONS.TRIP_APPROVE), async (req, res) => {
  const tripId = routeId(req.params.id); if (!tripId) return res.status(400).json({ error: "Invalid trip id." });
  const input = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), comments: z.string().max(1000).optional() }).parse(req.body);
  const trip = await prisma.trip.findFirst({ where: { id: tripId, organizationId: req.auth!.organizationId }, include: { approvals: { where: { decision: "PENDING" }, orderBy: { createdAt: "asc" }, take: 1 } } });
  if (!trip) return res.status(404).json({ error: "Trip request not found." });
  if (trip.status !== "REQUESTED") return res.status(409).json({ error: "Only requested trips can be approved or rejected." });
  assertDifferentApprover(trip.requesterUserId, req.auth!.userId); const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    if (trip.approvals[0]) await tx.tripApproval.update({ where: { id: trip.approvals[0].id }, data: { decision: input.decision, approverUserId: req.auth!.userId, comments: input.comments ?? null, decidedAt: now } });
    return tx.trip.update({ where: { id: trip.id }, data: input.decision === "APPROVED" ? { status: "APPROVED", approvedByUserId: req.auth!.userId, approvedAt: now, rejectionReason: null } : { status: "REJECTED", approvedByUserId: req.auth!.userId, approvedAt: now, rejectionReason: input.comments ?? "Rejected" } });
  });
  await audit(req, { action: input.decision === "APPROVED" ? "APPROVE" : "REJECT", recordType: "TRIP", recordId: trip.id, oldValue: { status: trip.status }, newValue: { status: updated.status }, ...(input.comments ? { reason: input.comments } : {}) }); return res.json(updated);
});

tripsRouter.post("/:id/allocate", requirePermission(PERMISSIONS.TRIP_ALLOCATE), async (req, res) => {
  const tripId = routeId(req.params.id); if (!tripId) return res.status(400).json({ error: "Invalid trip id." });
  const input = z.object({ vehicleId: z.string().uuid(), driverId: z.string().uuid() }).parse(req.body);
  const trip = await prisma.trip.findFirst({ where: { id: tripId, organizationId: req.auth!.organizationId } });
  if (!trip) return res.status(404).json({ error: "Trip not found." }); if (trip.status !== "APPROVED") return res.status(409).json({ error: "Trip must be approved before vehicle and driver allocation." });
  const [vehicle, driver, active] = await Promise.all([prisma.vehicle.findFirst({ where: { id: input.vehicleId, organizationId: req.auth!.organizationId, archivedAt: null } }), prisma.driver.findFirst({ where: { id: input.driverId, organizationId: req.auth!.organizationId, archivedAt: null } }), prisma.vehicleAssignment.findMany({ where: { status: "ACTIVE", OR: [{ vehicleId: input.vehicleId }, { driverId: input.driverId }] } })]);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." }); if (!driver) return res.status(404).json({ error: "Driver not found." });
  assertDriverAssignable(driver.status, driver.licenceExpiry);
  const matching = active.find((assignment) => assignment.vehicleId === vehicle.id && assignment.driverId === driver.id);
  if (active.length > 0 && !matching) return res.status(409).json({ error: "Vehicle or driver already has a different active assignment." });
  if (matching) { if (!["ASSIGNED", "SERVICE_DUE"].includes(vehicle.status)) return res.status(409).json({ error: `Assigned vehicle cannot be allocated to a trip while its status is ${vehicle.status}.` }); } else assertVehicleAssignable(vehicle.status);
  const updated = await prisma.$transaction(async (tx) => {
    let assignmentId = matching?.id;
    if (!assignmentId) { const assignment = await tx.vehicleAssignment.create({ data: { organizationId: req.auth!.organizationId, vehicleId: vehicle.id, driverId: driver.id, assignmentType: "TRIP", purpose: `Trip ${trip.tripNumber}`, assignedByUserId: req.auth!.userId, handoverConfirmed: false } }); assignmentId = assignment.id; await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: "ASSIGNED" } }); }
    return tx.trip.update({ where: { id: trip.id }, data: { vehicleId: vehicle.id, driverId: driver.id, assignmentId, status: "ALLOCATED" }, include: { vehicle: true, driver: true, assignment: true } });
  });
  await audit(req, { action: "UPDATE", recordType: "TRIP", recordId: trip.id, oldValue: { status: trip.status }, newValue: { status: updated.status, vehicleId: vehicle.id, driverId: driver.id } }); return res.json(updated);
});

tripsRouter.post("/:id/start", requirePermission(PERMISSIONS.TRIP_START), async (req, res) => {
  const tripId = routeId(req.params.id); if (!tripId) return res.status(400).json({ error: "Invalid trip id." });
  const input = z.object({ startingOdometerKm: z.number().int().min(0), startingFuelPercent: z.number().int().min(0).max(100).optional() }).parse(req.body);
  const trip = await prisma.trip.findFirst({ where: { id: tripId, organizationId: req.auth!.organizationId }, include: { vehicle: true, driver: true } });
  if (!trip || !trip.vehicle || !trip.driver) return res.status(404).json({ error: "Allocated trip not found." }); enforceDriverTripOwnership(req, trip);
  if (trip.status !== "READY_TO_DEPART") return res.status(409).json({ error: "Trip cannot start until the pre-trip inspection has passed." });
  assertDriverAssignable(trip.driver.status, trip.driver.licenceExpiry); validateOdometer(trip.vehicle.currentOdometerKm, input.startingOdometerKm);
  if (trip.vehicle.status !== "ASSIGNED") return res.status(409).json({ error: `Vehicle cannot depart while its status is ${trip.vehicle.status}.` });
  const updated = await prisma.$transaction(async (tx) => { await tx.vehicle.update({ where: { id: trip.vehicleId! }, data: { status: "ON_TRIP", currentOdometerKm: input.startingOdometerKm } }); return tx.trip.update({ where: { id: trip.id }, data: { status: "ACTIVE", actualDeparture: new Date(), startingOdometerKm: input.startingOdometerKm, startingFuelPercent: input.startingFuelPercent ?? null } }); });
  await audit(req, { action: "UPDATE", recordType: "TRIP", recordId: trip.id, oldValue: { status: trip.status }, newValue: { status: "ACTIVE", startingOdometerKm: input.startingOdometerKm } }); return res.json(updated);
});

tripsRouter.post("/:id/return", requirePermission(PERMISSIONS.TRIP_COMPLETE), async (req, res) => {
  const tripId = routeId(req.params.id); if (!tripId) return res.status(400).json({ error: "Invalid trip id." });
  const input = z.object({ endingOdometerKm: z.number().int().min(0), endingFuelPercent: z.number().int().min(0).max(100).optional(), notes: z.string().max(2000).optional() }).parse(req.body);
  const trip = await prisma.trip.findFirst({ where: { id: tripId, organizationId: req.auth!.organizationId }, include: { vehicle: true, driver: true } });
  if (!trip || !trip.vehicle || !trip.driver || trip.startingOdometerKm === null) return res.status(404).json({ error: "Active trip not found." }); enforceDriverTripOwnership(req, trip);
  if (trip.status !== "ACTIVE") return res.status(409).json({ error: "Only an active trip can be returned." });
  const distanceKm = validateTripOdometers(trip.startingOdometerKm, input.endingOdometerKm); validateOdometer(trip.vehicle.currentOdometerKm, input.endingOdometerKm);
  const updated = await prisma.$transaction(async (tx) => { await tx.vehicle.update({ where: { id: trip.vehicleId! }, data: { status: "ASSIGNED", currentOdometerKm: input.endingOdometerKm } }); return tx.trip.update({ where: { id: trip.id }, data: { status: "RETURNED", actualReturn: new Date(), endingOdometerKm: input.endingOdometerKm, distanceKm, endingFuelPercent: input.endingFuelPercent ?? null, notes: input.notes ?? trip.notes } }); });
  await audit(req, { action: "UPDATE", recordType: "TRIP", recordId: trip.id, oldValue: { status: trip.status }, newValue: { status: "RETURNED", endingOdometerKm: input.endingOdometerKm, distanceKm } }); return res.json(updated);
});

tripsRouter.post("/:id/close", requirePermission(PERMISSIONS.TRIP_CLOSE), async (req, res) => {
  const tripId = routeId(req.params.id); if (!tripId) return res.status(400).json({ error: "Invalid trip id." }); const input = z.object({ notes: z.string().max(2000).optional() }).parse(req.body);
  const trip = await prisma.trip.findFirst({ where: { id: tripId, organizationId: req.auth!.organizationId }, include: { vehicle: true, assignment: true, inspections: { where: { type: "POST_TRIP", status: { not: "IN_PROGRESS" } }, orderBy: { completedAt: "desc" }, take: 1 } } });
  if (!trip) return res.status(404).json({ error: "Trip not found." }); if (trip.status !== "POST_TRIP_INSPECTION") return res.status(409).json({ error: "Trip requires a completed post-trip inspection before closure." }); if (trip.inspections.length === 0) return res.status(409).json({ error: "Post-trip inspection record is missing." });
  const updated = await prisma.$transaction(async (tx) => { if (trip.assignment?.assignmentType === "TRIP" && trip.assignment.status === "ACTIVE") { await tx.vehicleAssignment.update({ where: { id: trip.assignment.id }, data: { status: "ENDED", endAt: new Date(), endedByUserId: req.auth!.userId } }); if (trip.vehicle && trip.vehicle.status === "ASSIGNED") await tx.vehicle.update({ where: { id: trip.vehicle.id }, data: { status: "AVAILABLE" } }); } return tx.trip.update({ where: { id: trip.id }, data: { status: "CLOSED", notes: input.notes ?? trip.notes } }); });
  await audit(req, { action: "UPDATE", recordType: "TRIP", recordId: trip.id, oldValue: { status: trip.status }, newValue: { status: "CLOSED" } }); return res.json(updated);
});
