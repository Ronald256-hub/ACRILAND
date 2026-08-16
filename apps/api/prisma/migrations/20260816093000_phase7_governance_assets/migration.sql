-- Phase 7: battery lifecycle, formal custody handovers, document vault and reusable approvals.

CREATE TABLE "BatteryAsset" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "serialNumber" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT,
  "capacityAh" NUMERIC(10,2),
  "voltage" NUMERIC(8,2),
  "purchaseDate" TIMESTAMPTZ,
  "purchaseCost" NUMERIC(18,2),
  "warrantyEnd" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
  "currentVehicleId" UUID,
  "position" TEXT,
  "fittedAt" TIMESTAMPTZ,
  "removedAt" TIMESTAMPTZ,
  "odometerKmAtFit" INTEGER,
  "odometerKmAtRemoval" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatteryAsset_status_check" CHECK ("status" IN ('IN_STOCK','FITTED','REPAIR','SCRAPPED')),
  CONSTRAINT "BatteryAsset_positive_check" CHECK (("capacityAh" IS NULL OR "capacityAh" >= 0) AND ("voltage" IS NULL OR "voltage" >= 0) AND ("purchaseCost" IS NULL OR "purchaseCost" >= 0)),
  CONSTRAINT "BatteryAsset_odometer_check" CHECK ("odometerKmAtRemoval" IS NULL OR "odometerKmAtFit" IS NULL OR "odometerKmAtRemoval" >= "odometerKmAtFit"),
  CONSTRAINT "BatteryAsset_vehicle_fk" FOREIGN KEY ("currentVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL,
  UNIQUE ("organizationId","serialNumber")
);
CREATE INDEX "BatteryAsset_org_status_idx" ON "BatteryAsset"("organizationId","status");
CREATE INDEX "BatteryAsset_vehicle_idx" ON "BatteryAsset"("currentVehicleId","status");

CREATE TABLE "BatteryFitment" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "batteryId" UUID NOT NULL REFERENCES "BatteryAsset"("id") ON DELETE RESTRICT,
  "vehicleId" UUID NOT NULL REFERENCES "Vehicle"("id") ON DELETE RESTRICT,
  "position" TEXT NOT NULL,
  "fittedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMPTZ,
  "odometerKmAtFit" INTEGER NOT NULL,
  "odometerKmAtRemoval" INTEGER,
  "removalReason" TEXT,
  "performedByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatteryFitment_odometer_check" CHECK ("odometerKmAtFit" >= 0 AND ("odometerKmAtRemoval" IS NULL OR "odometerKmAtRemoval" >= "odometerKmAtFit"))
);
CREATE INDEX "BatteryFitment_org_vehicle_idx" ON "BatteryFitment"("organizationId","vehicleId","fittedAt");
CREATE UNIQUE INDEX "BatteryFitment_active_battery_unique" ON "BatteryFitment"("batteryId") WHERE "removedAt" IS NULL;
CREATE UNIQUE INDEX "BatteryFitment_active_position_unique" ON "BatteryFitment"("vehicleId", upper("position")) WHERE "removedAt" IS NULL;

CREATE TABLE "VehicleHandover" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "handoverNumber" TEXT NOT NULL,
  "vehicleId" UUID NOT NULL REFERENCES "Vehicle"("id") ON DELETE RESTRICT,
  "fromDriverId" UUID REFERENCES "Driver"("id") ON DELETE SET NULL,
  "toDriverId" UUID REFERENCES "Driver"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "odometerKm" INTEGER NOT NULL,
  "fuelPercent" INTEGER,
  "location" TEXT,
  "exteriorCondition" TEXT,
  "interiorCondition" TEXT,
  "tyreCondition" TEXT,
  "accessories" JSONB,
  "conditionNotes" TEXT,
  "createdByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "acceptedByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT,
  "acceptedAt" TIMESTAMPTZ,
  "rejectedReason" TEXT,
  "closedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleHandover_type_check" CHECK ("type" IN ('ISSUE','RETURN','TRANSFER')),
  CONSTRAINT "VehicleHandover_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','REJECTED','CLOSED','CANCELLED')),
  CONSTRAINT "VehicleHandover_odometer_check" CHECK ("odometerKm" >= 0),
  CONSTRAINT "VehicleHandover_fuel_check" CHECK ("fuelPercent" IS NULL OR ("fuelPercent" >= 0 AND "fuelPercent" <= 100)),
  CONSTRAINT "VehicleHandover_driver_check" CHECK ("fromDriverId" IS NOT NULL OR "toDriverId" IS NOT NULL),
  UNIQUE ("organizationId","handoverNumber")
);
CREATE INDEX "VehicleHandover_org_status_idx" ON "VehicleHandover"("organizationId","status","createdAt");
CREATE INDEX "VehicleHandover_vehicle_idx" ON "VehicleHandover"("vehicleId","createdAt");
CREATE INDEX "VehicleHandover_driver_idx" ON "VehicleHandover"("toDriverId","status");

CREATE TABLE "HandoverEvidence" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "handoverId" UUID NOT NULL REFERENCES "VehicleHandover"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "storageLocator" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HandoverEvidence_size_check" CHECK ("sizeBytes" > 0)
);
CREATE INDEX "HandoverEvidence_handover_idx" ON "HandoverEvidence"("handoverId","createdAt");

CREATE TABLE "DocumentVaultItem" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "documentType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "referenceNumber" TEXT,
  "issuer" TEXT,
  "issueDate" TIMESTAMPTZ,
  "expiryDate" TIMESTAMPTZ,
  "storageLocator" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentVault_entity_check" CHECK ("entityType" IN ('VEHICLE','DRIVER','MAINTENANCE','INCIDENT','HANDOVER','VENDOR','OTHER')),
  CONSTRAINT "DocumentVault_date_check" CHECK ("expiryDate" IS NULL OR "issueDate" IS NULL OR "expiryDate" >= "issueDate"),
  CONSTRAINT "DocumentVault_size_check" CHECK ("sizeBytes" > 0)
);
CREATE INDEX "DocumentVault_org_entity_idx" ON "DocumentVaultItem"("organizationId","entityType","entityId");
CREATE INDEX "DocumentVault_expiry_idx" ON "DocumentVaultItem"("organizationId","expiryDate");

CREATE TABLE "ApprovalDefinition" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "moduleKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId","moduleKey","name")
);
CREATE INDEX "ApprovalDefinition_org_active_idx" ON "ApprovalDefinition"("organizationId","isActive");

CREATE TABLE "ApprovalDefinitionStep" (
  "id" UUID PRIMARY KEY,
  "definitionId" UUID NOT NULL REFERENCES "ApprovalDefinition"("id") ON DELETE CASCADE,
  "stepOrder" INTEGER NOT NULL,
  "roleName" TEXT NOT NULL,
  "minApprovals" INTEGER NOT NULL DEFAULT 1,
  "allowRequester" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalDefinitionStep_order_check" CHECK ("stepOrder" > 0 AND "minApprovals" > 0),
  UNIQUE ("definitionId","stepOrder")
);

CREATE TABLE "ApprovalRequest" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "definitionId" UUID NOT NULL REFERENCES "ApprovalDefinition"("id") ON DELETE RESTRICT,
  "moduleKey" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "requesterUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "currentStep" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB,
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalRequest_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT "ApprovalRequest_step_check" CHECK ("currentStep" > 0)
);
CREATE INDEX "ApprovalRequest_org_status_idx" ON "ApprovalRequest"("organizationId","status","requestedAt");
CREATE INDEX "ApprovalRequest_record_idx" ON "ApprovalRequest"("organizationId","moduleKey","recordId");

CREATE TABLE "ApprovalRequestDecision" (
  "id" UUID PRIMARY KEY,
  "requestId" UUID NOT NULL REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE,
  "stepOrder" INTEGER NOT NULL,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "decision" TEXT NOT NULL,
  "comments" TEXT,
  "decidedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalDecision_value_check" CHECK ("decision" IN ('APPROVED','REJECTED')),
  UNIQUE ("requestId","stepOrder","userId")
);

-- Phase 7 action permissions.
INSERT INTO "Permission" ("id","key","description") VALUES
  ('71000000-0000-4000-8000-000000000001','battery.view','battery view'),
  ('71000000-0000-4000-8000-000000000002','battery.manage','battery manage'),
  ('71000000-0000-4000-8000-000000000003','handover.view','handover view'),
  ('71000000-0000-4000-8000-000000000004','handover.create','handover create'),
  ('71000000-0000-4000-8000-000000000005','handover.manage','handover manage'),
  ('71000000-0000-4000-8000-000000000006','handover.accept_self','handover accept self'),
  ('71000000-0000-4000-8000-000000000007','document.view','document view'),
  ('71000000-0000-4000-8000-000000000008','document.manage','document manage'),
  ('71000000-0000-4000-8000-000000000009','approval.view','approval view'),
  ('71000000-0000-4000-8000-000000000010','approval.configure','approval configure'),
  ('71000000-0000-4000-8000-000000000011','approval.decide','approval decide')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH rp("roleName","permissionKey") AS (VALUES
 ('SUPER_ADMINISTRATOR','battery.view'),('SUPER_ADMINISTRATOR','battery.manage'),('SUPER_ADMINISTRATOR','handover.view'),('SUPER_ADMINISTRATOR','handover.create'),('SUPER_ADMINISTRATOR','handover.manage'),('SUPER_ADMINISTRATOR','document.view'),('SUPER_ADMINISTRATOR','document.manage'),('SUPER_ADMINISTRATOR','approval.view'),('SUPER_ADMINISTRATOR','approval.configure'),('SUPER_ADMINISTRATOR','approval.decide'),
 ('ORGANIZATION_ADMINISTRATOR','battery.view'),('ORGANIZATION_ADMINISTRATOR','battery.manage'),('ORGANIZATION_ADMINISTRATOR','handover.view'),('ORGANIZATION_ADMINISTRATOR','handover.create'),('ORGANIZATION_ADMINISTRATOR','handover.manage'),('ORGANIZATION_ADMINISTRATOR','document.view'),('ORGANIZATION_ADMINISTRATOR','document.manage'),('ORGANIZATION_ADMINISTRATOR','approval.view'),('ORGANIZATION_ADMINISTRATOR','approval.configure'),('ORGANIZATION_ADMINISTRATOR','approval.decide'),
 ('FLEET_MANAGER','battery.view'),('FLEET_MANAGER','battery.manage'),('FLEET_MANAGER','handover.view'),('FLEET_MANAGER','handover.create'),('FLEET_MANAGER','handover.manage'),('FLEET_MANAGER','document.view'),('FLEET_MANAGER','document.manage'),('FLEET_MANAGER','approval.view'),('FLEET_MANAGER','approval.configure'),('FLEET_MANAGER','approval.decide'),
 ('WORKSHOP_MANAGER','battery.view'),('WORKSHOP_MANAGER','battery.manage'),('WORKSHOP_MANAGER','handover.view'),('WORKSHOP_MANAGER','document.view'),('WORKSHOP_MANAGER','document.manage'),('WORKSHOP_MANAGER','approval.view'),
 ('WORKSHOP_SUPERVISOR','battery.view'),('WORKSHOP_SUPERVISOR','battery.manage'),('WORKSHOP_SUPERVISOR','handover.view'),('WORKSHOP_SUPERVISOR','document.view'),
 ('TECHNICIAN','battery.view'),('TECHNICIAN','battery.manage'),('TECHNICIAN','document.view'),
 ('DRIVER','handover.accept_self'),
 ('FINANCE_OFFICER','battery.view'),('FINANCE_OFFICER','document.view'),('FINANCE_OFFICER','approval.view'),('FINANCE_OFFICER','approval.decide'),
 ('MANAGEMENT_DIRECTOR','battery.view'),('MANAGEMENT_DIRECTOR','handover.view'),('MANAGEMENT_DIRECTOR','document.view'),('MANAGEMENT_DIRECTOR','approval.view'),('MANAGEMENT_DIRECTOR','approval.decide')
)
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r."id", p."id" FROM rp JOIN "Role" r ON r."name"=rp."roleName" JOIN "Permission" p ON p."key"=rp."permissionKey"
ON CONFLICT ("roleId","permissionId") DO NOTHING;
