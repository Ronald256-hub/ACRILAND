CREATE TABLE "MfaSession" (
  "sessionId" UUID PRIMARY KEY,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MfaSession_verifiedAt_idx" ON "MfaSession"("verifiedAt");
