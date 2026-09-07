ALTER TABLE "UserMfa" ADD COLUMN "setupExpiresAt" TIMESTAMP(3);
CREATE INDEX "UserMfa_setupExpiresAt_idx" ON "UserMfa"("setupExpiresAt");
