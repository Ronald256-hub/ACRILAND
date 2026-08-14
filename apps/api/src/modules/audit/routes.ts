import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const auditRouter=Router();
auditRouter.get("/",requirePermission(PERMISSIONS.AUDIT_VIEW),async(req,res)=>{
  const page=Math.max(Number(req.query.page??1),1),take=Math.min(Math.max(Number(req.query.limit??50),1),100);
  const where={organizationId:req.auth!.organizationId}; const [items,total]=await prisma.$transaction([prisma.auditLog.findMany({where,skip:(page-1)*take,take,orderBy:{createdAt:"desc"}}),prisma.auditLog.count({where})]); return res.json({items,total,page,limit:take});
});
