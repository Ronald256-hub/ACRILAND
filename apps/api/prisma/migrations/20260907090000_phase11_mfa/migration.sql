CREATE TABLE "UserMfa" (
  "userId" UUID PRIMARY KEY,
  "secretEncrypted" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "confirmedAt" TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserMfa_lockedUntil_idx" ON "UserMfa"("lockedUntil");

CREATE TABLE "MfaRecoveryCode" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL,
  "codeHash" TEXT NOT NULL UNIQUE,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MfaRecoveryCode_userId_usedAt_idx" ON "MfaRecoveryCode"("userId", "usedAt");
