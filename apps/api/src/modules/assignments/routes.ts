import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { assertDriverAssignable, assertVehicleAssignable } from "../../domain/rules.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize.js";
import { requireFreshMfa } from "../../middleware/mfa.js";

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

assignmentsRouter.post("/", requireFreshMfa, requirePermission(PERMISSIONS.ASSIGNMENT_CREATE), async (req, res) => {
  const input = z.object({
    vehicleId: z.string().uuid(),
    driverId: z.string().uuid(),
    assignmentType: z.enum(["PRIMARY", "TEMPORARY"]).default("PRIMARY"),
    purpose: z.string().min(2).max(500).optional(),
    startAt: z.coerce.date().optional(),
    handoverConfirmed: z.boolean().default(false)
  }).parse(req.body);

  const organizationId = req.auth!.organizationId;

  const created = await prisma.$transaction(async (tx) => {
    const vehicles = await tx.$queryRaw<Array<{
      id:string; status:string; archivedAt:Date|null; organizationId:string; currentOdometerKm:Prisma.Decimal;
    }>>(Prisma.sql`
      SELECT "id","status","archivedAt","organizationId","currentOdometerKm"
      FROM "Vehicle"
      WHERE "id"=${input.vehicleId}::uuid
        AND "organizationId"=${organizationId}::uuid
      FOR UPDATE
    `);
    const vehicle = vehicles[0];
    if (!vehicle || vehicle.archivedAt) return { kind:"vehicle_not_found" as const };

    const drivers = await tx.$queryRaw<Array<{
      id:string; status:string; archivedAt:Date|null; organizationId:string; licenceExpiry:Date;
    }>>(Prisma.sql`
      SELECT "id","status","archivedAt","organizationId","licenceExpiry"
      FROM "Driver"
      WHERE "id"=${input.driverId}::uuid
        AND "organizationId"=${organizationId}::uuid
      FOR UPDATE
    `);
    const driver = drivers[0];
    if (!driver || driver.archivedAt) return { kind:"driver_not_found" as const };

    assertVehicleAssignable(vehicle.status as any);
    assertDriverAssignable(driver.status as any, driver.licenceExpiry);

    const [vehicleAssignment, driverAssignment] = await Promise.all([
      tx.vehicleAssignment.findFirst({ where: { vehicleId: vehicle.id, status: "ACTIVE" }, select: { id:true } }),
      tx.vehicleAssignment.findFirst({ where: { driverId: driver.id, status: "ACTIVE" }, select: { id:true } })
    ]);
    if (vehicleAssignment) return { kind:"vehicle_busy" as const };
    if (driverAssignment) return { kind:"driver_busy" as const };

    const assignment = await tx.vehicleAssignment.create({
      data: {
        organizationId,
        vehicleId: vehicle.id,
        driverId: driver.id,
        assignmentType: input.assignmentType,
        purpose: input.purpose ?? null,
        startAt: input.startAt ?? new Date(),
        assignedByUserId: req.auth!.userId,
        handoverConfirmed: input.handoverConfirmed
      },
      include: { vehicle: true, driver: true }
    });
    await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: "ASSIGNED" } });
    return { kind:"created" as const, assignment };
  });

  if (created.kind === "vehicle_not_found") return res.status(404).json({ error: "Vehicle not found." });
  if (created.kind === "driver_not_found") return res.status(404).json({ error: "Driver not found." });
  if (created.kind === "vehicle_busy") return res.status(409).json({ error: "Vehicle already has an active driver assignment." });
  if (created.kind === "driver_busy") return res.status(409).json({ error: "Driver already has an active vehicle assignment." });

  await audit(req, { action: "CREATE", recordType: "VEHICLE_ASSIGNMENT", recordId: created.assignment.id, newValue: created.assignment });
  return res.status(201).json(created.assignment);
});

assignmentsRouter.post("/:id/end", requireFreshMfa, requirePermission(PERMISSIONS.ASSIGNMENT_END), async (req, res) => {
  const assignmentId = routeId(req.params.id);
  if (!assignmentId) return res.status(400).json({ error: "Invalid assignment id." });
  const input = z.object({ reason: z.string().min(3).max(500), handoverConfirmed: z.boolean().default(false) }).parse(req.body);
  const organizationId = req.auth!.organizationId;

  const ended = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{id:string;vehicleId:string;status:string}>>(Prisma.sql`
      SELECT "id","vehicleId","status"
      FROM "VehicleAssignment"
      WHERE "id"=${assignmentId}::uuid
        AND "organizationId"=${organizationId}::uuid
      FOR UPDATE
    `);
    const assignment = rows[0];
    if (!assignment || assignment.status !== "ACTIVE") return { kind:"not_found" as const };

    const tripRows = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id"
      FROM "Trip"
      WHERE "assignmentId"=${assignment.id}::uuid
        AND "status"="ACTIVE"
      LIMIT 1
    `);
    const vehicleRows = await tx.$queryRaw<Array<{id:string;status:string;archivedAt:Date|null}>>(Prisma.sql`
      SELECT "id","status","archivedAt"
      FROM "Vehicle"
      WHERE "id"=${assignment.vehicleId}::uuid
        AND "organizationId"=${organizationId}::uuid
      FOR UPDATE
    `);
    const vehicle = vehicleRows[0];
    if (!vehicle || vehicle.archivedAt) return { kind:"vehicle_not_found" as const };
    if (tripRows.length > 0 || vehicle.status === "ON_TRIP") return { kind:"active_trip" as const };

    const updated = await tx.vehicleAssignment.update({
      where: { id: assignment.id },
      data: { status:"ENDED", endAt:new Date(), endedByUserId:req.auth!.userId, handoverConfirmed:input.handoverConfirmed }
    });
    if (vehicle.status === "ASSIGNED") await tx.vehicle.update({ where:{id:vehicle.id}, data:{status:"AVAILABLE"} });
    return { kind:"ended" as const, updated, oldStatus:assignment.status };
  });

  if (ended.kind === "not_found") return res.status(404).json({ error: "Active assignment not found." });
  if (ended.kind === "vehicle_not_found") return res.status(404).json({ error: "Assigned vehicle not found." });
  if (ended.kind === "active_trip") return res.status(409).json({ error: "Cannot end an assignment while the vehicle has an active trip." });

  await audit(req, { action:"UPDATE", recordType:"VEHICLE_ASSIGNMENT", recordId:ended.updated.id, oldValue:{status:ended.oldStatus}, newValue:ended.updated, reason:input.reason });
  return res.json(ended.updated);
});
\n