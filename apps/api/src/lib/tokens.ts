import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AccessClaims = { sub: string; organizationId: string; sessionId: string };

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`, issuer: "acriland-fleet" });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "acriland-fleet" }) as AccessClaims;
}

export function newOpaqueToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
