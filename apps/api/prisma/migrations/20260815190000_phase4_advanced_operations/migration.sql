-- ACRILAND Fleet Command Centre - Phase 4 advanced fleet operations
CREATE TYPE "TyreStatus" AS ENUM ('IN_STOCK','FITTED','REPAIR','SCRAPPED');
CREATE TYPE "IncidentType" AS ENUM ('ACCIDENT','BREAKDOWN','DAMAGE','THEFT','SAFETY','OTHER');
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN','INVESTIGATING','ACTION_REQUIRED','CLOSED');
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT','ISSUE','ADJUSTMENT','RETURN');
CREATE TYPE "ProcurementStatus" AS ENUM ('DRAFT','REQUESTED','APPROVED','REJECTED','ORDERED','RECEIVED','CANCELLED');
CREATE TYPE "MaintenancePlanStatus" AS ENUM ('ACTIVE','PAUSED','RETIRED');
CREATE TYPE "OperationalAlertSeverity" AS ENUM ('INFO','WARNING','CRITICAL');
CREATE TYPE "OperationalAlertStatus" AS ENUM ('OPEN','ACKNOWLEDGED','CLOSED');

CREATE TABLE "TyreAsset" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "size" TEXT NOT NULL,
  "status" "TyreStatus" NOT NULL DEFAULT 'IN_STOCK',
  "currentVehicleId" UUID,
  "position" TEXT,
  "purchaseDate" TIMESTAMP(3),
  "purchaseCost" NUMERIC(18,2),
  "initialTreadDepthMm" NUMERIC(6,2),
  "currentTreadDepthMm" NUMERIC(6,2),
  "fittedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "mileageAtFitKm" INTEGER,
  "mileageAtRemovalKm" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TyreAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TyreAsset_currentVehicleId_fkey" FOREIGN KEY ("currentVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TyreAsset_values_check" CHECK (COALESCE("purchaseCost",0) >= 0 AND COALESCE("initialTreadDepthMm",0) >= 0 AND COALESCE("currentTreadDepthMm",0) >= 0 AND COALESCE("mileageAtFitKm",0) >= 0 AND COALESCE("mileageAtRemovalKm",0) >= 0),
  CONSTRAINT "TyreAsset_fit_state_check" CHECK (("status" <> 'FITTED') OR ("currentVehicleId" IS NOT NULL AND "position" IS NOT NULL AND "fittedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "TyreAsset_organizationId_serialNumber_key" ON "TyreAsset"("organizationId","serialNumber");
CREATE INDEX "TyreAsset_organizationId_status_idx" ON "TyreAsset"("organizationId","status");
CREATE INDEX "TyreAsset_currentVehicleId_status_idx" ON "TyreAsset"("currentVehicleId","status");
CREATE UNIQUE INDEX "TyreAsset_vehicle_position_active_key" ON "TyreAsset"("currentVehicleId","position") WHERE "status"='FITTED' AND "currentVehicleId" IS NOT NULL AND "position" IS NOT NULL;

CREATE TABLE "TyreFitment" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "tyreId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "position" TEXT NOT NULL,
  "fittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  "odometerKmAtFit" INTEGER NOT NULL,
  "odometerKmAtRemoval" INTEGER,
  "removalReason" TEXT,
  "performedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TyreFitment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TyreFitment_tyreId_fkey" FOREIGN KEY ("tyreId") REFERENCES "TyreAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TyreFitment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TyreFitment_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TyreFitment_odometer_check" CHECK ("odometerKmAtFit" >= 0 AND ("odometerKmAtRemoval" IS NULL OR "odometerKmAtRemoval" >= "odometerKmAtFit")),
  CONSTRAINT "TyreFitment_dates_check" CHECK ("removedAt" IS NULL OR "removedAt" >= "fittedAt")
);
CREATE INDEX "TyreFitment_organizationId_vehicleId_fittedAt_idx" ON "TyreFitment"("organizationId","vehicleId","fittedAt");
CREATE INDEX "TyreFitment_tyreId_fittedAt_idx" ON "TyreFitment"("tyreId","fittedAt");
CREATE UNIQUE INDEX "TyreFitment_active_tyre_key" ON "TyreFitment"("tyreId") WHERE "removedAt" IS NULL;

CREATE TABLE "IncidentReport" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "incidentNumber" TEXT NOT NULL,
  "type" "IncidentType" NOT NULL,
  "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "vehicleId" UUID,
  "driverId" UUID,
  "tripId" UUID,
  "reportedByUserId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "injuriesReported" BOOLEAN NOT NULL DEFAULT FALSE,
  "policeReference" TEXT,
  "insuranceReference" TEXT,
  "estimatedLoss" NUMERIC(18,2),
  "rootCause" TEXT,
  "correctiveAction" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IncidentReport_loss_check" CHECK ("estimatedLoss" IS NULL OR "estimatedLoss" >= 0),
  CONSTRAINT "IncidentReport_close_check" CHECK (("status"='CLOSED' AND "closedAt" IS NOT NULL) OR ("status"<>'CLOSED'))
);
CREATE UNIQUE INDEX "IncidentReport_organizationId_incidentNumber_key" ON "IncidentReport"("organizationId","incidentNumber");
CREATE INDEX "IncidentReport_organizationId_status_severity_idx" ON "IncidentReport"("organizationId","status","severity");
CREATE INDEX "IncidentReport_vehicleId_occurredAt_idx" ON "IncidentReport"("vehicleId","occurredAt");
CREATE INDEX "IncidentReport_driverId_occurredAt_idx" ON "IncidentReport"("driverId","occurredAt");

CREATE TABLE "InventoryItem" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'EA',
  "quantityOnHand" NUMERIC(14,3) NOT NULL DEFAULT 0,
  "reorderLevel" NUMERIC(14,3) NOT NULL DEFAULT 0,
  "unitCost" NUMERIC(18,2),
  "preferredSupplier" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryItem_quantity_check" CHECK ("quantityOnHand" >= 0 AND "reorderLevel" >= 0 AND ("unitCost" IS NULL OR "unitCost" >= 0))
);
CREATE UNIQUE INDEX "InventoryItem_organizationId_sku_key" ON "InventoryItem"("organizationId","sku");
CREATE INDEX "InventoryItem_organizationId_isActive_idx" ON "InventoryItem"("organizationId","isActive");

CREATE TABLE "StockMovement" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity" NUMERIC(14,3) NOT NULL,
  "unitCost" NUMERIC(18,2),
  "reference" TEXT,
  "workOrderId" UUID,
  "performedByUserId" UUID NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "MaintenanceWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_values_check" CHECK ("quantity" > 0 AND ("unitCost" IS NULL OR "unitCost" >= 0))
);
CREATE INDEX "StockMovement_organizationId_createdAt_idx" ON "StockMovement"("organizationId","createdAt");
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId","createdAt");

CREATE TABLE "ProcurementRequest" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "itemId" UUID NOT NULL,
  "requestedQuantity" NUMERIC(14,3) NOT NULL,
  "status" "ProcurementStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedByUserId" UUID NOT NULL,
  "approvedByUserId" UUID,
  "supplier" TEXT,
  "unitPrice" NUMERIC(18,2),
  "totalCost" NUMERIC(18,2),
  "neededBy" TIMESTAMP(3),
  "justification" TEXT NOT NULL,
  "rejectionReason" TEXT,
  "approvedAt" TIMESTAMP(3),
  "orderedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementRequest_values_check" CHECK ("requestedQuantity" > 0 AND ("unitPrice" IS NULL OR "unitPrice" >= 0) AND ("totalCost" IS NULL OR "totalCost" >= 0)),
  CONSTRAINT "ProcurementRequest_separation_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "requestedByUserId")
);
CREATE UNIQUE INDEX "ProcurementRequest_organizationId_requestNumber_key" ON "ProcurementRequest"("organizationId","requestNumber");
CREATE INDEX "ProcurementRequest_organizationId_status_createdAt_idx" ON "ProcurementRequest"("organizationId","status","createdAt");
CREATE INDEX "ProcurementRequest_itemId_status_idx" ON "ProcurementRequest"("itemId","status");

CREATE TABLE "PreventiveMaintenancePlan" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" "MaintenancePlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "intervalKm" INTEGER,
  "intervalDays" INTEGER,
  "lastCompletedAt" TIMESTAMP(3),
  "lastCompletedOdometerKm" INTEGER,
  "nextDueAt" TIMESTAMP(3),
  "nextDueKm" INTEGER,
  "notes" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreventiveMaintenancePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PreventiveMaintenancePlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PreventiveMaintenancePlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PreventiveMaintenancePlan_interval_check" CHECK (("intervalKm" IS NOT NULL AND "intervalKm" > 0) OR ("intervalDays" IS NOT NULL AND "intervalDays" > 0)),
  CONSTRAINT "PreventiveMaintenancePlan_values_check" CHECK (COALESCE("lastCompletedOdometerKm",0) >= 0 AND COALESCE("nextDueKm",0) >= 0)
);
CREATE UNIQUE INDEX "PreventiveMaintenancePlan_org_vehicle_name_key" ON "PreventiveMaintenancePlan"("organizationId","vehicleId","name");
CREATE INDEX "PreventiveMaintenancePlan_organizationId_status_nextDueAt_idx" ON "PreventiveMaintenancePlan"("organizationId","status","nextDueAt");
CREATE INDEX "PreventiveMaintenancePlan_vehicleId_status_idx" ON "PreventiveMaintenancePlan"("vehicleId","status");

CREATE TABLE "OperationalAlert" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "severity" "OperationalAlertSeverity" NOT NULL,
  "status" "OperationalAlertStatus" NOT NULL DEFAULT 'OPEN',
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "vehicleId" UUID,
  "assignedToUserId" UUID,
  "dueAt" TIMESTAMP(3),
  "acknowledgedByUserId" UUID,
  "acknowledgedAt" TIMESTAMP(3),
  "closedByUserId" UUID,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalAlert_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "OperationalAlert_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "OperationalAlert_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "OperationalAlert_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OperationalAlert_org_source_category_key" ON "OperationalAlert"("organizationId","sourceType","sourceId","category");
CREATE INDEX "OperationalAlert_organizationId_status_severity_idx" ON "OperationalAlert"("organizationId","status","severity");
CREATE INDEX "OperationalAlert_assignedToUserId_status_idx" ON "OperationalAlert"("assignedToUserId","status");

CREATE TABLE "TelemetrySnapshot" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "externalDeviceId" TEXT,
  "latitude" NUMERIC(10,7) NOT NULL,
  "longitude" NUMERIC(10,7) NOT NULL,
  "speedKph" NUMERIC(8,2),
  "ignitionOn" BOOLEAN,
  "odometerKm" INTEGER,
  "fuelPercent" INTEGER,
  "headingDegrees" INTEGER,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawPayload" JSONB,
  CONSTRAINT "TelemetrySnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TelemetrySnapshot_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TelemetrySnapshot_geo_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "TelemetrySnapshot_values_check" CHECK (("speedKph" IS NULL OR "speedKph" >= 0) AND ("odometerKm" IS NULL OR "odometerKm" >= 0) AND ("fuelPercent" IS NULL OR "fuelPercent" BETWEEN 0 AND 100) AND ("headingDegrees" IS NULL OR "headingDegrees" BETWEEN 0 AND 359))
);
CREATE INDEX "TelemetrySnapshot_organizationId_recordedAt_idx" ON "TelemetrySnapshot"("organizationId","recordedAt");
CREATE INDEX "TelemetrySnapshot_vehicleId_recordedAt_idx" ON "TelemetrySnapshot"("vehicleId","recordedAt");
CREATE INDEX "TelemetrySnapshot_externalDeviceId_recordedAt_idx" ON "TelemetrySnapshot"("externalDeviceId","recordedAt");

-- Seed Phase 4 permissions for existing organizations.
INSERT INTO "Permission" ("id","key","description") VALUES
  ('41000000-0000-4000-8000-000000000001','tyre.view','tyre view'),
  ('41000000-0000-4000-8000-000000000002','tyre.manage','tyre manage'),
  ('41000000-0000-4000-8000-000000000003','incident.view','incident view'),
  ('41000000-0000-4000-8000-000000000004','incident.create','incident create'),
  ('41000000-0000-4000-8000-000000000005','incident.manage','incident manage'),
  ('41000000-0000-4000-8000-000000000006','inventory.view','inventory view'),
  ('41000000-0000-4000-8000-000000000007','inventory.manage','inventory manage'),
  ('41000000-0000-4000-8000-000000000008','procurement.view','procurement view'),
  ('41000000-0000-4000-8000-000000000009','procurement.create','procurement create'),
  ('41000000-0000-4000-8000-000000000010','procurement.approve','procurement approve'),
  ('41000000-0000-4000-8000-000000000011','pm.view','pm view'),
  ('41000000-0000-4000-8000-000000000012','pm.manage','pm manage'),
  ('41000000-0000-4000-8000-000000000013','alert.view','alert view'),
  ('41000000-0000-4000-8000-000000000014','alert.manage','alert manage'),
  ('41000000-0000-4000-8000-000000000015','telemetry.view','telemetry view'),
  ('41000000-0000-4000-8000-000000000016','telemetry.ingest','telemetry ingest')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permission("roleName","permissionKey") AS (VALUES
  ('SUPER_ADMINISTRATOR','tyre.view'),('SUPER_ADMINISTRATOR','tyre.manage'),('SUPER_ADMINISTRATOR','incident.view'),('SUPER_ADMINISTRATOR','incident.create'),('SUPER_ADMINISTRATOR','incident.manage'),('SUPER_ADMINISTRATOR','inventory.view'),('SUPER_ADMINISTRATOR','inventory.manage'),('SUPER_ADMINISTRATOR','procurement.view'),('SUPER_ADMINISTRATOR','procurement.create'),('SUPER_ADMINISTRATOR','procurement.approve'),('SUPER_ADMINISTRATOR','pm.view'),('SUPER_ADMINISTRATOR','pm.manage'),('SUPER_ADMINISTRATOR','alert.view'),('SUPER_ADMINISTRATOR','alert.manage'),('SUPER_ADMINISTRATOR','telemetry.view'),('SUPER_ADMINISTRATOR','telemetry.ingest'),
  ('ORGANIZATION_ADMINISTRATOR','tyre.view'),('ORGANIZATION_ADMINISTRATOR','tyre.manage'),('ORGANIZATION_ADMINISTRATOR','incident.view'),('ORGANIZATION_ADMINISTRATOR','incident.create'),('ORGANIZATION_ADMINISTRATOR','incident.manage'),('ORGANIZATION_ADMINISTRATOR','inventory.view'),('ORGANIZATION_ADMINISTRATOR','inventory.manage'),('ORGANIZATION_ADMINISTRATOR','procurement.view'),('ORGANIZATION_ADMINISTRATOR','procurement.create'),('ORGANIZATION_ADMINISTRATOR','procurement.approve'),('ORGANIZATION_ADMINISTRATOR','pm.view'),('ORGANIZATION_ADMINISTRATOR','pm.manage'),('ORGANIZATION_ADMINISTRATOR','alert.view'),('ORGANIZATION_ADMINISTRATOR','alert.manage'),('ORGANIZATION_ADMINISTRATOR','telemetry.view'),('ORGANIZATION_ADMINISTRATOR','telemetry.ingest'),
  ('FLEET_MANAGER','tyre.view'),('FLEET_MANAGER','tyre.manage'),('FLEET_MANAGER','incident.view'),('FLEET_MANAGER','incident.create'),('FLEET_MANAGER','incident.manage'),('FLEET_MANAGER','inventory.view'),('FLEET_MANAGER','inventory.manage'),('FLEET_MANAGER','procurement.view'),('FLEET_MANAGER','procurement.create'),('FLEET_MANAGER','procurement.approve'),('FLEET_MANAGER','pm.view'),('FLEET_MANAGER','pm.manage'),('FLEET_MANAGER','alert.view'),('FLEET_MANAGER','alert.manage'),('FLEET_MANAGER','telemetry.view'),('FLEET_MANAGER','telemetry.ingest'),
  ('WORKSHOP_MANAGER','tyre.view'),('WORKSHOP_MANAGER','tyre.manage'),('WORKSHOP_MANAGER','incident.view'),('WORKSHOP_MANAGER','incident.create'),('WORKSHOP_MANAGER','incident.manage'),('WORKSHOP_MANAGER','inventory.view'),('WORKSHOP_MANAGER','inventory.manage'),('WORKSHOP_MANAGER','procurement.view'),('WORKSHOP_MANAGER','procurement.create'),('WORKSHOP_MANAGER','pm.view'),('WORKSHOP_MANAGER','pm.manage'),('WORKSHOP_MANAGER','alert.view'),('WORKSHOP_MANAGER','alert.manage'),('WORKSHOP_MANAGER','telemetry.view'),
  ('WORKSHOP_SUPERVISOR','tyre.view'),('WORKSHOP_SUPERVISOR','tyre.manage'),('WORKSHOP_SUPERVISOR','incident.view'),('WORKSHOP_SUPERVISOR','incident.create'),('WORKSHOP_SUPERVISOR','inventory.view'),('WORKSHOP_SUPERVISOR','inventory.manage'),('WORKSHOP_SUPERVISOR','procurement.view'),('WORKSHOP_SUPERVISOR','procurement.create'),('WORKSHOP_SUPERVISOR','pm.view'),('WORKSHOP_SUPERVISOR','pm.manage'),('WORKSHOP_SUPERVISOR','alert.view'),('WORKSHOP_SUPERVISOR','telemetry.view'),
  ('TECHNICIAN','tyre.view'),('TECHNICIAN','tyre.manage'),('TECHNICIAN','incident.create'),('TECHNICIAN','inventory.view'),('TECHNICIAN','pm.view'),
  ('DRIVER','incident.create'),
  ('FINANCE_OFFICER','inventory.view'),('FINANCE_OFFICER','procurement.view'),('FINANCE_OFFICER','procurement.approve'),
  ('MANAGEMENT_DIRECTOR','tyre.view'),('MANAGEMENT_DIRECTOR','incident.view'),('MANAGEMENT_DIRECTOR','inventory.view'),('MANAGEMENT_DIRECTOR','procurement.view'),('MANAGEMENT_DIRECTOR','pm.view'),('MANAGEMENT_DIRECTOR','alert.view'),('MANAGEMENT_DIRECTOR','telemetry.view')
)
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r."id", p."id"
FROM role_permission rp
JOIN "Role" r ON r."name" = rp."roleName"
JOIN "Permission" p ON p."key" = rp."permissionKey"
ON CONFLICT ("roleId","permissionId") DO NOTHING;