import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "./prisma.js";

type Severity="INFO"|"WARNING"|"HIGH"|"CRITICAL";

function jsonSafe(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function securityEvent(req: Request,input:{eventType:string;severity?:Severity;action:string;recordType?:string;recordId?:string;reason?:string;metadata?:unknown}) {
  if (!req.auth) return;
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "SecurityEvent" ("organizationId","userId","eventType","severity","action","recordType","recordId","reason","ipAddress","userAgent","metadata")
    VALUES (${req.auth.organizationId}::uuid,${req.auth.userId}::uuid,${input.eventType},${input.severity??"INFO"}::"SecurityEventSeverity",${input.action},${input.recordType??null},${input.recordId??null},${input.reason??null},${req.ip??null},${req.get("user-agent")??null},${jsonSafe(input.metadata)}::jsonb)
  `);
}

export async function securityEventForIdentity(input:{organizationId:string;userId?:string|null;eventType:string;severity?:Severity;action:string;reason?:string;ipAddress?:string|null;userAgent?:string|null;metadata?:unknown}) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "SecurityEvent" ("organizationId","userId","eventType","severity","action","reason","ipAddress","userAgent","metadata")
    VALUES (${input.organizationId}::uuid,${input.userId??null}::uuid,${input.eventType},${input.severity??"INFO"}::"SecurityEventSeverity",${input.action},${input.reason??null},${input.ipAddress??null},${input.userAgent??null},${jsonSafe(input.metadata)}::jsonb)
  `);
}

export function severityForAuditAction(action:string):Severity {
  const a=action.toUpperCase();
  if(/DISABLE|DELETE|ARCHIVE|DISPOS|REVOKE|RESET|ROLE|PERMISSION|MFA|TOKEN|PASSWORD/.test(a)) return "HIGH";
  if(/APPROV|CANCEL|CLOSE|RELEASE|CONFIG|CREATE|UPDATE|EDIT/.test(a)) return "WARNING";
  return "INFO";
}
