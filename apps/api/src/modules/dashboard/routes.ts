import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", requirePermission(PERMISSIONS.DASHBOARD_VIEW), async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const now = new Date();
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 86_400_000);

  const [vehicles, drivers, activeDrivers, licencesExpiring, branches, users] = await prisma.$transaction([
    prisma.vehicle.count({ where: { organizationId, archivedAt: null } }),
    prisma.driver.count({ where: { organizationId, archivedAt: null } }),
    prisma.driver.count({ where: { organizationId, archivedAt: null, status: "ACTIVE", licenceExpiry: { gte: now } } }),
    prisma.driver.count({ where: { organizationId, archivedAt: null, licenceExpiry: { gte: now, lte: ninetyDaysFromNow } } }),
    prisma.branch.count({ where: { organizationId, isActive: true } }),
    prisma.user.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } })
  ]);

  const statuses = await prisma.vehicle.groupBy({
    by: ["status"],
    where: { organizationId, archivedAt: null },
    orderBy: { status: "asc" },
    _count: { _all: true }
  });

  return res.json({
    vehicles,
    drivers,
    activeDrivers,
    licencesExpiringWithin90Days: licencesExpiring,
    branches,
    activeUsers: users,
    vehicleStatus: Object.fromEntries(statuses.map((row) => [row.status, row._count._all]))
  });
});
