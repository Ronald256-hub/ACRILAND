import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { audit } from "../../lib/audit.js";
import { requirePermission } from "../../middleware/authorize.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { assertTenantReferences } from "../../lib/tenantRefs.js";

export const usersRouter = Router();

usersRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, include: { roles: { include: { role: true } }, branch: true, department: true } });
  return res.json({ id: user.id, fullName: user.fullName, email: user.email, mustChangePassword: user.mustChangePassword, roles: user.roles.map((r) => r.role.name), permissions: [...req.auth!.permissions], branch: user.branch, department: user.department });
});

usersRouter.get("/roles", requirePermission(PERMISSIONS.USER_VIEW), async (req, res) => {
  const roles = await prisma.role.findMany({ where: { organizationId: req.auth!.organizationId }, select: { id: true, name: true, description: true }, orderBy: { name: "asc" } });
  return res.json(roles);
});

usersRouter.get("/", requirePermission(PERMISSIONS.USER_VIEW), async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1); const take = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
  const where = { organizationId: req.auth!.organizationId, archivedAt: null };
  const [items,total] = await prisma.$transaction([
    prisma.user.findMany({ where, skip: (page-1)*take, take, orderBy: { fullName: "asc" }, select: { id:true,fullName:true,email:true,phone:true,status:true,mustChangePassword:true,lastLoginAt:true,branch:true,department:true,roles:{include:{role:true}} } }),
    prisma.user.count({ where })
  ]);
  return res.json({ items, total, page, limit: take });
});

usersRouter.post("/", requirePermission(PERMISSIONS.USER_CREATE), async (req, res) => {
  const input = z.object({ fullName:z.string().min(2).max(120), email:z.string().email(), phone:z.string().max(30).optional(), temporaryPassword:z.string().min(12).max(128), roleNames:z.array(z.string()).min(1), branchId:z.string().uuid().optional(), departmentId:z.string().uuid().optional() }).parse(req.body);
  await assertTenantReferences(req.auth!.organizationId, input.branchId, input.departmentId);
  const roles = await prisma.role.findMany({ where: { organizationId:req.auth!.organizationId, name:{in:input.roleNames} } });
  if (roles.length !== input.roleNames.length) return res.status(400).json({ error:"One or more roles are invalid for this organization." });
  if (roles.some((r) => r.name === "DRIVER")) return res.status(400).json({ error:"Driver portal accounts must be created from Driver Management." });
  const user = await prisma.user.create({ data: { organizationId:req.auth!.organizationId,fullName:input.fullName,email:input.email.toLowerCase(),phone:input.phone,passwordHash:await hashPassword(input.temporaryPassword),mustChangePassword:true,branchId:input.branchId,departmentId:input.departmentId,roles:{create:roles.map((r)=>({roleId:r.id}))} } });
  await audit(req,{action:"CREATE",recordType:"USER",recordId:user.id,newValue:{fullName:user.fullName,email:user.email,roleNames:input.roleNames}});
  return res.status(201).json({ id:user.id, fullName:user.fullName, email:user.email, status:user.status });
});

usersRouter.patch("/:id/status", requirePermission(PERMISSIONS.USER_DISABLE), async (req,res)=>{
  const input=z.object({status:z.enum(["ACTIVE","DISABLED"]),reason:z.string().min(3).max(500)}).parse(req.body);
  const current=await prisma.user.findFirst({where:{id:req.params.id,organizationId:req.auth!.organizationId,archivedAt:null}});
  if(!current) return res.status(404).json({error:"User not found."});
  if(current.id===req.auth!.userId && input.status==="DISABLED") return res.status(400).json({error:"You cannot disable your own account."});
  if(req.auth!.roles.includes("FLEET_MANAGER")) {
    const targetRoles=await prisma.userRole.findMany({where:{userId:current.id},include:{role:true}});
    if(targetRoles.length === 0 || targetRoles.some((r)=>r.role.name!=="DRIVER")) return res.status(403).json({error:"Fleet Managers may disable driver-only portal accounts only."});
  }
  const updated=await prisma.user.update({where:{id:current.id},data:{status:input.status,lockedUntil:null,failedLoginCount:0}});
  if(input.status==="DISABLED") await prisma.session.updateMany({where:{userId:current.id,revokedAt:null},data:{revokedAt:new Date()}});
  await audit(req,{action:"UPDATE",recordType:"USER",recordId:current.id,oldValue:{status:current.status},newValue:{status:updated.status},reason:input.reason});
  return res.json({id:updated.id,status:updated.status});
});
