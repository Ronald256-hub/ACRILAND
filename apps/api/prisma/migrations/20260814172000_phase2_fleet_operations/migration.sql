-- ACRILAND Fleet Command Centre - Phase 2 fleet operations
CREATE TYPE "AssignmentType" AS ENUM ('PRIMARY','TEMPORARY','TRIP');
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE','ENDED','CANCELLED');
CREATE TYPE "TripStatus" AS ENUM ('REQUESTED','APPROVED','REJECTED','ALLOCATED','PRE_TRIP_INSPECTION','READY_TO_DEPART','ACTIVE','RETURNED','POST_TRIP_INSPECTION','CLOSED','CANCELLED');
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE "InspectionType" AS ENUM ('PRE_TRIP','POST_TRIP','DAILY','WEEKLY','WORKSHOP','SAFETY','HANDOVER');
CREATE TYPE "InspectionItemResult" AS ENUM ('PASS','ATTENTION_REQUIRED','FAIL','NOT_APPLICABLE');
CREATE TYPE "InspectionStatus" AS ENUM ('IN_PROGRESS','PASSED','FAILED','COMPLETED_WITH_ATTENTION');

CREATE TABLE "VehicleAssignment" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "assignmentType" "AssignmentType" NOT NULL,
  "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "purpose" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endAt" TIMESTAMP(3),
  "assignedByUserId" UUID NOT NULL,
  "endedByUserId" UUID,
  "handoverConfirmed" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleAssignment_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleAssignment_dates_check" CHECK ("endAt" IS NULL OR "endAt" >= "startAt")
);
CREATE INDEX "VehicleAssignment_organizationId_status_idx" ON "VehicleAssignment"("organizationId","status");
CREATE INDEX "VehicleAssignment_vehicleId_status_idx" ON "VehicleAssignment"("vehicleId","status");
CREATE INDEX "VehicleAssignment_driverId_status_idx" ON "VehicleAssignment"("driverId","status");
CREATE UNIQUE INDEX "VehicleAssignment_active_vehicle_key" ON "VehicleAssignment"("vehicleId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "VehicleAssignment_active_driver_key" ON "VehicleAssignment"("driverId") WHERE "status" = 'ACTIVE';

CREATE TABLE "Trip" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "tripNumber" TEXT NOT NULL,
  "vehicleId" UUID,
  "driverId" UUID,
  "assignmentId" UUID,
  "requesterUserId" UUID NOT NULL,
  "departmentId" UUID,
  "purpose" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "intermediateStops" JSONB,
  "requestedDeparture" TIMESTAMP(3) NOT NULL,
  "expectedReturn" TIMESTAMP(3) NOT NULL,
  "actualDeparture" TIMESTAMP(3),
  "actualReturn" TIMESTAMP(3),
  "startingOdometerKm" INTEGER,
  "endingOdometerKm" INTEGER,
  "distanceKm" INTEGER,
  "startingFuelPercent" INTEGER,
  "endingFuelPercent" INTEGER,
  "passengerCount" INTEGER NOT NULL DEFAULT 0,
  "cargoInfo" TEXT,
  "status" "TripStatus" NOT NULL DEFAULT 'REQUESTED',
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Trip_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "VehicleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Trip_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Trip_schedule_check" CHECK ("expectedReturn" >= "requestedDeparture"),
  CONSTRAINT "Trip_odometer_check" CHECK ("startingOdometerKm" IS NULL OR "startingOdometerKm" >= 0),
  CONSTRAINT "Trip_end_odometer_check" CHECK ("endingOdometerKm" IS NULL OR ("startingOdometerKm" IS NOT NULL AND "endingOdometerKm" >= "startingOdometerKm")),
  CONSTRAINT "Trip_distance_check" CHECK ("distanceKm" IS NULL OR "distanceKm" >= 0),
  CONSTRAINT "Trip_start_fuel_check" CHECK ("startingFuelPercent" IS NULL OR "startingFuelPercent" BETWEEN 0 AND 100),
  CONSTRAINT "Trip_end_fuel_check" CHECK ("endingFuelPercent" IS NULL OR "endingFuelPercent" BETWEEN 0 AND 100),
  CONSTRAINT "Trip_passengers_check" CHECK ("passengerCount" >= 0)
);
CREATE UNIQUE INDEX "Trip_organizationId_tripNumber_key" ON "Trip"("organizationId","tripNumber");
CREATE INDEX "Trip_organizationId_status_requestedDeparture_idx" ON "Trip"("organizationId","status","requestedDeparture");
CREATE INDEX "Trip_vehicleId_status_idx" ON "Trip"("vehicleId","status");
CREATE INDEX "Trip_driverId_status_idx" ON "Trip"("driverId","status");
CREATE INDEX "Trip_requesterUserId_status_idx" ON "Trip"("requesterUserId","status");

CREATE TABLE "TripApproval" (
  "id" UUID PRIMARY KEY,
  "tripId" UUID NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'FLEET_MANAGER',
  "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
  "approverUserId" UUID,
  "comments" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripApproval_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TripApproval_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TripApproval_tripId_decision_idx" ON "TripApproval"("tripId","decision");

CREATE TABLE "InspectionTemplate" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "InspectionType" NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InspectionTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InspectionTemplate_organizationId_name_type_key" ON "InspectionTemplate"("organizationId","name","type");
CREATE INDEX "InspectionTemplate_organizationId_type_isActive_idx" ON "InspectionTemplate"("organizationId","type","isActive");

CREATE TABLE "InspectionTemplateItem" (
  "id" UUID PRIMARY KEY,
  "templateId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "isCritical" BOOLEAN NOT NULL DEFAULT FALSE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InspectionTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InspectionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InspectionTemplateItem_templateId_code_key" ON "InspectionTemplateItem"("templateId","code");
CREATE INDEX "InspectionTemplateItem_templateId_sortOrder_idx" ON "InspectionTemplateItem"("templateId","sortOrder");

CREATE TABLE "VehicleInspection" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "driverId" UUID,
  "tripId" UUID,
  "templateId" UUID,
  "type" "InspectionType" NOT NULL,
  "odometerKm" INTEGER NOT NULL,
  "status" "InspectionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "notes" TEXT,
  "performedByUserId" UUID NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleInspection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleInspection_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleInspection_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VehicleInspection_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VehicleInspection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InspectionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VehicleInspection_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleInspection_odometer_check" CHECK ("odometerKm" >= 0)
);
CREATE INDEX "VehicleInspection_organizationId_type_createdAt_idx" ON "VehicleInspection"("organizationId","type","createdAt");
CREATE INDEX "VehicleInspection_vehicleId_createdAt_idx" ON "VehicleInspection"("vehicleId","createdAt");
CREATE INDEX "VehicleInspection_tripId_type_idx" ON "VehicleInspection"("tripId","type");

CREATE TABLE "InspectionResult" (
  "id" UUID PRIMARY KEY,
  "inspectionId" UUID NOT NULL,
  "templateItemId" UUID NOT NULL,
  "labelSnapshot" TEXT NOT NULL,
  "result" "InspectionItemResult" NOT NULL,
  "isCritical" BOOLEAN NOT NULL DEFAULT FALSE,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "VehicleInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InspectionResult_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "InspectionTemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InspectionResult_inspectionId_templateItemId_key" ON "InspectionResult"("inspectionId","templateItemId");
CREATE INDEX "InspectionResult_inspectionId_result_idx" ON "InspectionResult"("inspectionId","result");
