-- ACRILAND Fleet Command Centre - Phase 3 fleet health, workshop, fuel and compliance
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW','NORMAL','HIGH','CRITICAL');
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN','DIAGNOSIS','AWAITING_APPROVAL','APPROVED','IN_PROGRESS','QC','READY_FOR_RELEASE','CLOSED','CANCELLED');
CREATE TYPE "FuelRequestStatus" AS ENUM ('REQUESTED','APPROVED','REJECTED','ISSUED','CANCELLED');
CREATE TYPE "ComplianceType" AS ENUM ('INSURANCE','ROAD_LICENCE','FITNESS','THIRD_PARTY','TAX','WARRANTY','OTHER');

ALTER TABLE "Vehicle"
  ADD COLUMN "lastServiceAt" TIMESTAMP(3),
  ADD COLUMN "nextServiceDueAt" TIMESTAMP(3),
  ADD COLUMN "nextServiceDueKm" INTEGER,
  ADD COLUMN "serviceIntervalKm" INTEGER;

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_next_service_km_check" CHECK ("nextServiceDueKm" IS NULL OR "nextServiceDueKm" >= 0),
  ADD CONSTRAINT "Vehicle_service_interval_check" CHECK ("serviceIntervalKm" IS NULL OR "serviceIntervalKm" > 0);

CREATE TABLE "MaintenanceWorkOrder" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "workOrderNumber" TEXT NOT NULL,
  "vehicleId" UUID NOT NULL,
  "openedByUserId" UUID NOT NULL,
  "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
  "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "odometerKm" INTEGER NOT NULL,
  "diagnosis" TEXT,
  "vendor" TEXT,
  "estimatedCost" NUMERIC(18,2),
  "labourCost" NUMERIC(18,2),
  "partsCost" NUMERIC(18,2),
  "totalCost" NUMERIC(18,2),
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMP(3),
  "workPerformed" TEXT,
  "qcNotes" TEXT,
  "releasedByUserId" UUID,
  "releasedAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "downtimeStart" TIMESTAMP(3),
  "downtimeEnd" TIMESTAMP(3),
  "nextServiceDueAt" TIMESTAMP(3),
  "nextServiceDueKm" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceWorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceWorkOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceWorkOrder_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceWorkOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceWorkOrder_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceWorkOrder_odometer_check" CHECK ("odometerKm" >= 0),
  CONSTRAINT "MaintenanceWorkOrder_cost_check" CHECK (COALESCE("estimatedCost",0) >= 0 AND COALESCE("labourCost",0) >= 0 AND COALESCE("partsCost",0) >= 0 AND COALESCE("totalCost",0) >= 0),
  CONSTRAINT "MaintenanceWorkOrder_next_service_check" CHECK ("nextServiceDueKm" IS NULL OR "nextServiceDueKm" >= 0)
);
CREATE UNIQUE INDEX "MaintenanceWorkOrder_organizationId_workOrderNumber_key" ON "MaintenanceWorkOrder"("organizationId","workOrderNumber");
CREATE INDEX "MaintenanceWorkOrder_organizationId_status_priority_idx" ON "MaintenanceWorkOrder"("organizationId","status","priority");
CREATE INDEX "MaintenanceWorkOrder_vehicleId_openedAt_idx" ON "MaintenanceWorkOrder"("vehicleId","openedAt");

CREATE TABLE "FuelTransaction" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "vehicleId" UUID NOT NULL,
  "driverId" UUID,
  "tripId" UUID,
  "requestedByUserId" UUID NOT NULL,
  "approvedByUserId" UUID,
  "status" "FuelRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "fuelType" "FuelType" NOT NULL,
  "requestedLitres" NUMERIC(10,2) NOT NULL,
  "issuedLitres" NUMERIC(10,2),
  "unitPrice" NUMERIC(18,2),
  "totalCost" NUMERIC(18,2),
  "station" TEXT,
  "odometerKm" INTEGER NOT NULL,
  "receiptNumber" TEXT,
  "notes" TEXT,
  "rejectionReason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FuelTransaction_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FuelTransaction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FuelTransaction_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FuelTransaction_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FuelTransaction_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FuelTransaction_litres_check" CHECK ("requestedLitres" > 0 AND ("issuedLitres" IS NULL OR "issuedLitres" > 0)),
  CONSTRAINT "FuelTransaction_cost_check" CHECK (("unitPrice" IS NULL OR "unitPrice" >= 0) AND ("totalCost" IS NULL OR "totalCost" >= 0)),
  CONSTRAINT "FuelTransaction_odometer_check" CHECK ("odometerKm" >= 0)
);
CREATE UNIQUE INDEX "FuelTransaction_organizationId_requestNumber_key" ON "FuelTransaction"("organizationId","requestNumber");
CREATE INDEX "FuelTransaction_organizationId_status_requestedAt_idx" ON "FuelTransaction"("organizationId","status","requestedAt");
CREATE INDEX "FuelTransaction_vehicleId_issuedAt_idx" ON "FuelTransaction"("vehicleId","issuedAt");
CREATE INDEX "FuelTransaction_driverId_requestedAt_idx" ON "FuelTransaction"("driverId","requestedAt");

CREATE TABLE "ComplianceDocument" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "type" "ComplianceType" NOT NULL,
  "referenceNumber" TEXT NOT NULL,
  "provider" TEXT,
  "issueDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "documentUrl" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ComplianceDocument_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ComplianceDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ComplianceDocument_dates_check" CHECK ("issueDate" IS NULL OR "expiryDate" >= "issueDate")
);
CREATE UNIQUE INDEX "ComplianceDocument_org_vehicle_type_reference_key" ON "ComplianceDocument"("organizationId","vehicleId","type","referenceNumber");
CREATE INDEX "ComplianceDocument_organizationId_expiryDate_idx" ON "ComplianceDocument"("organizationId","expiryDate");
CREATE INDEX "ComplianceDocument_vehicleId_type_idx" ON "ComplianceDocument"("vehicleId","type");

-- Seed Phase 3 permissions for existing organizations. syncPlatformDefaults remains the
-- canonical reconciliation path, but deployment itself must not leave new routes inaccessible.
INSERT INTO "Permission" ("id","key","description") VALUES
  ('31000000-0000-4000-8000-000000000001','maintenance.view','maintenance view'),
  ('31000000-0000-4000-8000-000000000002','maintenance.open','maintenance open'),
  ('31000000-0000-4000-8000-000000000003','maintenance.approve','maintenance approve'),
  ('31000000-0000-4000-8000-000000000004','maintenance.release','maintenance release'),
  ('31000000-0000-4000-8000-000000000005','fuel.view','fuel view'),
  ('31000000-0000-4000-8000-000000000006','fuel.create','fuel create'),
  ('31000000-0000-4000-8000-000000000007','fuel.approve','fuel approve'),
  ('31000000-0000-4000-8000-000000000008','compliance.view','compliance view'),
  ('31000000-0000-4000-8000-000000000009','compliance.manage','compliance manage'),
  ('31000000-0000-4000-8000-000000000010','report.view','report view'),
  ('31000000-0000-4000-8000-000000000011','report.export','report export')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permission("roleName","permissionKey") AS (VALUES
  ('SUPER_ADMINISTRATOR','maintenance.view'),('SUPER_ADMINISTRATOR','maintenance.open'),('SUPER_ADMINISTRATOR','maintenance.approve'),('SUPER_ADMINISTRATOR','maintenance.release'),('SUPER_ADMINISTRATOR','fuel.view'),('SUPER_ADMINISTRATOR','fuel.create'),('SUPER_ADMINISTRATOR','fuel.approve'),('SUPER_ADMINISTRATOR','compliance.view'),('SUPER_ADMINISTRATOR','compliance.manage'),('SUPER_ADMINISTRATOR','report.view'),('SUPER_ADMINISTRATOR','report.export'),
  ('ORGANIZATION_ADMINISTRATOR','maintenance.view'),('ORGANIZATION_ADMINISTRATOR','maintenance.open'),('ORGANIZATION_ADMINISTRATOR','maintenance.approve'),('ORGANIZATION_ADMINISTRATOR','maintenance.release'),('ORGANIZATION_ADMINISTRATOR','fuel.view'),('ORGANIZATION_ADMINISTRATOR','fuel.create'),('ORGANIZATION_ADMINISTRATOR','fuel.approve'),('ORGANIZATION_ADMINISTRATOR','compliance.view'),('ORGANIZATION_ADMINISTRATOR','compliance.manage'),('ORGANIZATION_ADMINISTRATOR','report.view'),('ORGANIZATION_ADMINISTRATOR','report.export'),
  ('FLEET_MANAGER','maintenance.view'),('FLEET_MANAGER','maintenance.open'),('FLEET_MANAGER','maintenance.approve'),('FLEET_MANAGER','maintenance.release'),('FLEET_MANAGER','fuel.view'),('FLEET_MANAGER','fuel.create'),('FLEET_MANAGER','fuel.approve'),('FLEET_MANAGER','compliance.view'),('FLEET_MANAGER','compliance.manage'),('FLEET_MANAGER','report.view'),('FLEET_MANAGER','report.export'),
  ('WORKSHOP_MANAGER','maintenance.view'),('WORKSHOP_MANAGER','maintenance.open'),('WORKSHOP_MANAGER','maintenance.approve'),('WORKSHOP_MANAGER','maintenance.release'),('WORKSHOP_MANAGER','compliance.view'),('WORKSHOP_MANAGER','report.view'),('WORKSHOP_MANAGER','report.export'),
  ('WORKSHOP_SUPERVISOR','maintenance.view'),('WORKSHOP_SUPERVISOR','maintenance.open'),('WORKSHOP_SUPERVISOR','compliance.view'),('WORKSHOP_SUPERVISOR','report.view'),('WORKSHOP_SUPERVISOR','report.export'),
  ('TECHNICIAN','maintenance.view'),('TECHNICIAN','maintenance.open'),
  ('DRIVER','fuel.create'),
  ('FINANCE_OFFICER','fuel.view'),('FINANCE_OFFICER','fuel.approve'),('FINANCE_OFFICER','report.view'),('FINANCE_OFFICER','report.export'),
  ('MANAGEMENT_DIRECTOR','maintenance.view'),('MANAGEMENT_DIRECTOR','fuel.view'),('MANAGEMENT_DIRECTOR','compliance.view'),('MANAGEMENT_DIRECTOR','report.view'),('MANAGEMENT_DIRECTOR','report.export')
)
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r."id", p."id"
FROM role_permission rp
JOIN "Role" r ON r."name" = rp."roleName"
JOIN "Permission" p ON p."key" = rp."permissionKey"
ON CONFLICT ("roleId","permissionId") DO NOTHING;
