import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireFreshMfa } from "../../middleware/mfa.js";
import { authenticateTelemetryDevice, encryptTelemetryDeviceSecret, generateTelemetryDeviceSecret } from "./deviceAuth.js";

export const telemetryDeviceRouter = Router();
const ingestLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });

const telemetryInput = z.object({
  provider: z.string().min(2).max(120), externalDeviceId: z.string().max(150).optional(),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  speedKph: z.number().min(0).max(500).optional(), ignitionOn: z.boolean().optional(),
  odometerKm: z.number().int().min(0).optional(), fuelPercent: z.number().int().min(0).max(100).optional(),
  headingDegrees: z.number().int().min(0).max(359).optional(), recordedAt: z.coerce.date(),
  rawPayload: z.record(z.string(), z.unknown()).optional()
});

telemetryDeviceRouter.post("/ingest", ingestLimit, authenticateTelemetryDevice, async (req, res) => {
  const input = telemetryInput.parse(req.body);
  const device = req.telemetryDevice!;
  const vehicle = await prisma.vehicle.findFirst({ where: { id: device.vehicleId, organizationId: device.organizationId, archivedAt: null } });
  if (!vehicle) return res.status(404).json({ error: "Bound vehicle not found or archived." });
  const result = await prisma.$transaction(async tx => {
    const previous = await tx.telemetrySnapshot.findFirst({ where: { organizationId: device.organizationId, vehicleId: vehicle.id }, orderBy: { recordedAt: "desc" }, select: { recordedAt: true } });
    const isLatest = !previous || input.recordedAt >= previous.recordedAt;
    const data: Prisma.TelemetrySnapshotUncheckedCreateInput = { organizationId: device.organizationId, vehicleId: vehicle.id, provider: input.provider, externalDeviceId: input.externalDeviceId ?? null, latitude: input.latitude, longitude: input.longitude, speedKph: input.speedKph ?? null, ignitionOn: input.ignitionOn ?? null, odometerKm: input.odometerKm ?? null, fuelPercent: input.fuelPercent ?? null, headingDegrees: input.headingDegrees ?? null, recordedAt: input.recordedAt, ...(input.rawPayload !== undefined ? { rawPayload: input.rawPayload as Prisma.InputJsonValue } : {}) };
    const row = await tx.telemetrySnapshot.create({ data });
    if (isLatest) await tx.vehicle.update({ where: { id: vehicle.id }, data: { currentLocation: `${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`, ...(input.odometerKm !== undefined && input.odometerKm >= vehicle.currentOdometerKm ? { currentOdometerKm: input.odometerKm } : {}) } });
    const blocked = ["GROUNDED", "BREAKDOWN", "ACCIDENT", "UNDER_MAINTENANCE", "SERVICE_OVERDUE", "OUT_OF_SERVICE", "DISPOSED"].includes(vehicle.status);
    const movementException = isLatest && blocked && (input.speedKph ?? 0) > 5;
    if (movementException) await tx.operationalAlert.upsert({ where: { organizationId_sourceType_sourceId_category: { organizationId: device.organizationId, sourceType: "VEHICLE", sourceId: vehicle.id, category: "BLOCKED_VEHICLE_MOVEMENT" } }, update: { severity: "CRITICAL", status: "OPEN", title: `${vehicle.registrationNumber} moving while ${vehicle.status.replaceAll("_", " ")}`, message: `Telemetry device ${device.id} recorded ${input.speedKph?.toFixed(1)} km/h at ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}.`, vehicleId: vehicle.id }, create: { organizationId: device.organizationId, category: "BLOCKED_VEHICLE_MOVEMENT", severity: "CRITICAL", status: "OPEN", sourceType: "VEHICLE", sourceId: vehicle.id, title: `${vehicle.registrationNumber} moving while ${vehicle.status.replaceAll("_", " ")}`, message: `Telemetry device ${device.id} recorded ${input.speedKph?.toFixed(1)} km/h at ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}.`, vehicleId: vehicle.id } });
    return { row, movementException };
  });
  return res.status(201).json(result.row);
});

telemetryDeviceRouter.get("/devices", requireAuth, requireFreshMfa, requirePermission(PERMISSIONS.TELEMETRY_INGEST), async (req, res) => {
  const rows = await prisma.$queryRaw<Array<{id:string;vehicleId:string;name:string;status:string;lastSeenAt:Date|null;createdAt:Date;registrationNumber:string}>>`SELECT d."id",d."vehicleId",d."name",d."status",d."lastSeenAt",d."createdAt",v."registrationNumber" FROM "TelemetryDevice" d JOIN "Vehicle" v ON v."id"=d."vehicleId" WHERE d."organizationId"=${req.auth!.organizationId}::uuid ORDER BY d."createdAt" DESC`;
  return res.json({ items: rows });
});

telemetryDeviceRouter.post("/devices", requireAuth, requireFreshMfa, requirePermission(PERMISSIONS.TELEMETRY_INGEST), async (req, res) => {
  const input = z.object({ vehicleId: z.string().uuid(), name: z.string().min(2).max(120) }).parse(req.body);
  const vehicle = await prisma.vehicle.findFirst({ where: { id: input.vehicleId, organizationId: req.auth!.organizationId, archivedAt: null }, select: { id: true, registrationNumber: true } });
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found." });
  const id = randomUUID();
  const secret = generateTelemetryDeviceSecret();
  await prisma.$executeRaw`INSERT INTO "TelemetryDevice"("id","organizationId","vehicleId","name","secretEncrypted","status","createdByUserId") VALUES (${id}::uuid,${req.auth!.organizationId}::uuid,${vehicle.id}::uuid,${input.name},${encryptTelemetryDeviceSecret(secret)},'ACTIVE',${req.auth!.userId}::uuid)`;
  await audit(req, { action: "CREATE", recordType: "TELEMETRY_DEVICE", recordId: id, newValue: { vehicleId: vehicle.id, registrationNumber: vehicle.registrationNumber, name: input.name } });
  return res.status(201).json({ id, vehicleId: vehicle.id, registrationNumber: vehicle.registrationNumber, name: input.name, secret, warning: "Store this device secret securely. It will not be shown again." });
});

telemetryDeviceRouter.post("/devices/:id/revoke", requireAuth, requireFreshMfa, requirePermission(PERMISSIONS.TELEMETRY_INGEST), async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : null;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "Invalid device id." });
  const rows = await prisma.$queryRaw<Array<{id:string;status:string}>>`SELECT "id","status" FROM "TelemetryDevice" WHERE "id"=${id}::uuid AND "organizationId"=${req.auth!.organizationId}::uuid LIMIT 1`;
  if (!rows[0]) return res.status(404).json({ error: "Telemetry device not found." });
  await prisma.$executeRaw`UPDATE "TelemetryDevice" SET "status"='REVOKED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "organizationId"=${req.auth!.organizationId}::uuid`;
  await audit(req, { action: "REVOKE", recordType: "TELEMETRY_DEVICE", recordId: id, oldValue: { status: rows[0].status }, newValue: { status: "REVOKED" } });
  return res.json({ id, status: "REVOKED" });
});
