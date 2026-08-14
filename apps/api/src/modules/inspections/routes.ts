import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { BusinessRuleError, evaluateInspectionResults, validateOdometer } from "../../domain/rules.js";
import { requirePermission } from "../../middleware/authorize.js";

export const inspectionsRouter = Router();
const itemResult = z.enum(["PASS", "ATTENTION_REQUIRED", "FAIL", "NOT_APPLICABLE"]);
const inspectionType = z.enum(["PRE_TRIP", "POST_TRIP", "DAILY", "WEEKLY", "WORKSHOP", "SAFETY", "HANDOVER"]);
function routeId(value: string | string[] | undefined): string | null { return typeof value === "string" ? value : null; }

inspectionsRouter.get("/templates", requirePermission(PERMISSIONS.INSPECTION_VIEW), async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : undefined; const parsedType = type ? inspectionType.safeParse(type) : null;
  if (type && !parsedType?.success) return res.status(400).json({ error: "Invalid inspection type." });
  const items = await prisma.inspectionTemplate.findMany({ where: { organizationId: req.auth!.organizationId, isActive: true, ...(parsedType?.success ? { type: parsedType.data } : {}) }, include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: [{ type: "asc" }, { name: "asc" }] }); return res.json({ items });
});

inspectionsRouter.post("/templates", requirePermission(PERMISSIONS.INSPECTION_TEMPLATE_MANAGE), async (req, res) => {
  const input = z.object({ name: z.string().min(3).max(120), type: inspectionType, description: z.string().max(1000).optional(), items: z.array(z.object({ code: z.string().min(2).max(60), label: z.string().min(2).max(200), description: z.string().max(500).optional(), isCritical: z.boolean().default(false), sortOrder: z.number().int().min(0).max(1000) })).min(1).max(100) }).parse(req.body);
  const codes = input.items.map((item) => item.code.toUpperCase()); if (new Set(codes).size !== codes.length) return res.status(400).json({ error: "Inspection item codes must be unique within a template." });
  const created = await prisma.inspectionTemplate.create({ data: { organizationId: req.auth!.organizationId, name: input.name, type: input.type, description: input.description ?? null, createdByUserId: req.auth!.userId, items: { create: input.items.map((item) => ({ code: item.code.toUpperCase(), label: item.label, description: item.description ?? null, isCritical: item.isCritical, sortOrder: item.sortOrder })) } }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  await audit(req, { action: "CREATE", recordType: "INSPECTION_TEMPLATE", recordId: created.id, newValue: created }); return res.status(201).json(created);
});

inspectionsRouter.get("/", requirePermission(PERMISSIONS.INSPECTION_VIEW), async (req, res) => {
  const ownOnly = req.auth!.roles.includes("DRIVER");
  const items = await prisma.vehicleInspection.findMany({ where: { organizationId: req.auth!.organizationId, ...(ownOnly ? { OR: [{ performedByUserId: req.auth!.userId }, { driver: { is: { userId: req.auth!.userId } } }] } : {}) }, include: { vehicle: { select: { registrationNumber: true, make: true, model: true } }, driver: { select: { fullName: true, employeeNumber: true } }, trip: { select: { id: true, tripNumber: true, status: true } }, template: { select: { name: true, type: true } }, results: true }, orderBy: { createdAt: "desc" }, take: 100 }); return res.json({ items });
});

inspectionsRouter.post("/", requirePermission(PERMISSIONS.INSPECTION_CREATE), async (req, res) => {
  const input = z.object({ templateId: z.string().uuid(), vehicleId: z.string().uuid(), tripId: z.string().uuid().optional(), odometerKm: z.number().int().min(0), notes: z.string().max(2000).optional(), results: z.array(z.object({ templateItemId: z.string().uuid(), result: itemResult, comment: z.string().max(1000).optional() })).min(1).max(100) }).parse(req.body);
  const [template, vehicle, trip, driverProfile] = await Promise.all([
    prisma.inspectionTemplate.findFirst({ where: { id: input.templateId, organizationId: req.auth!.organizationId, isActive: true }, include: { items: { orderBy: { sortOrder: "asc" } } } }),
    prisma.vehicle.findFirst({ where: { id: input.vehicleId, organizationId: req.auth!.organizationId, archivedAt: null } }),
    input.tripId ? prisma.trip.findFirst({ where: { id: input.tripId, organizationId: req.auth!.organizationId }, include: { driver: { select: { id: true, userId: true } } } }) : Promise.resolve(null),
    prisma.driver.findFirst({ where: { organizationId: req.auth!.organizationId, userId: req.auth!.userId, archivedAt: null }, select: { id: true } })
  ]);
  if (!template) return res.status(404).json({ error: "Inspection template not found." }); if (!vehicle) return res.status(404).json({ error: "Vehicle not found." }); if (input.tripId && !trip) return res.status(404).json({ error: "Trip not found." });
  if (trip && trip.vehicleId !== vehicle.id) return res.status(409).json({ error: "Inspection vehicle does not match the trip allocation." });
  if (req.auth!.roles.includes("DRIVER")) { if (trip) { if (trip.driver?.userId !== req.auth!.userId) throw new BusinessRuleError("Drivers may only inspect vehicles allocated to their own trip.", 403); } else { const active = driverProfile ? await prisma.vehicleAssignment.findFirst({ where: { driverId: driverProfile.id, vehicleId: vehicle.id, status: "ACTIVE" } }) : null; if (!active) throw new BusinessRuleError("Drivers may only inspect their currently assigned vehicle.", 403); } }
  if (trip && template.type === "PRE_TRIP" && !["ALLOCATED", "PRE_TRIP_INSPECTION"].includes(trip.status)) return res.status(409).json({ error: "Pre-trip inspection is not expected at the current trip stage." });
  if (trip && template.type === "POST_TRIP" && trip.status !== "RETURNED") return res.status(409).json({ error: "Post-trip inspection is only available after the vehicle returns." });
  if (trip && !["PRE_TRIP", "POST_TRIP"].includes(template.type)) return res.status(400).json({ error: "Trip-linked inspections must use a pre-trip or post-trip template." });
  validateOdometer(vehicle.currentOdometerKm, input.odometerKm);
  const submitted = new Map(input.results.map((result) => [result.templateItemId, result])); if (submitted.size !== input.results.length) return res.status(400).json({ error: "Each inspection item may be submitted only once." });
  if (template.items.length !== input.results.length || template.items.some((item) => !submitted.has(item.id))) return res.status(400).json({ error: "Every active template item must have exactly one inspection result." });
  const normalized = template.items.map((item) => { const result = submitted.get(item.id)!; return { templateItemId: item.id, labelSnapshot: item.label, result: result.result, isCritical: item.isCritical, comment: result.comment ?? null }; });
  const evaluation = evaluateInspectionResults(normalized); const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const inspection = await tx.vehicleInspection.create({ data: { organizationId: req.auth!.organizationId, vehicleId: vehicle.id, driverId: trip?.driverId ?? driverProfile?.id ?? null, tripId: trip?.id ?? null, templateId: template.id, type: template.type, odometerKm: input.odometerKm, status: evaluation.status, notes: input.notes ?? null, performedByUserId: req.auth!.userId, completedAt: now, results: { create: normalized } }, include: { results: true, template: true } });
    if (evaluation.criticalFailure) await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: "GROUNDED", currentOdometerKm: input.odometerKm } }); else if (input.odometerKm > vehicle.currentOdometerKm) await tx.vehicle.update({ where: { id: vehicle.id }, data: { currentOdometerKm: input.odometerKm } });
    if (trip && template.type === "PRE_TRIP") await tx.trip.update({ where: { id: trip.id }, data: { status: evaluation.hasFailure ? "PRE_TRIP_INSPECTION" : "READY_TO_DEPART" } });
    if (trip && template.type === "POST_TRIP") await tx.trip.update({ where: { id: trip.id }, data: { status: "POST_TRIP_INSPECTION" } }); return inspection;
  });
  await audit(req, { action: "CREATE", recordType: "VEHICLE_INSPECTION", recordId: created.id, newValue: { type: created.type, status: created.status, vehicleId: vehicle.id, tripId: trip?.id ?? null, criticalFailure: evaluation.criticalFailure } }); return res.status(201).json({ ...created, criticalFailure: evaluation.criticalFailure });
});

inspectionsRouter.get("/:id", requirePermission(PERMISSIONS.INSPECTION_VIEW), async (req, res) => {
  const inspectionId = routeId(req.params.id); if (!inspectionId) return res.status(400).json({ error: "Invalid inspection id." });
  const item = await prisma.vehicleInspection.findFirst({ where: { id: inspectionId, organizationId: req.auth!.organizationId }, include: { vehicle: true, driver: true, trip: true, template: true, results: true } });
  if (!item) return res.status(404).json({ error: "Inspection not found." }); if (req.auth!.roles.includes("DRIVER") && item.performedByUserId !== req.auth!.userId && item.driver?.userId !== req.auth!.userId) return res.status(403).json({ error: "You may only view your own inspections." }); return res.json(item);
});
