import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { canTransitionVehicle, validateOdometer, type VehicleStatus } from "../../domain/rules.js";
import { requirePermission } from "../../middleware/authorize.js";
import { assertTenantReferences } from "../../lib/tenantRefs.js";

export const vehiclesRouter=Router();
const base=z.object({registrationNumber:z.string().min(2).max(30),fleetNumber:z.string().max(30).optional(),vin:z.string().min(5).max(50),engineNumber:z.string().max(50).optional(),make:z.string().min(2).max(60),model:z.string().min(1).max(60),variant:z.string().max(60).optional(),category:z.string().min(2).max(60),bodyType:z.string().max(60).optional(),manufacturingYear:z.number().int().min(1950).max(new Date().getFullYear()+1),registrationYear:z.number().int().min(1950).max(new Date().getFullYear()+1).optional(),fuelType:z.enum(["DIESEL","PETROL","ELECTRIC","HYBRID","LPG","CNG","OTHER"]),transmission:z.enum(["MANUAL","AUTOMATIC","AMT","CVT","OTHER"]).optional(),tankCapacityLitres:z.number().positive().max(5000).optional(),initialOdometerKm:z.number().int().min(0).default(0),currentOdometerKm:z.number().int().min(0).default(0),branchId:z.string().uuid().optional(),departmentId:z.string().uuid().optional(),currentLocation:z.string().max(200).optional(),notes:z.string().max(2000).optional()});

vehiclesRouter.get("/",requirePermission(PERMISSIONS.VEHICLE_VIEW),async(req,res)=>{
  const page=Math.max(Number(req.query.page??1),1),take=Math.min(Math.max(Number(req.query.limit??25),1),100); const q=String(req.query.q??"").trim();
  const where={organizationId:req.auth!.organizationId,archivedAt:null,...(q?{OR:[{registrationNumber:{contains:q,mode:"insensitive" as const}},{fleetNumber:{contains:q,mode:"insensitive" as const}},{vin:{contains:q,mode:"insensitive" as const}},{make:{contains:q,mode:"insensitive" as const}},{model:{contains:q,mode:"insensitive" as const}}]}:{})};
  const [items,total]=await prisma.$transaction([prisma.vehicle.findMany({where,skip:(page-1)*take,take,orderBy:{registrationNumber:"asc"},include:{branch:true,department:true}}),prisma.vehicle.count({where})]);
  return res.json({items,total,page,limit:take});
});

vehiclesRouter.post("/",requirePermission(PERMISSIONS.VEHICLE_CREATE),async(req,res)=>{
  const input=base.parse(req.body); validateOdometer(input.initialOdometerKm,input.currentOdometerKm);
  await assertTenantReferences(req.auth!.organizationId, input.branchId, input.departmentId);
  const row=await prisma.vehicle.create({data:{...input,organizationId:req.auth!.organizationId,registrationNumber:input.registrationNumber.toUpperCase(),vin:input.vin.toUpperCase()}});
  await audit(req,{action:"CREATE",recordType:"VEHICLE",recordId:row.id,newValue:row}); return res.status(201).json(row);
});

vehiclesRouter.patch("/:id",requirePermission(PERMISSIONS.VEHICLE_EDIT),async(req,res)=>{
  const input=base.partial().extend({status:z.enum(["AVAILABLE","RESERVED","ASSIGNED","ON_TRIP","PARKED","SERVICE_DUE","SERVICE_OVERDUE","UNDER_INSPECTION","UNDER_MAINTENANCE","BREAKDOWN","ACCIDENT","GROUNDED","OUT_OF_SERVICE","DISPOSED"]).optional(),reason:z.string().max(500).optional()}).parse(req.body);
  const current=await prisma.vehicle.findFirst({where:{id:req.params.id,organizationId:req.auth!.organizationId,archivedAt:null}}); if(!current)return res.status(404).json({error:"Vehicle not found."});
  const initial=input.initialOdometerKm??current.initialOdometerKm,currentOdo=input.currentOdometerKm??current.currentOdometerKm;validateOdometer(initial,currentOdo);
  await assertTenantReferences(req.auth!.organizationId, input.branchId ?? current.branchId ?? undefined, input.departmentId ?? current.departmentId ?? undefined);
  if(input.status && !canTransitionVehicle(current.status as VehicleStatus,input.status as VehicleStatus))return res.status(409).json({error:`Vehicle status cannot move directly from ${current.status} to ${input.status}.`});
  if(input.status && input.status!==current.status && ["GROUNDED","OUT_OF_SERVICE","DISPOSED"].includes(input.status) && !input.reason)return res.status(400).json({error:"A reason is required for this status change."});
  const {reason,...data}=input; const updated=await prisma.vehicle.update({where:{id:current.id},data}); await audit(req,{action:"UPDATE",recordType:"VEHICLE",recordId:current.id,oldValue:current,newValue:updated,reason}); return res.json(updated);
});
