import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { decryptMfaSecret, encryptMfaSecret } from "../../lib/mfaCrypto.js";

const MAX_CLOCK_SKEW_SECONDS = 300;
const NONCE_TTL_MS = 10 * 60_000;

export function generateTelemetryDeviceSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

export function canonicalTelemetryPayload(payload: unknown): string {
  return JSON.stringify(canonicalize(payload));
}

export function telemetrySignature(secret: string, timestamp: string, nonce: string, payload: unknown): string {
  const bodyHash = crypto.createHash("sha256").update(canonicalTelemetryPayload(payload), "utf8").digest("hex");
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${bodyHash}`, "utf8").digest("hex");
}

function safeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex"), b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function authenticateTelemetryDevice(req: Request, res: Response, next: NextFunction) {
  const deviceId = req.get("x-acriland-device-id")?.trim();
  const timestamp = req.get("x-acriland-timestamp")?.trim();
  const nonce = req.get("x-acriland-nonce")?.trim();
  const signature = req.get("x-acriland-signature")?.trim().toLowerCase();
  if (!deviceId || !timestamp || !nonce || !signature) return res.status(401).json({ error: "Device authentication required." });
  if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9._~-]{16,128}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) return res.status(401).json({ error: "Invalid device authentication headers." });
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return res.status(401).json({ error: "Telemetry request timestamp is outside the allowed window." });
  try {
    const rows = await prisma.$queryRaw<Array<{id:string;organizationId:string;vehicleId:string;secretEncrypted:string;status:string}>>`SELECT "id","organizationId","vehicleId","secretEncrypted","status" FROM "TelemetryDevice" WHERE "id"=${deviceId}::uuid LIMIT 1`;
    const device = rows[0];
    if (!device || device.status !== "ACTIVE") return res.status(401).json({ error: "Telemetry device is not active." });
    const secret = decryptMfaSecret(device.secretEncrypted);
    const expected = telemetrySignature(secret, timestamp, nonce, req.body);
    if (!safeEqualHex(expected, signature)) return res.status(401).json({ error: "Invalid telemetry device signature." });
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`DELETE FROM "TelemetryDeviceNonce" WHERE "deviceId"=${device.id}::uuid AND "expiresAt" < CURRENT_TIMESTAMP`;
        await tx.$executeRaw`INSERT INTO "TelemetryDeviceNonce"("deviceId","nonce","expiresAt") VALUES (${device.id}::uuid,${nonce},${new Date(Date.now()+NONCE_TTL_MS)})`;
        await tx.$executeRaw`UPDATE "TelemetryDevice" SET "lastSeenAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${device.id}::uuid AND "status"='ACTIVE'`;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "Telemetry request replay detected." });
      throw error;
    }
    req.telemetryDevice = { id: device.id, organizationId: device.organizationId, vehicleId: device.vehicleId };
    return next();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2023") return res.status(401).json({ error: "Invalid telemetry device." });
    return next(error);
  }
}

export function encryptTelemetryDeviceSecret(secret: string): string {
  return encryptMfaSecret(secret);
}
