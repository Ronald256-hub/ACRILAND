-- Phase 5 runtime hardening after initial control-intelligence schema.
-- Cancelled dispatch plans remain immutable history but no longer prevent replanning the same trip.
DROP INDEX IF EXISTS "DispatchPlan_tripId_key";
CREATE UNIQUE INDEX "DispatchPlan_current_trip_key" ON "DispatchPlan"("tripId") WHERE "status" <> 'CANCELLED';

-- Every persisted geofence transition must be backed by immutable telemetry evidence.
ALTER TABLE "GeofenceEvent" DROP CONSTRAINT "GeofenceEvent_telemetrySnapshotId_fkey";
ALTER TABLE "GeofenceEvent" ALTER COLUMN "telemetrySnapshotId" SET NOT NULL;
ALTER TABLE "GeofenceEvent"
  ADD CONSTRAINT "GeofenceEvent_telemetrySnapshotId_fkey" FOREIGN KEY ("telemetrySnapshotId") REFERENCES "TelemetrySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PROCESSING allows one worker to atomically claim a delivery and prevents duplicate sends
-- if a scheduler and an authorized manual delivery run overlap.
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
