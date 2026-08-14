import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/tokens.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.get("authorization");
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required." });
    const claims = verifyAccessToken(header.slice(7));
    const session = await prisma.session.findFirst({ where: { id: claims.sessionId, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() } }, include: {
      user: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } }
    }});
    if (!session || session.user.status !== "ACTIVE" || session.user.archivedAt) return res.status(401).json({ error: "Session is no longer valid." });
    if (session.user.organizationId !== claims.organizationId) return res.status(401).json({ error: "Invalid session tenant." });
    const roles = session.user.roles.map((r) => r.role.name);
    const permissions = new Set(session.user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)));
    req.auth = { userId: session.user.id, organizationId: session.user.organizationId, sessionId: session.id, roles, permissions };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired access token." });
  }
}
