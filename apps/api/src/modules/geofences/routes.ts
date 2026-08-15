import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { pointInGeofence, speedPenalty, type GeoPoint } from "../../domain/controlIntelligence.js";
import { requirePermission } from "../../middleware/authorize.js";

export const geofencesRouter=Router();
const routeId=(value:string|string[]|undefined)=>typeof value==="string"?value:null;
const pointSchema=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)});

geofencesRouter.get("/routes",requirePermission(PERMISSIONS.ROUTE_VIEW),async(req,res)=>{
  const items=await prisma.routePlan.findMany({where:{organizationId:req.auth!.organizationId},orderBy:[{isActive:"desc"},{name:"asc"}],take:500});
  return res.json({items});
});

geofencesRouter.post("/routes",requirePermission(PERMISSIONS.ROUTE_MANAGE),async(req,res)=>{
  const input=z.object({name:z.string().min(2).max(160),origin:z.string().min(2).max(300),destination:z.string().min(2).max(300),waypoints:z.array(z.string().min(1).max(300)).max(30).optional(),estimatedDistanceKm:z.number().min(0).optional(),expectedDurationMinutes:z.number().int().positive().optional(),notes:z.string().max(2000).optional()}).parse(req.body);
  const created=await prisma.routePlan.create({data:{organizationId:req.auth!.organizationId,name:input.name.trim(),origin:input.origin.trim(),destination:input.destination.trim(),...(input.waypoints!==undefined?{waypoints:input.waypoints}:{}),estimatedDistanceKm:input.estimatedDistanceKm??null,expectedDurationMinutes:input.expectedDurationMinutes??null,notes:input.notes??null,isActive:true,createdByUserId:req.auth!.userId}});
  await audit(req,{action:"CREATE",recordType:"ROUTE_PLAN",recordId:created.id,newValue:created});return res.status(201).json(created);
});

geofencesRouter.patch("/routes/:id",requirePermission(PERMISSIONS.ROUTE_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid route id."});
  const input=z.object({name:z.string().min(2).max(160).optional(),origin:z.string().min(2).max(300).optional(),destination:z.string().min(2).max(300).optional(),waypoints:z.array(z.string().min(1).max(300)).max(30).nullable().optional(),estimatedDistanceKm:z.number().min(0).nullable().optional(),expectedDurationMinutes:z.number().int().positive().nullable().optional(),notes:z.string().max(2000).nullable().optional(),isActive:z.boolean().optional()}).parse(req.body);
  const row=await prisma.routePlan.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Route plan not found."});
  const data:Prisma.RoutePlanUpdateInput={};
  if(input.name!==undefined)data.name=input.name;
  if(input.origin!==undefined)data.origin=input.origin;
  if(input.destination!==undefined)data.destination=input.destination;
  if(input.waypoints!==undefined)data.waypoints=input.waypoints===null?Prisma.JsonNull:input.waypoints;
  if(input.estimatedDistanceKm!==undefined)data.estimatedDistanceKm=input.estimatedDistanceKm;
  if(input.expectedDurationMinutes!==undefined)data.expectedDurationMinutes=input.expectedDurationMinutes;
  if(input.notes!==undefined)data.notes=input.notes;
  if(input.isActive!==undefined)data.isActive=input.isActive;
  const updated=await prisma.routePlan.update({where:{id:row.id},data});await audit(req,{action:"UPDATE",recordType:"ROUTE_PLAN",recordId:row.id,oldValue:row,newValue:updated});return res.json(updated);
});

geofencesRouter.get("/",requirePermission(PERMISSIONS.GEOFENCE_VIEW),async(req,res)=>{
  const items=await prisma.geofence.findMany({where:{organizationId:req.auth!.organizationId},orderBy:[{isActive:"desc"},{name:"asc"}],take:500});return res.json({items});
});

geofencesRouter.post("/",requirePermission(PERMISSIONS.GEOFENCE_MANAGE),async(req,res)=>{
  const input=z.discriminatedUnion("shape",[
    z.object({shape:z.literal("CIRCLE"),name:z.string().min(2).max(160),policy:z.enum(["MONITOR","ALLOWED","RESTRICTED"]).default("MONITOR"),centerLatitude:z.number().min(-90).max(90),centerLongitude:z.number().min(-180).max(180),radiusMetres:z.number().int().positive().max(500000),speedLimitKph:z.number().int().positive().max(250).optional(),alertOnEntry:z.boolean().default(false),alertOnExit:z.boolean().default(false),notes:z.string().max(2000).optional()}),
    z.object({shape:z.literal("POLYGON"),name:z.string().min(2).max(160),policy:z.enum(["MONITOR","ALLOWED","RESTRICTED"]).default("MONITOR"),polygon:z.array(pointSchema).min(3).max(1000),speedLimitKph:z.number().int().positive().max(250).optional(),alertOnEntry:z.boolean().default(false),alertOnExit:z.boolean().default(false),notes:z.string().max(2000).optional()})
  ]).parse(req.body);
  const created=await prisma.geofence.create({data:{organizationId:req.auth!.organizationId,name:input.name.trim(),shape:input.shape,policy:input.policy,centerLatitude:input.shape==="CIRCLE"?input.centerLatitude:null,centerLongitude:input.shape==="CIRCLE"?input.centerLongitude:null,radiusMetres:input.shape==="CIRCLE"?input.radiusMetres:null,...(input.shape==="POLYGON"?{polygon:input.polygon}:{}),speedLimitKph:input.speedLimitKph??null,alertOnEntry:input.alertOnEntry,alertOnExit:input.alertOnExit,isActive:true,notes:input.notes??null,createdByUserId:req.auth!.userId}});
  await audit(req,{action:"CREATE",recordType:"GEOFENCE",recordId:created.id,newValue:created});return res.status(201).json(created);
});

geofencesRouter.patch("/:id",requirePermission(PERMISSIONS.GEOFENCE_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid geofence id."});
  const input=z.object({policy:z.enum(["MONITOR","ALLOWED","RESTRICTED"]).optional(),speedLimitKph:z.number().int().positive().max(250).nullable().optional(),alertOnEntry:z.boolean().optional(),alertOnExit:z.boolean().optional(),notes:z.string().max(2000).nullable().optional(),isActive:z.boolean().optional()}).parse(req.body);
  const row=await prisma.geofence.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Geofence not found."});
  const data:Prisma.GeofenceUpdateInput={};
  if(input.policy!==undefined)data.policy=input.policy;
  if(input.speedLimitKph!==undefined)data.speedLimitKph=input.speedLimitKph;
  if(input.alertOnEntry!==undefined)data.alertOnEntry=input.alertOnEntry;
  if(input.alertOnExit!==undefined)data.alertOnExit=input.alertOnExit;
  if(input.notes!==undefined)data.notes=input.notes;
  if(input.isActive!==undefined)data.isActive=input.isActive;
  const updated=await prisma.geofence.update({where:{id:row.id},data});await audit(req,{action:"UPDATE",recordType:"GEOFENCE",recordId:row.id,oldValue:row,newValue:updated});return res.json(updated);
});

geofencesRouter.get("/events/recent",requirePermission(PERMISSIONS.GEOFENCE_VIEW),async(req,res)=>{
  const items=await prisma.geofenceEvent.findMany({where:{organizationId:req.auth!.organizationId},orderBy:{occurredAt:"desc"},take:300});const fenceIds=[...new Set(items.map(i=>i.geofenceId))],vehicleIds=[...new Set(items.map(i=>i.vehicleId))];
  const [fences,vehicles]=await Promise.all([prisma.geofence.findMany({where:{id:{in:fenceIds}},select:{id:true,name:true,policy:true}}),prisma.vehicle.findMany({where:{id:{in:vehicleIds}},select:{id:true,registrationNumber:true,fleetNumber:true}})]);const fm=new Map(fences.map(x=>[x.id,x])),vm=new Map(vehicles.map(x=>[x.id,x]));return res.json({items:items.map(i=>({...i,geofence:fm.get(i.geofenceId)??null,vehicle:vm.get(i.vehicleId)??null}))});
});

geofencesRouter.post("/evaluate",requirePermission(PERMISSIONS.GEOFENCE_MANAGE),async(req,res)=>{
  const organizationId=req.auth!.organizationId;const fences=await prisma.geofence.findMany({where:{organizationId,isActive:true}});const snapshots=await prisma.telemetrySnapshot.findMany({where:{organizationId},orderBy:{recordedAt:"desc"},take:2000});const latest=new Map<string,(typeof snapshots)[number]>();for(const row of snapshots)if(!latest.has(row.vehicleId))latest.set(row.vehicleId,row);const vehicles=await prisma.vehicle.findMany({where:{organizationId,id:{in:[...latest.keys()]},archivedAt:null},select:{id:true,registrationNumber:true,status:true}});const vehicleMap=new Map(vehicles.map(v=>[v.id,v]));let transitions=0,breaches=0,speeding=0;
  for(const snapshot of latest.values()){
    const vehicle=vehicleMap.get(snapshot.vehicleId);if(!vehicle)continue;const assignment=await prisma.vehicleAssignment.findFirst({where:{organizationId,vehicleId:vehicle.id,status:"ACTIVE"},select:{driverId:true}});const point={latitude:Number(snapshot.latitude),longitude:Number(snapshot.longitude)};
    for(const fence of fences){
      let inside=false;try{inside=pointInGeofence(point,fence.shape==="CIRCLE"?{shape:"CIRCLE",centerLatitude:Number(fence.centerLatitude),centerLongitude:Number(fence.centerLongitude),radiusMetres:fence.radiusMetres!}:{shape:"POLYGON",polygon:(Array.isArray(fence.polygon)?fence.polygon:[]) as GeoPoint[]});}catch{continue;}
      const previous=await prisma.geofenceState.findUnique({where:{geofenceId_vehicleId:{geofenceId:fence.id,vehicleId:vehicle.id}}});const changed=previous!==null&&previous.isInside!==inside;const now=snapshot.recordedAt;
      await prisma.geofenceState.upsert({where:{geofenceId_vehicleId:{geofenceId:fence.id,vehicleId:vehicle.id}},update:{isInside:inside,lastEvaluatedAt:now,...(changed?{lastChangedAt:now}:{})},create:{organizationId,geofenceId:fence.id,vehicleId:vehicle.id,isInside:inside,lastEvaluatedAt:now,lastChangedAt:now}});
      if(changed){
        const type=inside?"ENTRY":"EXIT";const existingEvent=await prisma.geofenceEvent.findFirst({where:{geofenceId:fence.id,vehicleId:vehicle.id,telemetrySnapshotId:snapshot.id,type}});
        if(existingEvent)await prisma.geofenceEvent.update({where:{id:existingEvent.id},data:{occurredAt:now,latitude:point.latitude,longitude:point.longitude}});else await prisma.geofenceEvent.create({data:{organizationId,geofenceId:fence.id,vehicleId:vehicle.id,telemetrySnapshotId:snapshot.id,type,latitude:point.latitude,longitude:point.longitude,occurredAt:now}});
        transitions++;const breach=(fence.policy==="RESTRICTED"&&inside)||(fence.policy==="ALLOWED"&&!inside);
        if(breach){breaches++;const description=`${vehicle.registrationNumber} ${inside?"entered":"exited"} ${fence.name} (${fence.policy.toLowerCase()} zone).`;await prisma.driverSafetyEvent.upsert({where:{organizationId_sourceType_sourceId_type:{organizationId,sourceType:"GEOFENCE_EVENT",sourceId:`${fence.id}:${snapshot.id}`,type:"GEOFENCE_BREACH"}},update:{description,occurredAt:now},create:{organizationId,driverId:assignment?.driverId??null,vehicleId:vehicle.id,type:"GEOFENCE_BREACH",penaltyPoints:10,sourceType:"GEOFENCE_EVENT",sourceId:`${fence.id}:${snapshot.id}`,description,occurredAt:now}});await prisma.operationalAlert.upsert({where:{organizationId_sourceType_sourceId_category:{organizationId,sourceType:"GEOFENCE",sourceId:`${fence.id}:${vehicle.id}`,category:"GEOFENCE_BREACH"}},update:{severity:"WARNING",status:"OPEN",title:`Geofence breach · ${vehicle.registrationNumber}`,message:description,vehicleId:vehicle.id},create:{organizationId,category:"GEOFENCE_BREACH",severity:"WARNING",sourceType:"GEOFENCE",sourceId:`${fence.id}:${vehicle.id}`,title:`Geofence breach · ${vehicle.registrationNumber}`,message:description,vehicleId:vehicle.id}});
        }else if((inside&&fence.alertOnEntry)||(!inside&&fence.alertOnExit)){await prisma.operationalAlert.upsert({where:{organizationId_sourceType_sourceId_category:{organizationId,sourceType:"GEOFENCE_EVENT",sourceId:`${fence.id}:${snapshot.id}`,category:"GEOFENCE_TRANSITION"}},update:{status:"OPEN",message:`${vehicle.registrationNumber} ${inside?"entered":"exited"} ${fence.name}.`},create:{organizationId,category:"GEOFENCE_TRANSITION",severity:"INFO",sourceType:"GEOFENCE_EVENT",sourceId:`${fence.id}:${snapshot.id}`,title:`Geofence ${inside?"entry":"exit"} · ${vehicle.registrationNumber}`,message:`${vehicle.registrationNumber} ${inside?"entered":"exited"} ${fence.name}.`,vehicleId:vehicle.id}});}
      }
      if(inside&&fence.speedLimitKph!==null&&snapshot.speedKph!==null){const speed=Number(snapshot.speedKph),points=speedPenalty(speed,fence.speedLimitKph);if(points>0){speeding++;const sourceId=`${fence.id}:${snapshot.id}`;const description=`${vehicle.registrationNumber} recorded ${speed.toFixed(1)} km/h in ${fence.name}; limit ${fence.speedLimitKph} km/h.`;await prisma.driverSafetyEvent.upsert({where:{organizationId_sourceType_sourceId_type:{organizationId,sourceType:"TELEMETRY",sourceId,type:"SPEEDING"}},update:{penaltyPoints:points,description,occurredAt:snapshot.recordedAt},create:{organizationId,driverId:assignment?.driverId??null,vehicleId:vehicle.id,type:"SPEEDING",penaltyPoints:points,sourceType:"TELEMETRY",sourceId,description,occurredAt:snapshot.recordedAt}});if(speed-fence.speedLimitKph>=20)await prisma.operationalAlert.upsert({where:{organizationId_sourceType_sourceId_category:{organizationId,sourceType:"TELEMETRY",sourceId,category:"SPEEDING"}},update:{severity:"WARNING",status:"OPEN",message:description,vehicleId:vehicle.id},create:{organizationId,category:"SPEEDING",severity:"WARNING",sourceType:"TELEMETRY",sourceId,title:`Speed exception · ${vehicle.registrationNumber}`,message:description,vehicleId:vehicle.id}});}}
    }
  }
  await audit(req,{action:"EVALUATE",recordType:"GEOFENCE",recordId:"fleet",newValue:{vehicles:latest.size,geofences:fences.length,transitions,breaches,speeding}});return res.json({vehiclesEvaluated:latest.size,geofencesEvaluated:fences.length,transitions,breaches,speeding});
});
