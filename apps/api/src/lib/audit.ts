import type { Request } from "express";
import { prisma } from "./prisma.js";

function jsonSafe(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export async function audit(req: Request, input: {
  action: string;
  recordType: string;
  recordId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
}) {
  if (!req.auth) return;
  await prisma.auditLog.create({ data: {
    organizationId: req.auth.organizationId,
    userId: req.auth.userId,
    action: input.action,
    recordType: input.recordType,
    recordId: input.recordId,
    oldValue: jsonSafe(input.oldValue) as never,
    newValue: jsonSafe(input.newValue) as never,
    reason: input.reason,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  }});
}
