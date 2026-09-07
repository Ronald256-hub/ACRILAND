-- Phase 12: refresh-token replay/reuse detection.
-- Keep previously rotated token hashes so reuse can be attributed to a session
-- and the session can be revoked instead of silently accepting the replay.
CREATE TABLE "RefreshTokenHistory" (
  "tokenHash" TEXT PRIMARY KEY,
  "sessionId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshTokenHistory_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE
);

CREATE INDEX "RefreshTokenHistory_sessionId_idx"
  ON "RefreshTokenHistory"("sessionId");

CREATE INDEX "RefreshTokenHistory_expiresAt_idx"
  ON "RefreshTokenHistory"("expiresAt");
