import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "./prisma.js";
import { securityEvent } from "./securityEvents.js";

function jsonSafe(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
    oldValue: jsonSafe(input.oldValue),
    newValue: jsonSafe(input.newValue),
    reason: input.reason ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null
  }});
  try {
    await securityEvent(req,{eventType:"AUDIT_ACTION",severity:undefined,action:input.action,recordType:input.recordType,recordId:input.recordId,reason:input.reason,metadata:{oldValue:input.oldValue,newValue:input.newValue}});
  } catch {
    // Security telemetry must never turn a successful business audit action into a failed request.
  }
}
