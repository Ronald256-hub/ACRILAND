import crypto from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { hashOpaqueToken, newOpaqueToken, signAccessToken } from "../../lib/tokens.js";
import { sendPasswordReset } from "../../lib/mailer.js";
import { requireAuth } from "../../middleware/auth.js";

export const authRouter = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure: env.NODE_ENV === "production", path: "/api/auth" };

const loginSchema = z.object({ organizationSlug: z.string().min(2).max(80), email: z.string().email(), password: z.string().min(8) });

authRouter.post("/login", loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const org = await prisma.organization.findUnique({ where: { slug: input.organizationSlug.toLowerCase() } });
  const user = org ? await prisma.user.findUnique({ where: { organizationId_email: { organizationId: org.id, email: input.email.toLowerCase() } } }) : null;
  const baseEvent = { organizationId: org?.id, userId: user?.id, email: input.email.toLowerCase(), ipAddress: req.ip, userAgent: req.get("user-agent") };
  if (!org || !org.isActive || !user || user.archivedAt || user.status === "DISABLED") {
    await prisma.loginEvent.create({ data: { ...baseEvent, success: false, reason: "INVALID_CREDENTIALS" } });
    return res.status(401).json({ error: "Invalid organization, email or password." });
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await prisma.loginEvent.create({ data: { ...baseEvent, success: false, reason: "ACCOUNT_LOCKED" } });
    return res.status(423).json({ error: "Account is temporarily locked due to repeated failed sign-in attempts." });
  }
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock, status: lock ? "LOCKED" : user.status } });
    await prisma.loginEvent.create({ data: { ...baseEvent, success: false, reason: lock ? "LOCKED_AFTER_FAILURES" : "BAD_PASSWORD" } });
    return res.status(401).json({ error: lock ? "Account locked for 15 minutes." : "Invalid organization, email or password." });
  }
  const refresh = newOpaqueToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const session = await prisma.$transaction(async (tx) => {
    const s = await tx.session.create({ data: { userId: user.id, refreshTokenHash: hashOpaqueToken(refresh), expiresAt, ipAddress: req.ip, userAgent: req.get("user-agent") } });
    await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, status: "ACTIVE", lastLoginAt: new Date() } });
    await tx.loginEvent.create({ data: { ...baseEvent, success: true, reason: "LOGIN_SUCCESS" } });
    return s;
  });
  res.cookie("acr_refresh", refresh, { ...cookieOptions, expires: expiresAt });
  return res.json({ accessToken: signAccessToken({ sub: user.id, organizationId: user.organizationId, sessionId: session.id }), mustChangePassword: user.mustChangePassword });
});

authRouter.post("/refresh", async (req, res) => {
  const raw = req.cookies?.acr_refresh as string | undefined;
  if (!raw) return res.status(401).json({ error: "Refresh session required." });
  const hash = hashOpaqueToken(raw);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") return res.status(401).json({ error: "Refresh session is invalid." });
  const replacement = newOpaqueToken();
  await prisma.session.update({ where: { id: session.id }, data: { refreshTokenHash: hashOpaqueToken(replacement), lastUsedAt: new Date() } });
  res.cookie("acr_refresh", replacement, { ...cookieOptions, expires: session.expiresAt });
  return res.json({ accessToken: signAccessToken({ sub: session.user.id, organizationId: session.user.organizationId, sessionId: session.id }), mustChangePassword: session.user.mustChangePassword });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  await prisma.session.update({ where: { id: req.auth!.sessionId }, data: { revokedAt: new Date() } });
  res.clearCookie("acr_refresh", cookieOptions);
  return res.status(204).end();
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(8), newPassword: z.string().min(12).max(128) }).parse(req.body);
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
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await sendPasswordReset(user.email, `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`);
  }
  return res.json({ message: "If the account exists, password-reset instructions have been sent." });
});

authRouter.post("/reset-password", async (req, res) => {
  const input = z.object({ token: z.string().min(30), newPassword: z.string().min(12).max(128) }).parse(req.body);
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashOpaqueToken(input.token) } });
  if (!token || token.usedAt || token.expiresAt <= new Date()) return res.status(400).json({ error: "Reset link is invalid or expired." });
  await prisma.$transaction([
    prisma.user.update({ where: { id: token.userId }, data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, status: "ACTIVE" } }),
    prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: token.userId }, data: { revokedAt: new Date() } })
  ]);
  return res.json({ message: "Password reset complete. Sign in with the new password." });
});
