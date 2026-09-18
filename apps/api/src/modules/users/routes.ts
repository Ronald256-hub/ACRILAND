import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { audit } from "../../lib/audit.js";
import { requirePermission } from "../../middleware/authorize.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { assertTenantReferences } from "../../lib/tenantRefs.js";
import { requireFreshMfa } from "../../middleware/mfa.js";

export const usersRouter = Router();

const PROTECTED_ADMIN_ROLES = new Set(["SUPER_ADMINISTRATOR", "ORGANIZATION_ADMINISTRATOR"]);

usersRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, include: { roles: { include: { role: true } }, branch: true, department: true, driver: { select: { id: true } } } });
  return res.json({ id: user.id, fullName: user.fullName, email: user.email, mustChangePassword: user.mustChangePassword, roles: user.roles.map((r) => r.role.name), permissions: [...req.auth!.permissions], branch: user.branch, department: user.department, driverId: user.driver?.id ?? null });
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

usersRouter.post("/", requireFreshMfa, requirePermission(PERMISSIONS.USER_CREATE), async (req, res) => {
  const input = z.object({
    fullName:z.string().min(2).max(120),
    email:z.string().email(),
    phone:z.string().max(30).optional(),
    temporaryPassword:z.string().min(12).max(128),
    roleNames:z.array(z.string().min(1).max(80)).min(1).max(10),
    branchId:z.string().uuid().optional(),
    departmentId:z.string().uuid().optional()
  }).parse(req.body);

  if (new Set(input.roleNames).size !== input.roleNames.length) return res.status(400).json({ error:"Duplicate roles are not allowed." });

  await assertTenantReferences(req.auth!.organizationId, input.branchId, input.departmentId);

  const roles = await prisma.role.findMany({
    where: { organizationId:req.auth!.organizationId, name:{in:input.roleNames} },
    include: { permissions:{include:{permission:{select:{key:true}}}} }
  });

  if (roles.length !== input.roleNames.length) return res.status(400).json({ error:"One or more roles are invalid for this organization." });
  if (roles.some((r) => r.name === "DRIVER")) return res.status(400).json({ error:"Driver portal accounts must be created from Driver Management." });

  const isSuperAdmin = req.auth!.roles.includes("SUPER_ADMINISTRATOR");
  if (roles.some((r) => PROTECTED_ADMIN_ROLES.has(r.name)) && !isSuperAdmin) {
    return res.status(403).json({ error:"Only a Super Administrator may provision protected administrator roles." });
  }

  const actorPermissions = req.auth!.permissions;
  const attemptsToGrantOutsideActor = roles.some((role) => role.permissions.some((rp) => !actorPermissions.has(rp.permission.key)));
  if (attemptsToGrantOutsideActor) {
    return res.status(403).json({ error:"You cannot provision a role containing permissions you do not currently hold." });
  }

  const user = await prisma.user.create({
    data: {
      organizationId:req.auth!.organizationId,
      fullName:input.fullName,
      email:input.email.toLowerCase(),
      phone:input.phone??null,
      passwordHash:await hashPassword(input.temporaryPassword),
      mustChangePassword:true,
      branchId:input.branchId??null,
      departmentId:input.departmentId??null,
      roles:{create:roles.map((r)=>({roleId:r.id}))}
    }
  });

  await audit(req,{action:"CREATE",recordType:"USER",recordId:user.id,newValue:{fullName:user.fullName,email:user.email,roleNames:input.roleNames}});
  return res.status(201).json({ id:user.id, fullName:user.fullName, email:user.email, status:user.status });
});

usersRouter.patch("/:id/status", requireFreshMfa, requirePermission(PERMISSIONS.USER_DISABLE), async (req,res)=>{
  const input=z.object({status:z.enum(["ACTIVE","DISABLED"]),reason:z.string().min(3).max(500)}).parse(req.body);
  const userId=typeof req.params.id === "string" ? req.params.id : null;
  if(!userId) return res.status(400).json({error:"Invalid user id."});

  const result=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{id:string;organizationId:string;status:string}>>(Prisma.sql`
      SELECT "id","organizationId","status"
      FROM "User"
      WHERE "id"=${userId}::uuid
        AND "organizationId"=${req.auth!.organizationId}::uuid
        AND "archivedAt" IS NULL
      FOR UPDATE
    `);
    const current=rows[0];
    if(!current) return {kind:"not_found" as const};

    const targetRoles=await tx.userRole.findMany({where:{userId},include:{role:true}});
    const protectedTarget=targetRoles.some((r)=>PROTECTED_ADMIN_ROLES.has(r.role.name));
    const isSuperAdmin=req.auth!.roles.includes("SUPER_ADMINISTRATOR");

    if(current.id===req.auth!.userId && input.status==="DISABLED") return {kind:"self_disable" as const};
    if(protectedTarget && !isSuperAdmin) return {kind:"protected_target" as const};

    if(req.auth!.roles.includes("FLEET_MANAGER")) {
      if(targetRoles.length === 0 || targetRoles.some((r)=>r.role.name!=="DRIVER")) return {kind:"fleet_scope" as const};
    }

    if(input.status==="DISABLED" && protectedTarget){
      const protectedActiveCount=await tx.user.count({
        where:{
          organizationId:req.auth!.organizationId,
          archivedAt:null,
          status:"ACTIVE",
          roles:{some:{role:{name:{in:["SUPER_ADMINISTRATOR","ORGANIZATION_ADMINISTRATOR"]}}}}
        }
      });
      if(protectedActiveCount<=1) return {kind:"last_admin" as const};
    }

    const updated=await tx.user.update({where:{id:current.id},data:{status:input.status,lockedUntil:null,failedLoginCount:0}});
    if(input.status==="DISABLED") {
      await tx.session.updateMany({where:{userId:current.id,revokedAt:null},data:{revokedAt:new Date()}});
    }
    return {kind:"updated" as const,id:updated.id,oldStatus:current.status,newStatus:updated.status};
  });

  if(result.kind==="not_found") return res.status(404).json({error:"User not found."});
  if(result.kind==="self_disable") return res.status(400).json({error:"You cannot disable your own account."});
  if(result.kind==="protected_target") return res.status(403).json({error:"Only a Super Administrator may change the status of protected administrator accounts."});
  if(result.kind==="fleet_scope") return res.status(403).json({error:"Fleet Managers may disable driver-only portal accounts only."});
  if(result.kind==="last_admin") return res.status(400).json({error:"The last active protected administrator cannot be disabled."});

  await audit(req,{action:"UPDATE",recordType:"USER",recordId:result.id,oldValue:{status:result.oldStatus},newValue:{status:result.newStatus},reason:input.reason});
  return res.json({id:result.id,status:result.newStatus});
});
