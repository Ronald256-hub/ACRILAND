CREATE TYPE "TelemetryDeviceStatus" AS ENUM ('ACTIVE','REVOKED');

CREATE TABLE "TelemetryDevice" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  "status" "TelemetryDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastSeenAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelemetryDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TelemetryDevice_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TelemetryDevice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TelemetryDevice_organizationId_status_idx" ON "TelemetryDevice"("organizationId","status");
CREATE INDEX "TelemetryDevice_vehicleId_status_idx" ON "TelemetryDevice"("vehicleId","status");

CREATE TABLE "TelemetryDeviceNonce" (
  "deviceId" UUID NOT NULL,
  "nonce" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelemetryDeviceNonce_pk" PRIMARY KEY ("deviceId","nonce"),
  CONSTRAINT "TelemetryDeviceNonce_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TelemetryDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TelemetryDeviceNonce_expiresAt_idx" ON "TelemetryDeviceNonce"("expiresAt");
CREATE INDEX "TelemetryDeviceNonce_deviceId_expiresAt_idx" ON "TelemetryDeviceNonce"("deviceId","expiresAt");
