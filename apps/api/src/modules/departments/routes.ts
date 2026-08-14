import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const departmentsRouter=Router();
departmentsRouter.get("/",requirePermission(PERMISSIONS.DEPARTMENT_VIEW),async(req,res)=>res.json(await prisma.department.findMany({where:{organizationId:req.auth!.organizationId},include:{branch:true},orderBy:{name:"asc"}})));
departmentsRouter.post("/",requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),async(req,res)=>{
  const input=z.object({code:z.string().min(2).max(20),name:z.string().min(2).max(120),costCentre:z.string().max(50).optional(),branchId:z.string().uuid().optional()}).parse(req.body);
  if(input.branchId){const b=await prisma.branch.findFirst({where:{id:input.branchId,organizationId:req.auth!.organizationId}});if(!b)return res.status(400).json({error:"Branch does not belong to this organization."});}
  const row=await prisma.department.create({data:{organizationId:req.auth!.organizationId,code:input.code.toUpperCase(),name:input.name,costCentre:input.costCentre??null,branchId:input.branchId??null}});
  await audit(req,{action:"CREATE",recordType:"DEPARTMENT",recordId:row.id,newValue:row}); return res.status(201).json(row);
});
