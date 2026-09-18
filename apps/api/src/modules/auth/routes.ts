import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { hashOpaqueToken, newOpaqueToken, signAccessToken } from "../../lib/tokens.js";
import { sendPasswordReset } from "../../lib/mailer.js";
import { requireAuth } from "../../middleware/auth.js";

export const authRouter = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure: env.NODE_ENV === "production", path: "/api/auth" };

const loginSchema = z.object({ organizationSlug: z.string().min(2).max(80), email: z.string().email(), password: z.string().min(8).max(128) });

authRouter.post("/login", loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const org = await prisma.organization.findUnique({ where: { slug: input.organizationSlug.toLowerCase() } });

  if (!org || !org.isActive) {
    await prisma.loginEvent.create({
      data: { organizationId: org?.id ?? null, userId: null, email, ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null, success: false, reason: "INVALID_CREDENTIALS" }
    });
    return res.status(401).json({ error: "Invalid organization, email or password." });
  }

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      id:string;
      organizationId:string;
      email:string;
      passwordHash:string;
      status:string;
      lockedUntil:Date | null;
      archivedAt:Date | null;
      mustChangePassword:boolean;
    }>>(Prisma.sql`
      SELECT "id","organizationId","email","passwordHash","status","lockedUntil","archivedAt","mustChangePassword"
      FROM "User"
      WHERE "organizationId"=${org.id}::uuid
        AND "email"=${email}
      FOR UPDATE
    `);

    const user = rows[0];
    const baseEvent = {
      organizationId: org.id,
      userId: user?.id ?? null,
      email,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null
    };

    if (!user || user.archivedAt || (user.status !== "ACTIVE" && !(user.status === "LOCKED" && (!user.lockedUntil || user.lockedUntil <= new Date())))) {
      await tx.loginEvent.create({ data: { ...baseEvent, success: false, reason: "INVALID_CREDENTIALS" } });
      return { kind:"invalid" as const };
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await tx.loginEvent.create({ data: { ...baseEvent, success: false, reason: "ACCOUNT_LOCKED" } });
      return { kind:"locked" as const };
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      const failed = Math.min((await tx.user.findUniqueOrThrow({ where:{ id:user.id }, select:{failedLoginCount:true} })).failedLoginCount + 1, 5);
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: failed } });
      await tx.loginEvent.create({ data: { ...baseEvent, success: false, reason: failed >= 5 ? "BAD_PASSWORD_RATE_LIMITED" : "BAD_PASSWORD" } });
      return { kind:"invalid" as const };
    }

    const refresh = newOpaqueToken();
    const refreshHash = hashOpaqueToken(refresh);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const session = await tx.session.create({
      data: { userId: user.id, refreshTokenHash: refreshHash, expiresAt, ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null }
    });
    await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, status: "ACTIVE", lastLoginAt: new Date() } });
    await tx.loginEvent.create({ data: { ...baseEvent, success: true, reason: "LOGIN_SUCCESS" } });
    return { kind:"success" as const, session, refresh, mustChangePassword:user.mustChangePassword, userId:user.id, organizationId:user.organizationId };
  });

  if (result.kind === "invalid") return res.status(401).json({ error: "Invalid organization, email or password." });
  if (result.kind === "locked") return res.status(423).json({ error: "Account is temporarily locked due to repeated failed sign-in attempts." });

  res.cookie("acr_refresh", result.refresh, { ...cookieOptions, expires: result.session.expiresAt });
  return res.json({ accessToken: signAccessToken({ sub: result.userId, organizationId: result.organizationId, sessionId: result.session.id }), mustChangePassword: result.mustChangePassword });
});

authRouter.post("/refresh", async (req, res) => {
  const raw = req.cookies?.acr_refresh as string | undefined;
  if (!raw) return res.status(401).json({ error: "Refresh session required." });
  const hash = hashOpaqueToken(raw);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const currentRows = await tx.$queryRaw<Array<{ id: string; userId: string; organizationId: string; refreshTokenHash: string; expiresAt: Date; revokedAt: Date | null; mustChangePassword: boolean; status: string }>>(Prisma.sql`
      SELECT s."id", s."userId", u."organizationId", s."refreshTokenHash", s."expiresAt", s."revokedAt", u."mustChangePassword", u."status"
      FROM "Session" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE s."refreshTokenHash" = ${hash}
      FOR UPDATE OF s
    `);

    if (currentRows.length === 0) {
      const reused = await tx.$queryRaw<Array<{ sessionId: string; userId: string; organizationId: string }>>(Prisma.sql`
        SELECT h."sessionId", s."userId", u."organizationId"
        FROM "RefreshTokenHistory" h
        JOIN "Session" s ON s."id" = h."sessionId"
        JOIN "User" u ON u."id" = s."userId"
        WHERE h."tokenHash" = ${hash} AND h."expiresAt" > ${now}
        LIMIT 1
      `);
      if (reused.length > 0) {
        await tx.session.update({ where: { id: reused[0]!.sessionId }, data: { revokedAt: now } });
        await tx.loginEvent.create({ data: { organizationId: reused[0]!.organizationId, userId: reused[0]!.userId, email: "refresh-token-reuse", success: false, reason: "REUSED_REFRESH_TOKEN", ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null } });
        return { kind: "reuse" as const };
      }
      return { kind: "invalid" as const };
    }

    const session = currentRows[0]!;
    if (session.revokedAt || session.expiresAt <= now || session.status !== "ACTIVE") return { kind: "invalid" as const };

    const replacement = newOpaqueToken();
    const replacementHash = hashOpaqueToken(replacement);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "RefreshTokenHistory" ("tokenHash", "sessionId", "expiresAt")
      VALUES (${session.refreshTokenHash}, ${session.id}, ${session.expiresAt})
      ON CONFLICT ("tokenHash") DO NOTHING
    `);
    await tx.session.update({ where: { id: session.id }, data: { refreshTokenHash: replacementHash, lastUsedAt: now } });
    return { kind: "success" as const, replacement, expiresAt: session.expiresAt, userId: session.userId, organizationId: session.organizationId, sessionId: session.id, mustChangePassword: session.mustChangePassword };
  });

  if (result.kind === "reuse") return res.status(401).json({ error: "Refresh session reuse detected. The session has been revoked. Sign in again." });
  if (result.kind === "invalid") return res.status(401).json({ error: "Refresh session is invalid." });
  res.cookie("acr_refresh", result.replacement, { ...cookieOptions, expires: result.expiresAt });
  return res.json({ accessToken: signAccessToken({ sub: result.userId, organizationId: result.organizationId, sessionId: result.sessionId }), mustChangePassword: result.mustChangePassword });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  await prisma.session.update({ where: { id: req.auth!.sessionId }, data: { revokedAt: new Date() } });
  res.clearCookie("acr_refresh", cookieOptions);
  return res.status(204).end();
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(8).max(128), newPassword: z.string().min(15).max(128) }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) return res.status(400).json({ error: "Current password is incorrect." });
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } }),
    prisma.session.updateMany({ where: { userId: user.id, id: { not: req.auth!.sessionId } }, data: { revokedAt: new Date() } })
  ]);
  return res.json({ message: "Password changed. Other sessions were revoked." });
});

authRouter.post("/forgot-password", loginLimiter, async (req, res) => {
  const input = z.object({ organizationSlug: z.string().min(2), email: z.string().email() }).parse(req.body);
  const org = await prisma.organization.findUnique({ where: { slug: input.organizationSlug.toLowerCase() } });
  const user = org ? await prisma.user.findUnique({ where: { organizationId_email: { organizationId: org.id, email: input.email.toLowerCase() } } }) : null;
  if (user?.status === "ACTIVE") {
    const token = newOpaqueToken();
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + 30 * 60_000) } })
    ]);
    await sendPasswordReset(user.email, `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`);
  }
  return res.json({ message: "If the account exists, password-reset instructions have been sent." });
});

authRouter.post("/reset-password", async (req, res) => {
  const input = z.object({ token: z.string().min(30), newPassword: z.string().min(15).max(128) }).parse(req.body);
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashOpaqueToken(input.token) } });
  if (!token || token.usedAt || token.expiresAt <= new Date()) return res.status(400).json({ error: "Reset link is invalid or expired." });
  const user = await prisma.user.findUnique({ where: { id: token.userId } });
  if (!user || user.archivedAt || user.status !== "ACTIVE") return res.status(400).json({ error: "Reset link is invalid or expired." });
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: token.userId }, data: { passwordHash, mustChangePassword: false } }),
    prisma.passwordResetToken.updateMany({ where: { userId: token.userId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: token.userId }, data: { revokedAt: new Date() } })
  ]);
  return res.json({ message: "Password reset complete. Sign in with the new password." });
});
