import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const telemetryRouter=Router();
function routeId(value:string|string[]|undefined):string|null{return typeof value==="string"?value:null;}

telemetryRouter.get("/latest",requirePermission(PERMISSIONS.TELEMETRY_VIEW),async(req,res)=>{
  const organizationId=req.auth!.organizationId;
  const vehicles=await prisma.vehicle.findMany({where:{organizationId,archivedAt:null},orderBy:{registrationNumber:"asc"},select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,status:true,currentOdometerKm:true,currentLocation:true}});
  const snapshots=vehicles.length?await prisma.telemetrySnapshot.findMany({where:{organizationId,vehicleId:{in:vehicles.map(v=>v.id)}},orderBy:{recordedAt:"desc"},distinct:["vehicleId"]}):[];
  const map=new Map(snapshots.map(row=>[row.vehicleId,row]));
  return res.json({items:vehicles.map(vehicle=>{const latest=map.get(vehicle.id);return latest?{...latest,vehicle}:{id:`vehicle-${vehicle.id}`,vehicleId:vehicle.id,provider:"MANUAL / NO GPS",externalDeviceId:null,latitude:null,longitude:null,speedKph:null,ignitionOn:null,odometerKm:vehicle.currentOdometerKm,fuelPercent:null,headingDegrees:null,recordedAt:null,receivedAt:null,vehicle};})});
});

telemetryRouter.get("/vehicles/:id/history",requirePermission(PERMISSIONS.TELEMETRY_VIEW),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid vehicle id."});const vehicle=await prisma.vehicle.findFirst({where:{id,organizationId:req.auth!.organizationId,archivedAt:null},select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,status:true}});if(!vehicle)return res.status(404).json({error:"Vehicle not found."});const limit=Math.min(500,Math.max(1,Number(req.query.limit??100)));const items=await prisma.telemetrySnapshot.findMany({where:{organizationId:req.auth!.organizationId,vehicleId:vehicle.id},orderBy:{recordedAt:"desc"},take:limit});return res.json({vehicle,items});
});

telemetryRouter.post("/ingest",requirePermission(PERMISSIONS.TELEMETRY_INGEST),async(req,res)=>{
  const input=z.object({vehicleId:z.string().uuid(),provider:z.string().min(2).max(120),externalDeviceId:z.string().max(150).optional(),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),speedKph:z.number().min(0).max(500).optional(),ignitionOn:z.boolean().optional(),odometerKm:z.number().int().min(0).optional(),fuelPercent:z.number().int().min(0).max(100).optional(),headingDegrees:z.number().int().min(0).max(359).optional(),recordedAt:z.coerce.date(),rawPayload:z.record(z.string(),z.unknown()).optional()}).parse(req.body);const vehicle=await prisma.vehicle.findFirst({where:{id:input.vehicleId,organizationId:req.auth!.organizationId,archivedAt:null}});if(!vehicle)return res.status(404).json({error:"Vehicle not found."});
  const result=await prisma.$transaction(async tx=>{
    const previous=await tx.telemetrySnapshot.findFirst({where:{organizationId:req.auth!.organizationId,vehicleId:vehicle.id},orderBy:{recordedAt:"desc"},select:{recordedAt:true}});const isLatest=!previous||input.recordedAt>=previous.recordedAt;
    const data:Prisma.TelemetrySnapshotUncheckedCreateInput={organizationId:req.auth!.organizationId,vehicleId:vehicle.id,provider:input.provider,externalDeviceId:input.externalDeviceId??null,latitude:input.latitude,longitude:input.longitude,speedKph:input.speedKph??null,ignitionOn:input.ignitionOn??null,odometerKm:input.odometerKm??null,fuelPercent:input.fuelPercent??null,headingDegrees:input.headingDegrees??null,recordedAt:input.recordedAt};if(input.rawPayload!==undefined)data.rawPayload=input.rawPayload as Prisma.InputJsonValue;const row=await tx.telemetrySnapshot.create({data});
    const location=`${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`;if(isLatest)await tx.vehicle.update({where:{id:vehicle.id},data:{currentLocation:location,...(input.odometerKm!==undefined&&input.odometerKm>=vehicle.currentOdometerKm?{currentOdometerKm:input.odometerKm}:{})}});
    const blocked=["GROUNDED","BREAKDOWN","ACCIDENT","UNDER_MAINTENANCE","SERVICE_OVERDUE","OUT_OF_SERVICE","DISPOSED"].includes(vehicle.status);const movementException=isLatest&&blocked&&(input.speedKph??0)>5;
    if(movementException)await tx.operationalAlert.upsert({where:{organizationId_sourceType_sourceId_category:{organizationId:req.auth!.organizationId,sourceType:"VEHICLE",sourceId:vehicle.id,category:"BLOCKED_VEHICLE_MOVEMENT"}},update:{severity:"CRITICAL",status:"OPEN",title:`${vehicle.registrationNumber} moving while ${vehicle.status.replaceAll("_"," ")}`,message:`Telemetry from ${input.provider} recorded ${input.speedKph?.toFixed(1)} km/h at ${location}.`,vehicleId:vehicle.id},create:{organizationId:req.auth!.organizationId,category:"BLOCKED_VEHICLE_MOVEMENT",severity:"CRITICAL",sourceType:"VEHICLE",sourceId:vehicle.id,title:`${vehicle.registrationNumber} moving while ${vehicle.status.replaceAll("_"," ")}`,message:`Telemetry from ${input.provider} recorded ${input.speedKph?.toFixed(1)} km/h at ${location}.`,vehicleId:vehicle.id}});
    return{snapshot:row,movementException};
  });
  if(result.movementException)await audit(req,{action:"TELEMETRY_EXCEPTION",recordType:"VEHICLE",recordId:vehicle.id,newValue:{snapshotId:result.snapshot.id,status:vehicle.status,speedKph:input.speedKph,latitude:input.latitude,longitude:input.longitude}});return res.status(201).json(result.snapshot);
});
