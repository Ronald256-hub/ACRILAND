import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const branchesRouter=Router();
branchesRouter.get("/",requirePermission(PERMISSIONS.BRANCH_VIEW),async(req,res)=>res.json(await prisma.branch.findMany({where:{organizationId:req.auth!.organizationId},orderBy:{name:"asc"}})));
branchesRouter.post("/",requirePermission(PERMISSIONS.BRANCH_MANAGE),async(req,res)=>{
  const input=z.object({code:z.string().min(2).max(20),name:z.string().min(2).max(120),address:z.string().max(300).optional()}).parse(req.body);
  const row=await prisma.branch.create({data:{organizationId:req.auth!.organizationId,code:input.code.toUpperCase(),name:input.name,address:input.address}});
  await audit(req,{action:"CREATE",recordType:"BRANCH",recordId:row.id,newValue:row}); return res.status(201).json(row);
});
