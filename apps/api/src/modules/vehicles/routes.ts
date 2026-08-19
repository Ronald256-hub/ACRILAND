import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { canTransitionVehicle, validateOdometer, type VehicleStatus } from "../../domain/rules.js";
import { requirePermission } from "../../middleware/authorize.js";
import { assertTenantReferences } from "../../lib/tenantRefs.js";

export const vehiclesRouter = Router();
const base = z.object({
  registrationNumber: z.string().min(2).max(30),
  fleetNumber: z.string().max(30).optional(),
  vin: z.string().min(5).max(50),
  engineNumber: z.string().max(50).optional(),
  make: z.string().min(2).max(60),
  model: z.string().min(1).max(60),
  variant: z.string().max(60).optional(),
  category: z.string().min(2).max(60),
  bodyType: z.string().max(60).optional(),
  manufacturingYear: z.number().int().min(1950).max(new Date().getFullYear() + 1),
  registrationYear: z.number().int().min(1950).max(new Date().getFullYear() + 1).optional(),
  fuelType: z.enum(["DIESEL", "PETROL", "ELECTRIC", "HYBRID", "LPG", "CNG", "OTHER"]),
  transmission: z.enum(["MANUAL", "AUTOMATIC", "AMT", "CVT", "OTHER"]).optional(),
  tankCapacityLitres: z.number().positive().max(5000).optional(),
  initialOdometerKm: z.number().int().min(0).default(0),
  currentOdometerKm: z.number().int().min(0).default(0),
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  currentLocation: z.string().max(200).optional(),
  notes: z.string().max(2000).optional()
});

function routeVehicleId(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

vehiclesRouter.get("/", requirePermission(PERMISSIONS.VEHICLE_VIEW), async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const take = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
  const q = String(req.query.q ?? "").trim();
  const where = {
    organizationId: req.auth!.organizationId,
    archivedAt: null,
    ...(q ? { OR: [
      { registrationNumber: { contains: q, mode: "insensitive" as const } },
      { fleetNumber: { contains: q, mode: "insensitive" as const } },
      { vin: { contains: q, mode: "insensitive" as const } },
      { make: { contains: q, mode: "insensitive" as const } },
      { model: { contains: q, mode: "insensitive" as const } }
    ] } : {})
  };
  const [items, total] = await prisma.$transaction([
    prisma.vehicle.findMany({ where, skip: (page - 1) * take, take, orderBy: { registrationNumber: "asc" }, include: { branch: true, department: true } }),
    prisma.vehicle.count({ where })
  ]);
  const ids=items.map(item=>item.id);let healthRows:Array<{id:string;healthState:string;healthUpdatedAt:Date|null}>=[];
  if(ids.length){const idList=Prisma.join(ids.map(id=>Prisma.sql`${id}::uuid`));healthRows=await prisma.$queryRaw(Prisma.sql`SELECT "id","healthState","healthUpdatedAt" FROM "Vehicle" WHERE "organizationId"=${req.auth!.organizationId}::uuid AND "id" IN (${idList})`);}
  const healthMap=new Map(healthRows.map(row=>[row.id,row]));
  return res.json({ items:items.map(item=>({...item,healthState:healthMap.get(item.id)?.healthState??"UNKNOWN",healthUpdatedAt:healthMap.get(item.id)?.healthUpdatedAt??null})), total, page, limit: take });
});

vehiclesRouter.post("/", requirePermission(PERMISSIONS.VEHICLE_CREATE), async (req, res) => {
  const input = base.parse(req.body);
  validateOdometer(input.initialOdometerKm, input.currentOdometerKm);
  await assertTenantReferences(req.auth!.organizationId, input.branchId, input.departmentId);

  const data: Prisma.VehicleUncheckedCreateInput = {
    organizationId: req.auth!.organizationId,
    registrationNumber: input.registrationNumber.toUpperCase(),
    fleetNumber: input.fleetNumber ?? null,
    vin: input.vin.toUpperCase(),
    engineNumber: input.engineNumber ?? null,
    make: input.make,
    model: input.model,
    variant: input.variant ?? null,
    category: input.category,
    bodyType: input.bodyType ?? null,
    manufacturingYear: input.manufacturingYear,
    registrationYear: input.registrationYear ?? null,
    fuelType: input.fuelType,
    transmission: input.transmission ?? null,
    tankCapacityLitres: input.tankCapacityLitres ?? null,
    initialOdometerKm: input.initialOdometerKm,
    currentOdometerKm: input.currentOdometerKm,
    branchId: input.branchId ?? null,
    departmentId: input.departmentId ?? null,
    currentLocation: input.currentLocation ?? null,
    notes: input.notes ?? null
  };
  const row = await prisma.vehicle.create({ data });
  await audit(req, { action: "CREATE", recordType: "VEHICLE", recordId: row.id, newValue: row });
  return res.status(201).json(row);
});

vehiclesRouter.patch("/:id", requirePermission(PERMISSIONS.VEHICLE_EDIT), async (req, res) => {
  const input = base.partial().extend({
    status: z.enum(["AVAILABLE", "RESERVED", "ASSIGNED", "ON_TRIP", "PARKED", "SERVICE_DUE", "SERVICE_OVERDUE", "UNDER_INSPECTION", "UNDER_MAINTENANCE", "BREAKDOWN", "ACCIDENT", "GROUNDED", "OUT_OF_SERVICE", "DISPOSED"]).optional(),
    reason: z.string().max(500).optional()
  }).parse(req.body);
  const vehicleId = routeVehicleId(req.params.id);
  if (!vehicleId) return res.status(400).json({ error: "Invalid vehicle id." });
  const current = await prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId: req.auth!.organizationId, archivedAt: null } });
  if (!current) return res.status(404).json({ error: "Vehicle not found." });

  const initial = input.initialOdometerKm ?? current.initialOdometerKm;
  const currentOdo = input.currentOdometerKm ?? current.currentOdometerKm;
  validateOdometer(initial, currentOdo);
  await assertTenantReferences(req.auth!.organizationId, input.branchId ?? current.branchId ?? undefined, input.departmentId ?? current.departmentId ?? undefined);
  if (input.status && !canTransitionVehicle(current.status as VehicleStatus, input.status as VehicleStatus)) {
    return res.status(409).json({ error: `Vehicle status cannot move directly from ${current.status} to ${input.status}.` });
  }
  if (input.status && input.status !== current.status && ["GROUNDED", "OUT_OF_SERVICE", "DISPOSED"].includes(input.status) && !input.reason) {
    return res.status(400).json({ error: "A reason is required for this status change." });
  }

  const data: Prisma.VehicleUncheckedUpdateInput = {};
  if (input.registrationNumber !== undefined) data.registrationNumber = input.registrationNumber.toUpperCase();
  if (input.fleetNumber !== undefined) data.fleetNumber = input.fleetNumber;
  if (input.vin !== undefined) data.vin = input.vin.toUpperCase();
  if (input.engineNumber !== undefined) data.engineNumber = input.engineNumber;
  if (input.make !== undefined) data.make = input.make;
  if (input.model !== undefined) data.model = input.model;
  if (input.variant !== undefined) data.variant = input.variant;
  if (input.category !== undefined) data.category = input.category;
  if (input.bodyType !== undefined) data.bodyType = input.bodyType;
  if (input.manufacturingYear !== undefined) data.manufacturingYear = input.manufacturingYear;
  if (input.registrationYear !== undefined) data.registrationYear = input.registrationYear;
  if (input.fuelType !== undefined) data.fuelType = input.fuelType;
  if (input.transmission !== undefined) data.transmission = input.transmission;
  if (input.tankCapacityLitres !== undefined) data.tankCapacityLitres = input.tankCapacityLitres;
  if (input.initialOdometerKm !== undefined) data.initialOdometerKm = input.initialOdometerKm;
  if (input.currentOdometerKm !== undefined) data.currentOdometerKm = input.currentOdometerKm;
  if (input.branchId !== undefined) data.branchId = input.branchId;
  if (input.departmentId !== undefined) data.departmentId = input.departmentId;
  if (input.currentLocation !== undefined) data.currentLocation = input.currentLocation;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.status !== undefined) data.status = input.status;

  const updated = await prisma.vehicle.update({ where: { id: current.id }, data });
  await audit(req, {
    action: "UPDATE",
    recordType: "VEHICLE",
    recordId: current.id,
    oldValue: current,
    newValue: updated,
    ...(input.reason !== undefined ? { reason: input.reason } : {})
  });
  return res.json(updated);
});
