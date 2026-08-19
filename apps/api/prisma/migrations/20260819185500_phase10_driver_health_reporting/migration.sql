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

-- Existing active organizations receive the daily driver health checklist as part of deployment.
-- IDs are deterministic per organization so the migration is stable across environments.
WITH organizations AS (
  SELECT "id" AS "organizationId", md5("id"::text || ':driver-daily-vehicle-health')::uuid AS "templateId"
  FROM "Organization"
  WHERE "isActive" = TRUE
)
INSERT INTO "InspectionTemplate" ("id","organizationId","name","type","description","isActive","createdAt","updatedAt")
SELECT "templateId","organizationId",'Driver Daily Vehicle Health Check','DAILY',
       'Driver condition report covering vehicle behaviour, safety, load security and repair needs before or during daily operation.',
       TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM organizations
ON CONFLICT ("organizationId","name","type") DO UPDATE SET
  "description"=EXCLUDED."description","isActive"=TRUE,"updatedAt"=CURRENT_TIMESTAMP;

WITH templates AS (
  SELECT "id" AS "templateId"
  FROM "InspectionTemplate"
  WHERE "name"='Driver Daily Vehicle Health Check' AND "type"='DAILY'
), checklist("code","label","isCritical","sortOrder") AS (
  VALUES
    ('ENGINE_BEHAVIOUR','Engine start, idle, power and unusual smoke/noise',FALSE,0),
    ('DASH_WARNINGS','Dashboard warning lights and gauges',FALSE,1),
    ('SERVICE_BRAKES','Service brake response and stopping performance',TRUE,2),
    ('PARKING_BRAKE','Parking brake holding performance',TRUE,3),
    ('STEERING','Steering response, free play and unusual vibration',TRUE,4),
    ('TRANSMISSION','Clutch / gearbox / transmission behaviour',FALSE,5),
    ('SUSPENSION','Suspension, ride behaviour and unusual knocks',FALSE,6),
    ('TYRES_WHEELS','Tyres, wheels, wheel nuts and visible damage',TRUE,7),
    ('LIGHTS_ELECTRICAL','Headlights, indicators, brake lights, horn and electricals',FALSE,8),
    ('FLUIDS_LEAKS','Fuel, oil, coolant, brake-fluid or air leaks',TRUE,9),
    ('GLASS_MIRRORS_BODY','Windscreen, mirrors, doors, body and visible damage',FALSE,10),
    ('COUPLING_TRAILER','Fifth wheel / coupling / trailer connections',TRUE,11),
    ('LOAD_SECURITY','Cargo restraint, load distribution and load security',TRUE,12),
    ('SAFETY_EQUIPMENT','Fire extinguisher, warning triangles and first-aid equipment',FALSE,13)
)
INSERT INTO "InspectionTemplateItem" ("id","templateId","code","label","isCritical","sortOrder")
SELECT md5(t."templateId"::text || ':' || c."code")::uuid,t."templateId",c."code",c."label",c."isCritical",c."sortOrder"
FROM templates t CROSS JOIN checklist c
ON CONFLICT ("templateId","code") DO UPDATE SET
  "label"=EXCLUDED."label","isCritical"=EXCLUDED."isCritical","sortOrder"=EXCLUDED."sortOrder";
