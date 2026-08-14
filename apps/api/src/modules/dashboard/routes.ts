import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const dashboardRouter=Router();
dashboardRouter.get("/summary",requirePermission(PERMISSIONS.DASHBOARD_VIEW),async(req,res)=>{
  const org=req.auth!.organizationId; const now=new Date(); const ninety=new Date(now.getTime()+90*86_400_000);
  const [vehicles,drivers,activeDrivers,licencesExpiring,branches,users,statuses]=await prisma.$transaction([
    prisma.vehicle.count({where:{organizationId:org,archivedAt:null}}),prisma.driver.count({where:{organizationId:org,archivedAt:null}}),prisma.driver.count({where:{organizationId:org,archivedAt:null,status:"ACTIVE",licenceExpiry:{gte:now}}}),prisma.driver.count({where:{organizationId:org,archivedAt:null,licenceExpiry:{gte:now,lte:ninety}}}),prisma.branch.count({where:{organizationId:org,isActive:true}}),prisma.user.count({where:{organizationId:org,archivedAt:null,status:"ACTIVE"}}),prisma.vehicle.groupBy({by:["status"],where:{organizationId:org,archivedAt:null},_count:{_all:true}})
  ]);
  return res.json({vehicles,drivers,activeDrivers,licencesExpiringWithin90Days:licencesExpiring,branches,activeUsers:users,vehicleStatus:Object.fromEntries(statuses.map((x)=>[x.status,x._count._all]))});
});
