ALTER TABLE "Vehicle"
  ADD COLUMN "healthState" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "healthUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "healthSourceInspectionId" UUID;

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_healthState_check" CHECK ("healthState" IN ('UNKNOWN','HEALTHY','ATTENTION','CRITICAL'));

ALTER TABLE "VehicleInspection"
  ADD COLUMN "loadState" TEXT,
  ADD COLUMN "currentLocation" TEXT,
  ADD COLUMN "vehicleBehavior" TEXT,
  ADD COLUMN "repairRequest" TEXT,
  ADD COLUMN "driverCanContinue" BOOLEAN,
  ADD COLUMN "healthState" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "managerStatus" TEXT NOT NULL DEFAULT 'RESOLVED',
  ADD COLUMN "managerNote" TEXT,
  ADD COLUMN "acknowledgedByUserId" UUID,
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedByUserId" UUID,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "workOrderId" UUID;

ALTER TABLE "VehicleInspection"
  ADD CONSTRAINT "VehicleInspection_loadState_check" CHECK ("loadState" IS NULL OR "loadState" IN ('EMPTY','PART_LOADED','LOADED','OVERLOAD_SUSPECTED')),
  ADD CONSTRAINT "VehicleInspection_healthState_check" CHECK ("healthState" IN ('UNKNOWN','HEALTHY','ATTENTION','CRITICAL')),
  ADD CONSTRAINT "VehicleInspection_managerStatus_check" CHECK ("managerStatus" IN ('RESOLVED','OPEN','ACKNOWLEDGED','IN_REPAIR'));

CREATE TABLE "InspectionEvidence" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "inspectionId" UUID NOT NULL,
  "storageLocator" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InspectionEvidence_size_check" CHECK ("sizeBytes" > 0)
);

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_healthSourceInspectionId_fkey" FOREIGN KEY ("healthSourceInspectionId") REFERENCES "VehicleInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleInspection"
  ADD CONSTRAINT "VehicleInspection_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "VehicleInspection_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "VehicleInspection_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "MaintenanceWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InspectionEvidence"
  ADD CONSTRAINT "InspectionEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InspectionEvidence_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "VehicleInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InspectionEvidence_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Vehicle_healthState_idx" ON "Vehicle"("organizationId","healthState");
CREATE INDEX "VehicleInspection_health_queue_idx" ON "VehicleInspection"("organizationId","managerStatus","healthState","createdAt" DESC);
CREATE INDEX "VehicleInspection_vehicle_health_idx" ON "VehicleInspection"("vehicleId","managerStatus","createdAt" DESC);
CREATE INDEX "InspectionEvidence_inspection_idx" ON "InspectionEvidence"("inspectionId","createdAt" DESC);
CREATE INDEX "InspectionEvidence_org_idx" ON "InspectionEvidence"("organizationId","createdAt" DESC);
