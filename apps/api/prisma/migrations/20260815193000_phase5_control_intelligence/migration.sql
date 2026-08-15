-- ACRILAND Fleet Command Centre - Phase 5 control, intelligence and lifecycle
CREATE TYPE "DispatchStatus" AS ENUM ('PLANNED','READY','DISPATCHED','COMPLETED','CANCELLED','BLOCKED');
CREATE TYPE "GeofenceShape" AS ENUM ('CIRCLE','POLYGON');
CREATE TYPE "GeofencePolicy" AS ENUM ('MONITOR','ALLOWED','RESTRICTED');
CREATE TYPE "GeofenceEventType" AS ENUM ('ENTRY','EXIT');
CREATE TYPE "SafetyEventType" AS ENUM ('SPEEDING','GEOFENCE_BREACH','INCIDENT','INSPECTION_FAILURE','AFTER_HOURS','OTHER');
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE','SUSPENDED','INACTIVE');
CREATE TYPE "CostCategory" AS ENUM ('ACQUISITION','FUEL','MAINTENANCE','TYRE','INSURANCE','LICENCE','TAX','TOLL','PARKING','ACCIDENT','OTHER');
CREATE TYPE "DisposalStatus" AS ENUM ('REQUESTED','APPROVED','REJECTED','COMPLETED','CANCELLED');
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL','IN_APP');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING','SENT','FAILED','SKIPPED');

CREATE TABLE "RoutePlan" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "waypoints" JSONB,
  "estimatedDistanceKm" NUMERIC(12,2),
  "expectedDurationMinutes" INTEGER,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoutePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RoutePlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RoutePlan_distance_check" CHECK ("estimatedDistanceKm" IS NULL OR "estimatedDistanceKm" >= 0),
  CONSTRAINT "RoutePlan_duration_check" CHECK ("expectedDurationMinutes" IS NULL OR "expectedDurationMinutes" > 0)
);
CREATE UNIQUE INDEX "RoutePlan_organizationId_name_key" ON "RoutePlan"("organizationId","name");
CREATE INDEX "RoutePlan_organizationId_isActive_idx" ON "RoutePlan"("organizationId","isActive");

CREATE TABLE "Geofence" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "shape" "GeofenceShape" NOT NULL,
  "policy" "GeofencePolicy" NOT NULL DEFAULT 'MONITOR',
  "centerLatitude" NUMERIC(10,7),
  "centerLongitude" NUMERIC(10,7),
  "radiusMetres" INTEGER,
  "polygon" JSONB,
  "speedLimitKph" INTEGER,
  "alertOnEntry" BOOLEAN NOT NULL DEFAULT FALSE,
  "alertOnExit" BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Geofence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Geofence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Geofence_latitude_check" CHECK ("centerLatitude" IS NULL OR ("centerLatitude" >= -90 AND "centerLatitude" <= 90)),
  CONSTRAINT "Geofence_longitude_check" CHECK ("centerLongitude" IS NULL OR ("centerLongitude" >= -180 AND "centerLongitude" <= 180)),
  CONSTRAINT "Geofence_radius_check" CHECK ("radiusMetres" IS NULL OR "radiusMetres" > 0),
  CONSTRAINT "Geofence_speed_limit_check" CHECK ("speedLimitKph" IS NULL OR ("speedLimitKph" > 0 AND "speedLimitKph" <= 250)),
  CONSTRAINT "Geofence_shape_payload_check" CHECK (("shape" = 'CIRCLE' AND "centerLatitude" IS NOT NULL AND "centerLongitude" IS NOT NULL AND "radiusMetres" IS NOT NULL) OR ("shape" = 'POLYGON' AND "polygon" IS NOT NULL))
);
CREATE UNIQUE INDEX "Geofence_organizationId_name_key" ON "Geofence"("organizationId","name");
CREATE INDEX "Geofence_organizationId_isActive_idx" ON "Geofence"("organizationId","isActive");

CREATE TABLE "DispatchPlan" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "dispatchNumber" TEXT NOT NULL,
  "tripId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "routePlanId" UUID,
  "geofenceId" UUID,
  "plannedDeparture" TIMESTAMP(3) NOT NULL,
  "plannedReturn" TIMESTAMP(3) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 3,
  "status" "DispatchStatus" NOT NULL DEFAULT 'PLANNED',
  "dispatchNotes" TEXT,
  "createdByUserId" UUID NOT NULL,
  "dispatchedByUserId" UUID,
  "dispatchedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DispatchPlan_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DispatchPlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DispatchPlan_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DispatchPlan_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DispatchPlan_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "Geofence"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DispatchPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DispatchPlan_dispatchedByUserId_fkey" FOREIGN KEY ("dispatchedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DispatchPlan_dates_check" CHECK ("plannedReturn" >= "plannedDeparture"),
  CONSTRAINT "DispatchPlan_priority_check" CHECK ("priority" BETWEEN 1 AND 5),
  CONSTRAINT "DispatchPlan_completion_check" CHECK ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL),
  CONSTRAINT "DispatchPlan_cancel_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL))
);
CREATE UNIQUE INDEX "DispatchPlan_organizationId_dispatchNumber_key" ON "DispatchPlan"("organizationId","dispatchNumber");
CREATE UNIQUE INDEX "DispatchPlan_tripId_key" ON "DispatchPlan"("tripId");
CREATE INDEX "DispatchPlan_organizationId_status_departure_idx" ON "DispatchPlan"("organizationId","status","plannedDeparture");
CREATE INDEX "DispatchPlan_vehicleId_status_idx" ON "DispatchPlan"("vehicleId","status");
CREATE INDEX "DispatchPlan_driverId_status_idx" ON "DispatchPlan"("driverId","status");

CREATE TABLE "GeofenceState" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "geofenceId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "isInside" BOOLEAN NOT NULL,
  "lastEvaluatedAt" TIMESTAMP(3) NOT NULL,
  "lastChangedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeofenceState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GeofenceState_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "Geofence"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GeofenceState_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GeofenceState_geofenceId_vehicleId_key" ON "GeofenceState"("geofenceId","vehicleId");
CREATE INDEX "GeofenceState_organizationId_updatedAt_idx" ON "GeofenceState"("organizationId","updatedAt");

CREATE TABLE "GeofenceEvent" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "geofenceId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "telemetrySnapshotId" UUID,
  "type" "GeofenceEventType" NOT NULL,
  "latitude" NUMERIC(10,7) NOT NULL,
  "longitude" NUMERIC(10,7) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeofenceEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GeofenceEvent_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "Geofence"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GeofenceEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GeofenceEvent_telemetrySnapshotId_fkey" FOREIGN KEY ("telemetrySnapshotId") REFERENCES "TelemetrySnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "GeofenceEvent_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "GeofenceEvent_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX "GeofenceEvent_snapshot_transition_key" ON "GeofenceEvent"("geofenceId","vehicleId","telemetrySnapshotId","type");
CREATE INDEX "GeofenceEvent_organizationId_occurredAt_idx" ON "GeofenceEvent"("organizationId","occurredAt");
CREATE INDEX "GeofenceEvent_vehicleId_occurredAt_idx" ON "GeofenceEvent"("vehicleId","occurredAt");

CREATE TABLE "DriverSafetyEvent" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "driverId" UUID,
  "vehicleId" UUID,
  "tripId" UUID,
  "type" "SafetyEventType" NOT NULL,
  "penaltyPoints" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverSafetyEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DriverSafetyEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DriverSafetyEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DriverSafetyEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DriverSafetyEvent_points_check" CHECK ("penaltyPoints" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "DriverSafetyEvent_source_key" ON "DriverSafetyEvent"("organizationId","sourceType","sourceId","type");
CREATE INDEX "DriverSafetyEvent_driverId_occurredAt_idx" ON "DriverSafetyEvent"("driverId","occurredAt");
CREATE INDEX "DriverSafetyEvent_organizationId_type_occurredAt_idx" ON "DriverSafetyEvent"("organizationId","type","occurredAt");

CREATE TABLE "DriverScoreSnapshot" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "score" INTEGER NOT NULL,
  "safetyEventPoints" INTEGER NOT NULL DEFAULT 0,
  "incidentPoints" INTEGER NOT NULL DEFAULT 0,
  "inspectionPoints" INTEGER NOT NULL DEFAULT 0,
  "riskBand" TEXT NOT NULL,
  "details" JSONB,
  "calculatedByUserId" UUID NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverScoreSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DriverScoreSnapshot_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DriverScoreSnapshot_calculatedByUserId_fkey" FOREIGN KEY ("calculatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DriverScoreSnapshot_period_check" CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "DriverScoreSnapshot_score_check" CHECK ("score" BETWEEN 0 AND 100),
  CONSTRAINT "DriverScoreSnapshot_points_check" CHECK ("safetyEventPoints" >= 0 AND "incidentPoints" >= 0 AND "inspectionPoints" >= 0)
);
CREATE UNIQUE INDEX "DriverScoreSnapshot_period_key" ON "DriverScoreSnapshot"("organizationId","driverId","periodStart","periodEnd");
CREATE INDEX "DriverScoreSnapshot_organizationId_calculatedAt_idx" ON "DriverScoreSnapshot"("organizationId","calculatedAt");
CREATE INDEX "DriverScoreSnapshot_driverId_calculatedAt_idx" ON "DriverScoreSnapshot"("driverId","calculatedAt");

CREATE TABLE "Vendor" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "contactPerson" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "taxId" TEXT,
  "paymentTerms" TEXT,
  "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
  "rating" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Vendor_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "Vendor_organizationId_code_key" ON "Vendor"("organizationId","code");
CREATE UNIQUE INDEX "Vendor_organizationId_name_key" ON "Vendor"("organizationId","name");
CREATE INDEX "Vendor_organizationId_status_category_idx" ON "Vendor"("organizationId","status","category");

CREATE TABLE "VehicleCostEntry" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "category" "CostCategory" NOT NULL,
  "amount" NUMERIC(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "vendorId" UUID,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleCostEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleCostEntry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleCostEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VehicleCostEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleCostEntry_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX "VehicleCostEntry_organizationId_occurredAt_idx" ON "VehicleCostEntry"("organizationId","occurredAt");
CREATE INDEX "VehicleCostEntry_vehicleId_occurredAt_idx" ON "VehicleCostEntry"("vehicleId","occurredAt");
CREATE INDEX "VehicleCostEntry_vendorId_occurredAt_idx" ON "VehicleCostEntry"("vendorId","occurredAt");
CREATE UNIQUE INDEX "VehicleCostEntry_source_key" ON "VehicleCostEntry"("organizationId","sourceType","sourceId","category") WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;

CREATE TABLE "VehicleDisposal" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "status" "DisposalStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedByUserId" UUID NOT NULL,
  "approvedByUserId" UUID,
  "disposalMethod" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "estimatedProceeds" NUMERIC(18,2),
  "actualProceeds" NUMERIC(18,2),
  "buyer" TEXT,
  "rejectionReason" TEXT,
  "notes" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleDisposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleDisposal_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleDisposal_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleDisposal_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleDisposal_proceeds_check" CHECK (("estimatedProceeds" IS NULL OR "estimatedProceeds" >= 0) AND ("actualProceeds" IS NULL OR "actualProceeds" >= 0)),
  CONSTRAINT "VehicleDisposal_maker_checker_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "requestedByUserId"),
  CONSTRAINT "VehicleDisposal_approval_check" CHECK ("status" NOT IN ('APPROVED','COMPLETED') OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
  CONSTRAINT "VehicleDisposal_completion_check" CHECK ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL),
  CONSTRAINT "VehicleDisposal_rejection_check" CHECK ("status" <> 'REJECTED' OR "rejectionReason" IS NOT NULL)
);
CREATE INDEX "VehicleDisposal_organizationId_status_requestedAt_idx" ON "VehicleDisposal"("organizationId","status","requestedAt");
CREATE INDEX "VehicleDisposal_vehicleId_status_idx" ON "VehicleDisposal"("vehicleId","status");
CREATE UNIQUE INDEX "VehicleDisposal_active_vehicle_key" ON "VehicleDisposal"("vehicleId") WHERE "status" IN ('REQUESTED','APPROVED');

CREATE TABLE "NotificationPreference" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "criticalOnly" BOOLEAN NOT NULL DEFAULT TRUE,
  "categories" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
CREATE INDEX "NotificationPreference_organizationId_emailEnabled_idx" ON "NotificationPreference"("organizationId","emailEnabled");

CREATE TABLE "NotificationDelivery" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "alertId" UUID,
  "userId" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "destination" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NotificationDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "OperationalAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotificationDelivery_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "NotificationDelivery_dedupeKey_key" ON "NotificationDelivery"("dedupeKey");
CREATE INDEX "NotificationDelivery_organizationId_status_createdAt_idx" ON "NotificationDelivery"("organizationId","status","createdAt");
CREATE INDEX "NotificationDelivery_userId_createdAt_idx" ON "NotificationDelivery"("userId","createdAt");

-- Phase 5 permissions for existing organizations. syncPlatformDefaults remains canonical for future organizations.
INSERT INTO "Permission" ("id","key","description") VALUES
  ('51000000-0000-4000-8000-000000000001','dispatch.view','dispatch view'),
  ('51000000-0000-4000-8000-000000000002','dispatch.manage','dispatch manage'),
  ('51000000-0000-4000-8000-000000000003','route.view','route view'),
  ('51000000-0000-4000-8000-000000000004','route.manage','route manage'),
  ('51000000-0000-4000-8000-000000000005','geofence.view','geofence view'),
  ('51000000-0000-4000-8000-000000000006','geofence.manage','geofence manage'),
  ('51000000-0000-4000-8000-000000000007','safety.view','safety view'),
  ('51000000-0000-4000-8000-000000000008','safety.view_self','safety view self'),
  ('51000000-0000-4000-8000-000000000009','safety.recalculate','safety recalculate'),
  ('51000000-0000-4000-8000-000000000010','vendor.view','vendor view'),
  ('51000000-0000-4000-8000-000000000011','vendor.manage','vendor manage'),
  ('51000000-0000-4000-8000-000000000012','lifecycle.view','lifecycle view'),
  ('51000000-0000-4000-8000-000000000013','lifecycle.cost.manage','lifecycle cost manage'),
  ('51000000-0000-4000-8000-000000000014','disposal.view','disposal view'),
  ('51000000-0000-4000-8000-000000000015','disposal.request','disposal request'),
  ('51000000-0000-4000-8000-000000000016','disposal.approve','disposal approve'),
  ('51000000-0000-4000-8000-000000000017','notification.view','notification view'),
  ('51000000-0000-4000-8000-000000000018','notification.manage','notification manage'),
  ('51000000-0000-4000-8000-000000000019','notification.dispatch','notification dispatch')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permission("roleName","permissionKey") AS (VALUES
  ('SUPER_ADMINISTRATOR','dispatch.view'),('SUPER_ADMINISTRATOR','dispatch.manage'),('SUPER_ADMINISTRATOR','route.view'),('SUPER_ADMINISTRATOR','route.manage'),('SUPER_ADMINISTRATOR','geofence.view'),('SUPER_ADMINISTRATOR','geofence.manage'),('SUPER_ADMINISTRATOR','safety.view'),('SUPER_ADMINISTRATOR','safety.view_self'),('SUPER_ADMINISTRATOR','safety.recalculate'),('SUPER_ADMINISTRATOR','vendor.view'),('SUPER_ADMINISTRATOR','vendor.manage'),('SUPER_ADMINISTRATOR','lifecycle.view'),('SUPER_ADMINISTRATOR','lifecycle.cost.manage'),('SUPER_ADMINISTRATOR','disposal.view'),('SUPER_ADMINISTRATOR','disposal.request'),('SUPER_ADMINISTRATOR','disposal.approve'),('SUPER_ADMINISTRATOR','notification.view'),('SUPER_ADMINISTRATOR','notification.manage'),('SUPER_ADMINISTRATOR','notification.dispatch'),
  ('ORGANIZATION_ADMINISTRATOR','dispatch.view'),('ORGANIZATION_ADMINISTRATOR','dispatch.manage'),('ORGANIZATION_ADMINISTRATOR','route.view'),('ORGANIZATION_ADMINISTRATOR','route.manage'),('ORGANIZATION_ADMINISTRATOR','geofence.view'),('ORGANIZATION_ADMINISTRATOR','geofence.manage'),('ORGANIZATION_ADMINISTRATOR','safety.view'),('ORGANIZATION_ADMINISTRATOR','safety.view_self'),('ORGANIZATION_ADMINISTRATOR','safety.recalculate'),('ORGANIZATION_ADMINISTRATOR','vendor.view'),('ORGANIZATION_ADMINISTRATOR','vendor.manage'),('ORGANIZATION_ADMINISTRATOR','lifecycle.view'),('ORGANIZATION_ADMINISTRATOR','lifecycle.cost.manage'),('ORGANIZATION_ADMINISTRATOR','disposal.view'),('ORGANIZATION_ADMINISTRATOR','disposal.request'),('ORGANIZATION_ADMINISTRATOR','disposal.approve'),('ORGANIZATION_ADMINISTRATOR','notification.view'),('ORGANIZATION_ADMINISTRATOR','notification.manage'),('ORGANIZATION_ADMINISTRATOR','notification.dispatch'),
  ('FLEET_MANAGER','dispatch.view'),('FLEET_MANAGER','dispatch.manage'),('FLEET_MANAGER','route.view'),('FLEET_MANAGER','route.manage'),('FLEET_MANAGER','geofence.view'),('FLEET_MANAGER','geofence.manage'),('FLEET_MANAGER','safety.view'),('FLEET_MANAGER','safety.recalculate'),('FLEET_MANAGER','vendor.view'),('FLEET_MANAGER','vendor.manage'),('FLEET_MANAGER','lifecycle.view'),('FLEET_MANAGER','lifecycle.cost.manage'),('FLEET_MANAGER','disposal.view'),('FLEET_MANAGER','disposal.request'),('FLEET_MANAGER','notification.view'),('FLEET_MANAGER','notification.manage'),('FLEET_MANAGER','notification.dispatch'),
  ('WORKSHOP_MANAGER','route.view'),('WORKSHOP_MANAGER','safety.view'),('WORKSHOP_MANAGER','vendor.view'),('WORKSHOP_MANAGER','vendor.manage'),('WORKSHOP_MANAGER','lifecycle.view'),('WORKSHOP_MANAGER','notification.view'),
  ('WORKSHOP_SUPERVISOR','route.view'),('WORKSHOP_SUPERVISOR','vendor.view'),('WORKSHOP_SUPERVISOR','lifecycle.view'),
  ('TECHNICIAN','vendor.view'),
  ('DRIVER','safety.view_self'),
  ('FINANCE_OFFICER','vendor.view'),('FINANCE_OFFICER','vendor.manage'),('FINANCE_OFFICER','lifecycle.view'),('FINANCE_OFFICER','lifecycle.cost.manage'),('FINANCE_OFFICER','disposal.view'),('FINANCE_OFFICER','disposal.approve'),('FINANCE_OFFICER','notification.view'),
  ('MANAGEMENT_DIRECTOR','dispatch.view'),('MANAGEMENT_DIRECTOR','route.view'),('MANAGEMENT_DIRECTOR','geofence.view'),('MANAGEMENT_DIRECTOR','safety.view'),('MANAGEMENT_DIRECTOR','vendor.view'),('MANAGEMENT_DIRECTOR','lifecycle.view'),('MANAGEMENT_DIRECTOR','disposal.view'),('MANAGEMENT_DIRECTOR','disposal.approve'),('MANAGEMENT_DIRECTOR','notification.view')
)
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r."id", p."id"
FROM role_permission rp
JOIN "Role" r ON r."name" = rp."roleName"
JOIN "Permission" p ON p."key" = rp."permissionKey"
ON CONFLICT ("roleId","permissionId") DO NOTHING;