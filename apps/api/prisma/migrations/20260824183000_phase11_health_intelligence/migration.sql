-- ACRILAND Fleet Command Centre - Phase 11 vehicle health intelligence
-- Organization-level policy keeps response expectations explicit and configurable.
ALTER TABLE "Organization"
  ADD COLUMN "healthCriticalAckMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "healthAttentionAckHours" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "healthFreshnessHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "healthRepeatWindowDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_healthCriticalAckMinutes_check" CHECK ("healthCriticalAckMinutes" BETWEEN 5 AND 1440),
  ADD CONSTRAINT "Organization_healthAttentionAckHours_check" CHECK ("healthAttentionAckHours" BETWEEN 1 AND 168),
  ADD CONSTRAINT "Organization_healthFreshnessHours_check" CHECK ("healthFreshnessHours" BETWEEN 4 AND 168),
  ADD CONSTRAINT "Organization_healthRepeatWindowDays_check" CHECK ("healthRepeatWindowDays" BETWEEN 7 AND 365);

-- Explicit permission for management/workshop health intelligence. Drivers keep the narrow self-service inspection permissions only.
INSERT INTO "Permission" ("id","key","description") VALUES
  ('b1100000-0000-4000-8000-000000000001','health.intelligence.view','health intelligence view')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permission("roleName","permissionKey") AS (VALUES
  ('SUPER_ADMINISTRATOR','health.intelligence.view'),
  ('ORGANIZATION_ADMINISTRATOR','health.intelligence.view'),
  ('FLEET_MANAGER','health.intelligence.view'),
  ('WORKSHOP_MANAGER','health.intelligence.view'),
  ('WORKSHOP_SUPERVISOR','health.intelligence.view'),
  ('MANAGEMENT_DIRECTOR','health.intelligence.view')
)
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r."id", p."id"
FROM role_permission rp
JOIN "Role" r ON r."name" = rp."roleName"
JOIN "Permission" p ON p."key" = rp."permissionKey"
ON CONFLICT ("roleId","permissionId") DO NOTHING;

-- Backfill a response target for existing driver-health alerts so the ageing queue is useful immediately.
UPDATE "OperationalAlert" a
SET "dueAt" = CASE
  WHEN a."severity" = 'CRITICAL' THEN a."createdAt" + INTERVAL '30 minutes'
  ELSE a."createdAt" + INTERVAL '8 hours'
END
WHERE a."category" = 'DRIVER_VEHICLE_HEALTH'
  AND a."sourceType" = 'VEHICLE_INSPECTION'
  AND a."status" <> 'CLOSED'
  AND a."dueAt" IS NULL;
