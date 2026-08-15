import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { validateOdometer } from "../../domain/rules.js";
import { requirePermission } from "../../middleware/authorize.js";

export const tyresRouter = Router();
function routeId(value:string|string[]|undefined):string|null{return typeof value==="string"?value:null;}

async function enrich<T extends {currentVehicleId:string|null}>(items:T[]){
  const ids=[...new Set(items.map(i=>i.currentVehicleId).filter((x):x is string=>Boolean(x)))];
  const vehicles=ids.length?await prisma.vehicle.findMany({where:{id:{in:ids}},select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,currentOdometerKm:true,status:true}}):[];
  const map=new Map(vehicles.map(v=>[v.id,v]));
  return items.map(item=>({...item,vehicle:item.currentVehicleId?map.get(item.currentVehicleId)??null:null}));
}

tyresRouter.get("/",requirePermission(PERMISSIONS.TYRE_VIEW),async(req,res)=>{
  const items=await prisma.tyreAsset.findMany({where:{organizationId:req.auth!.organizationId},orderBy:[{status:"asc"},{createdAt:"desc"}],take:500});
  return res.json({items:await enrich(items)});
});

tyresRouter.post("/",requirePermission(PERMISSIONS.TYRE_MANAGE),async(req,res)=>{
  const input=z.object({serialNumber:z.string().min(2).max(120),brand:z.string().min(1).max(120),size:z.string().min(1).max(80),purchaseDate:z.coerce.date().optional(),purchaseCost:z.number().min(0).optional(),initialTreadDepthMm:z.number().min(0).max(100).optional(),notes:z.string().max(2000).optional()}).parse(req.body);
  const created=await prisma.tyreAsset.create({data:{organizationId:req.auth!.organizationId,serialNumber:input.serialNumber.trim(),brand:input.brand.trim(),size:input.size.trim(),purchaseDate:input.purchaseDate??null,purchaseCost:input.purchaseCost??null,initialTreadDepthMm:input.initialTreadDepthMm??null,currentTreadDepthMm:input.initialTreadDepthMm??null,notes:input.notes??null}});
  await audit(req,{action:"CREATE",recordType:"TYRE",recordId:created.id,newValue:created});return res.status(201).json(created);
});

tyresRouter.patch("/:id",requirePermission(PERMISSIONS.TYRE_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid tyre id."});
  const input=z.object({brand:z.string().min(1).max(120).optional(),size:z.string().min(1).max(80).optional(),purchaseDate:z.coerce.date().nullable().optional(),purchaseCost:z.number().min(0).nullable().optional(),currentTreadDepthMm:z.number().min(0).max(100).nullable().optional(),notes:z.string().max(2000).nullable().optional()}).parse(req.body);
  const tyre=await prisma.tyreAsset.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!tyre)return res.status(404).json({error:"Tyre not found."});
  const data:Prisma.TyreAssetUncheckedUpdateInput={};if(input.brand!==undefined)data.brand=input.brand;if(input.size!==undefined)data.size=input.size;if(input.purchaseDate!==undefined)data.purchaseDate=input.purchaseDate;if(input.purchaseCost!==undefined)data.purchaseCost=input.purchaseCost;if(input.currentTreadDepthMm!==undefined)data.currentTreadDepthMm=input.currentTreadDepthMm;if(input.notes!==undefined)data.notes=input.notes;
  const updated=await prisma.tyreAsset.update({where:{id:tyre.id},data});await audit(req,{action:"UPDATE",recordType:"TYRE",recordId:tyre.id,oldValue:tyre,newValue:updated});return res.json(updated);
});

tyresRouter.post("/:id/fit",requirePermission(PERMISSIONS.TYRE_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid tyre id."});
  const input=z.object({vehicleId:z.string().uuid(),position:z.string().min(1).max(60),odometerKm:z.number().int().min(0),treadDepthMm:z.number().min(0).max(100).optional()}).parse(req.body);
  const [tyre,vehicle]=await Promise.all([prisma.tyreAsset.findFirst({where:{id,organizationId:req.auth!.organizationId}}),prisma.vehicle.findFirst({where:{id:input.vehicleId,organizationId:req.auth!.organizationId,archivedAt:null}})]);
  if(!tyre)return res.status(404).json({error:"Tyre not found."});if(!vehicle)return res.status(404).json({error:"Vehicle not found."});if(["FITTED","SCRAPPED"].includes(tyre.status))return res.status(409).json({error:`Tyre cannot be fitted while its status is ${tyre.status}.`});validateOdometer(vehicle.currentOdometerKm,input.odometerKm);
  const now=new Date();
  const updated=await prisma.$transaction(async tx=>{await tx.tyreFitment.create({data:{organizationId:req.auth!.organizationId,tyreId:tyre.id,vehicleId:vehicle.id,position:input.position.trim().toUpperCase(),fittedAt:now,odometerKmAtFit:input.odometerKm,performedByUserId:req.auth!.userId}});return tx.tyreAsset.update({where:{id:tyre.id},data:{status:"FITTED",currentVehicleId:vehicle.id,position:input.position.trim().toUpperCase(),fittedAt:now,removedAt:null,mileageAtFitKm:input.odometerKm,mileageAtRemovalKm:null,currentTreadDepthMm:input.treadDepthMm??tyre.currentTreadDepthMm}});});
  await audit(req,{action:"FIT",recordType:"TYRE",recordId:tyre.id,oldValue:{status:tyre.status},newValue:{status:updated.status,vehicleId:vehicle.id,position:updated.position}});return res.json(updated);
});

tyresRouter.post("/:id/remove",requirePermission(PERMISSIONS.TYRE_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid tyre id."});
  const input=z.object({odometerKm:z.number().int().min(0),nextStatus:z.enum(["IN_STOCK","REPAIR","SCRAPPED"]),treadDepthMm:z.number().min(0).max(100).optional(),reason:z.string().min(2).max(1000)}).parse(req.body);
  const tyre=await prisma.tyreAsset.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!tyre||tyre.status!=="FITTED"||!tyre.currentVehicleId||tyre.mileageAtFitKm===null)return res.status(409).json({error:"Only a currently fitted tyre can be removed."});
  if(input.odometerKm<tyre.mileageAtFitKm)return res.status(400).json({error:"Removal odometer cannot be below fitment odometer."});
  const active=await prisma.tyreFitment.findFirst({where:{organizationId:req.auth!.organizationId,tyreId:tyre.id,removedAt:null},orderBy:{fittedAt:"desc"}});if(!active)return res.status(409).json({error:"Active tyre fitment record is missing."});const now=new Date();
  const updated=await prisma.$transaction(async tx=>{await tx.tyreFitment.update({where:{id:active.id},data:{removedAt:now,odometerKmAtRemoval:input.odometerKm,removalReason:input.reason}});return tx.tyreAsset.update({where:{id:tyre.id},data:{status:input.nextStatus,currentVehicleId:null,position:null,removedAt:now,mileageAtRemovalKm:input.odometerKm,currentTreadDepthMm:input.treadDepthMm??tyre.currentTreadDepthMm}});});
  await audit(req,{action:"REMOVE",recordType:"TYRE",recordId:tyre.id,oldValue:{status:tyre.status,vehicleId:tyre.currentVehicleId,position:tyre.position},newValue:{status:updated.status,mileageAtRemovalKm:input.odometerKm},reason:input.reason});return res.json(updated);
});

tyresRouter.get("/:id/history",requirePermission(PERMISSIONS.TYRE_VIEW),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid tyre id."});const tyre=await prisma.tyreAsset.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!tyre)return res.status(404).json({error:"Tyre not found."});
  const rows=await prisma.tyreFitment.findMany({where:{organizationId:req.auth!.organizationId,tyreId:tyre.id},orderBy:{fittedAt:"desc"}});const vehicleIds=[...new Set(rows.map(r=>r.vehicleId))];const vehicles=await prisma.vehicle.findMany({where:{id:{in:vehicleIds}},select:{id:true,registrationNumber:true,fleetNumber:true}});const map=new Map(vehicles.map(v=>[v.id,v]));return res.json({tyre,items:rows.map(row=>({...row,vehicle:map.get(row.vehicleId)??null,distanceKm:row.odometerKmAtRemoval===null?null:row.odometerKmAtRemoval-row.odometerKmAtFit}))});
});
