CREATE TYPE "SecurityEventSeverity" AS ENUM ('INFO','WARNING','HIGH','CRITICAL');

CREATE TABLE "SecurityEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "userId" UUID,
  "eventType" TEXT NOT NULL,
  "severity" "SecurityEventSeverity" NOT NULL DEFAULT 'INFO',
  "action" TEXT NOT NULL,
  "recordType" TEXT,
  "recordId" TEXT,
  "reason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SecurityEvent_organizationId_createdAt_idx" ON "SecurityEvent"("organizationId", "createdAt");
CREATE INDEX "SecurityEvent_organizationId_severity_createdAt_idx" ON "SecurityEvent"("organizationId", "severity", "createdAt");
CREATE INDEX "SecurityEvent_organizationId_eventType_createdAt_idx" ON "SecurityEvent"("organizationId", "eventType", "createdAt");
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");
