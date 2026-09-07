import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

const PRIVILEGED_ROLES = new Set([
  "SUPER_ADMINISTRATOR",
  "ADMINISTRATOR",
  "SYSTEM_ADMIN",
  "MANAGEMENT_DIRECTOR",
  "FLEET_MANAGER"
]);
const MAX_MFA_AGE_MS = 12 * 60 * 60_000;

export async function requireMfa(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || !req.auth.roles.some((role) => PRIVILEGED_ROLES.has(role))) return next();
  const verified = await prisma.$queryRaw<Array<{ sessionId:string }>>`SELECT "sessionId" FROM "MfaSession" WHERE "sessionId"=${req.auth.sessionId} AND "verifiedAt">${new Date(Date.now()-MAX_MFA_AGE_MS)} LIMIT 1`;
  if (verified.length === 0) return res.status(403).json({ error:"MFA verification required.", code:"MFA_REQUIRED" });
  return next();
}

export function isPrivilegedRole(roles:string[]):boolean { return roles.some((role)=>PRIVILEGED_ROLES.has(role)); }
