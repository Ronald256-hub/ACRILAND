-- Phase 6 web workspace permission for existing organizations.
INSERT INTO "Permission" ("id","key","description") VALUES
  ('61000000-0000-4000-8000-000000000001','settings.manage','settings manage')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permission("roleName","permissionKey") AS (VALUES
  ('SUPER_ADMINISTRATOR','settings.manage'),
  ('ORGANIZATION_ADMINISTRATOR','settings.manage'),
  ('FLEET_MANAGER','settings.manage')
)
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r."id", p."id"
FROM role_permission rp
JOIN "Role" r ON r."name" = rp."roleName"
JOIN "Permission" p ON p."key" = rp."permissionKey"
ON CONFLICT ("roleId","permissionId") DO NOTHING;
