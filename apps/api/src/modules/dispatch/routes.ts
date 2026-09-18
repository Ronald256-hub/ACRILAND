import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { BLOCKED_FROM_OPERATION, canDriverOperate, type VehicleStatus } from "../../domain/rules.js";
import { validateDispatchWindow } from "../../domain/controlIntelligence.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireFreshMfa } from "../../middleware/mfa.js";

export const dispatchRouter = Router();
const routeId=(value:string|string[]|undefined)=>typeof value==="string"?value:null;
const activeStatuses=["PLANNED","READY","DISPATCHED","BLOCKED"] as const;
function dispatchNumber():string{const day=new Date().toISOString().slice(0,10).replaceAll("-","");return `DSP-${day}-${randomUUID().slice(0,8).toUpperCase()}`;}

async function enrich(organizationId:string){
  const items=await prisma.dispatchPlan.findMany({where:{organizationId},orderBy:[{status:"asc"},{plannedDeparture:"asc"}],take:500});
  const tripIds=[...new Set(items.map(i=>i.tripId))],vehicleIds=[...new Set(items.map(i=>i.vehicleId))],driverIds=[...new Set(items.map(i=>i.driverId))],routeIds=[...new Set(items.map(i=>i.routePlanId).filter((x):x is string=>Boolean(x)))];
  const [trips,vehicles,drivers,routes]=await Promise.all([
    prisma.trip.findMany({where:{id:{in:tripIds}},select:{id:true,tripNumber:true,purpose:true,origin:true,destination:true,status:true,requestedDeparture:true,expectedReturn:true}}),
    prisma.vehicle.findMany({where:{id:{in:vehicleIds}},select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,status:true}}),
    prisma.driver.findMany({where:{id:{in:driverIds}},select:{id:true,employeeNumber:true,fullName:true,status:true,licenceExpiry:true}}),
    routeIds.length?prisma.routePlan.findMany({where:{id:{in:routeIds}},select:{id:true,name:true,origin:true,destination:true}}):[]
  ]);
  const tm=new Map(trips.map(x=>[x.id,x])),vm=new Map(vehicles.map(x=>[x.id,x])),dm=new Map(drivers.map(x=>[x.id,x])),rm=new Map(routes.map(x=>[x.id,x]));
  return items.map(item=>({...item,trip:tm.get(item.tripId)??null,vehicle:vm.get(item.vehicleId)??null,driver:dm.get(item.driverId)??null,route:item.routePlanId?rm.get(item.routePlanId)??null:null}));
}

dispatchRouter.get("/",requirePermission(PERMISSIONS.DISPATCH_VIEW),async(req,res)=>res.json({items:await enrich(req.auth!.organizationId)}));

dispatchRouter.post("/", requireFreshMfa, requirePermission(PERMISSIONS.DISPATCH_MANAGE), async(req,res)=>{
  const input=z.object({
    tripId:z.string().uuid(),
    routePlanId:z.string().uuid().optional(),
    geofenceId:z.string().uuid().optional(),
    plannedDeparture:z.coerce.date(),
    plannedReturn:z.coerce.date(),
    priority:z.number().int().min(1).max(5).default(3),
    dispatchNotes:z.string().max(2500).optional()
  }).parse(req.body);
  try{validateDispatchWindow(input.plannedDeparture,input.plannedReturn);}catch(error){
    return res.status(400).json({error:error instanceof Error?error.message:"Invalid dispatch window."});
  }

  const organizationId=req.auth!.organizationId;
  const result=await prisma.$transaction(async tx=>{
    const tripRows=await tx.$queryRaw<Array<{id:string;tripNumber:string;status:string;vehicleId:string|null;driverId:string|null}>>(Prisma.sql`
      SELECT "id","tripNumber","status","vehicleId","driverId"
      FROM "Trip"
      WHERE "id"=${input.tripId}::uuid
        AND "organizationId"=${organizationId}::uuid
      FOR UPDATE
    `);
    const trip=tripRows[0];
    if(!trip)return {kind:"trip_not_found" as const};
    if(!["APPROVED","ALLOCATED","PRE_TRIP_INSPECTION","READY_TO_DEPART"].includes(trip.status))
      return {kind:"trip_state" as const,status:trip.status};
    if(!trip.vehicleId||!trip.driverId)return {kind:"allocation" as const};

    const [vehicleRows,driverRows]=await Promise.all([
      tx.$queryRaw<Array<{id:string;status:string;archivedAt:Date|null}>>(Prisma.sql`
        SELECT "id","status","archivedAt" FROM "Vehicle"
        WHERE "id"=${trip.vehicleId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE
      `),
      tx.$queryRaw<Array<{id:string;status:string;archivedAt:Date|null;licenceExpiry:Date}>>(Prisma.sql`
        SELECT "id","status","archivedAt","licenceExpiry" FROM "Driver"
        WHERE "id"=${trip.driverId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE
      `)
    ]);
    const vehicle=vehicleRows[0],driver=driverRows[0];
    if(!vehicle||vehicle.archivedAt||!driver||driver.archivedAt)return {kind:"allocation_unavailable" as const};

    const currentPlan=await tx.dispatchPlan.findFirst({
      where:{organizationId,tripId:trip.id,status:{not:"CANCELLED"}},
      select:{dispatchNumber:true,status:true}
    });
    if(currentPlan)return {kind:"current_plan" as const,dispatchNumber:currentPlan.dispatchNumber,status:currentPlan.status};

    if(BLOCKED_FROM_OPERATION.has(vehicle.status as VehicleStatus))return {kind:"vehicle_blocked" as const,status:vehicle.status};
    if(!canDriverOperate(driver.status,driver.licenceExpiry))return {kind:"driver_blocked" as const};

    const conflict=await tx.dispatchPlan.findFirst({
      where:{
        organizationId,
        status:{in:[...activeStatuses]},
        OR:[{vehicleId:vehicle.id},{driverId:driver.id}],
        plannedDeparture:{lt:input.plannedReturn},
        plannedReturn:{gt:input.plannedDeparture}
      },
      select:{dispatchNumber:true,vehicleId:true}
    });
    if(conflict)return {kind:"conflict" as const,dispatchNumber:conflict.dispatchNumber,vehicleMatch:conflict.vehicleId===vehicle.id};

    if(input.routePlanId){
      const route=await tx.routePlan.findFirst({where:{id:input.routePlanId,organizationId,isActive:true},select:{id:true}});
      if(!route)return {kind:"route_invalid" as const};
    }
    if(input.geofenceId){
      const geofence=await tx.geofence.findFirst({where:{id:input.geofenceId,organizationId,isActive:true},select:{id:true}});
      if(!geofence)return {kind:"geofence_invalid" as const};
    }

    const created=await tx.dispatchPlan.create({data:{
      organizationId,
      dispatchNumber:dispatchNumber(),
      tripId:trip.id,
      vehicleId:vehicle.id,
      driverId:driver.id,
      routePlanId:input.routePlanId??null,
      geofenceId:input.geofenceId??null,
      plannedDeparture:input.plannedDeparture,
      plannedReturn:input.plannedReturn,
      priority:input.priority,
      status:"PLANNED",
      dispatchNotes:input.dispatchNotes??null,
      createdByUserId:req.auth!.userId
    }});
    return {kind:"created" as const,created};
  });

  if(result.kind==="trip_not_found")return res.status(404).json({error:"Trip not found."});
  if(result.kind==="trip_state")return res.status(409).json({error:`Dispatch planning requires an approved trip before departure; current trip status is ${result.status}.`});
  if(result.kind==="allocation")return res.status(409).json({error:"Trip must have both vehicle and driver allocation before dispatch planning."});
  if(result.kind==="allocation_unavailable")return res.status(409).json({error:"Allocated vehicle or driver is unavailable."});
  if(result.kind==="current_plan")return res.status(409).json({error:`Trip already has current dispatch plan ${result.dispatchNumber} (${result.status}). Cancel it before replanning.`});
  if(result.kind==="vehicle_blocked")return res.status(409).json({error:`Vehicle cannot enter dispatch planning while status is ${result.status}.`});
  if(result.kind==="driver_blocked")return res.status(409).json({error:"Allocated driver is not currently authorized to operate."});
  if(result.kind==="conflict")return res.status(409).json({error:`Dispatch window conflicts with ${result.dispatchNumber} for the allocated ${result.vehicleMatch?"vehicle":"driver"}.`});
  if(result.kind==="route_invalid")return res.status(400).json({error:"Route plan does not belong to this organization or is inactive."});
  if(result.kind==="geofence_invalid")return res.status(400).json({error:"Geofence does not belong to this organization or is inactive."});

  await audit(req,{action:"CREATE",recordType:"DISPATCH_PLAN",recordId:result.created.id,newValue:result.created});
  return res.status(201).json(result.created);
});

dispatchRouter.post("/:id/ready", requireFreshMfa, requirePermission(PERMISSIONS.DISPATCH_MANAGE), async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid dispatch id."});
  const result=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{id:string;tripId:string;vehicleId:string;driverId:string;status:string}>>(Prisma.sql`
      SELECT "id","tripId","vehicleId","driverId","status"
      FROM "DispatchPlan"
      WHERE "id"=${id}::uuid AND "organizationId"=${req.auth!.organizationId}::uuid
      FOR UPDATE
    `);
    const row=rows[0];if(!row)return {kind:"not_found" as const};
    if(!["PLANNED","BLOCKED"].includes(row.status))return {kind:"invalid_state" as const,status:row.status};
    const [trip,vehicle,driver]=await Promise.all([
      tx.trip.findFirst({where:{id:row.tripId,organizationId:req.auth!.organizationId},select:{status:true}}),
      tx.vehicle.findFirst({where:{id:row.vehicleId,organizationId:req.auth!.organizationId,archivedAt:null},select:{status:true}}),
      tx.driver.findFirst({where:{id:row.driverId,organizationId:req.auth!.organizationId,archivedAt:null},select:{status:true,licenceExpiry:true}})
    ]);
    if(!trip||!vehicle||!driver)return {kind:"unavailable" as const};
    const reasons:string[]=[];
    if(trip.status!=="READY_TO_DEPART")reasons.push(`trip status ${trip.status}`);
    if(BLOCKED_FROM_OPERATION.has(vehicle.status as VehicleStatus))reasons.push(`vehicle status ${vehicle.status}`);
    if(!canDriverOperate(driver.status,driver.licenceExpiry))reasons.push("driver not authorized");
    const status=reasons.length?"BLOCKED":"READY";
    const updated=await tx.dispatchPlan.update({where:{id:row.id},data:{status}});
    return {kind:"updated" as const,updated,reasons,oldStatus:row.status};
  });
  if(result.kind==="not_found")return res.status(404).json({error:"Dispatch plan not found."});
  if(result.kind==="invalid_state")return res.status(409).json({error:"Only a planned or blocked dispatch can be re-evaluated for readiness."});
  if(result.kind==="unavailable")return res.status(409).json({error:"Trip, vehicle or driver is no longer available."});
  await audit(req,{action:"READINESS_CHECK",recordType:"DISPATCH_PLAN",recordId:id,oldValue:{status:result.oldStatus},newValue:{status:result.updated.status,reasons:result.reasons}});
  return res.json({...result.updated,reasons:result.reasons});
});

dispatchRouter.post("/:id/dispatch", requireFreshMfa, requirePermission(PERMISSIONS.DISPATCH_MANAGE), async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid dispatch id."});
  const result=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{id:string;tripId:string;vehicleId:string;driverId:string;status:string}>>(Prisma.sql`
      SELECT "id","tripId","vehicleId","driverId","status"
      FROM "DispatchPlan"
      WHERE "id"=${id}::uuid AND "organizationId"=${req.auth!.organizationId}::uuid
      FOR UPDATE
    `);
    const row=rows[0];if(!row)return {kind:"not_found" as const};
    if(row.status!=="READY")return {kind:"invalid_state" as const};
    const trip=await tx.trip.findFirst({where:{id:row.tripId,organizationId:req.auth!.organizationId},select:{status:true}});
    const vehicle=await tx.vehicle.findFirst({where:{id:row.vehicleId,organizationId:req.auth!.organizationId,archivedAt:null},select:{status:true}});
    const driver=await tx.driver.findFirst({where:{id:row.driverId,organizationId:req.auth!.organizationId,archivedAt:null},select:{status:true,licenceExpiry:true}});
    if(!trip||!vehicle||!driver)return {kind:"unavailable" as const};
    if(trip.status!=="ACTIVE")return {kind:"trip_not_active" as const};
    if(vehicle.status!=="ON_TRIP")return {kind:"vehicle_not_active" as const,status:vehicle.status};
    if(!canDriverOperate(driver.status,driver.licenceExpiry))return {kind:"driver_blocked" as const};
    const updated=await tx.dispatchPlan.update({where:{id:row.id},data:{status:"DISPATCHED",dispatchedByUserId:req.auth!.userId,dispatchedAt:new Date()}});
    return {kind:"updated" as const,updated,oldStatus:row.status};
  });
  if(result.kind==="not_found")return res.status(404).json({error:"Dispatch plan not found."});
  if(result.kind==="invalid_state")return res.status(409).json({error:"Dispatch must pass readiness control before it can be marked dispatched."});
  if(result.kind==="unavailable")return res.status(409).json({error:"Trip, vehicle or driver is no longer available."});
  if(result.kind==="trip_not_active")return res.status(409).json({error:"Dispatch status cannot become DISPATCHED until the trip has been authorized and started through Trip Control."});
  if(result.kind==="vehicle_not_active")return res.status(409).json({error:`Vehicle must be ON_TRIP before dispatch can be marked dispatched; current status is ${result.status}.`});
  if(result.kind==="driver_blocked")return res.status(409).json({error:"Assigned driver is no longer authorized to operate."});
  await audit(req,{action:"DISPATCH",recordType:"DISPATCH_PLAN",recordId:id,oldValue:{status:result.oldStatus},newValue:{status:result.updated.status,dispatchedAt:result.updated.dispatchedAt}});
  return res.json(result.updated);
});

dispatchRouter.post("/:id/complete", requireFreshMfa, requirePermission(PERMISSIONS.DISPATCH_MANAGE), async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid dispatch id."});
  const result=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{id:string;tripId:string;status:string}>>(Prisma.sql`
      SELECT "id","tripId","status" FROM "DispatchPlan"
      WHERE "id"=${id}::uuid AND "organizationId"=${req.auth!.organizationId}::uuid FOR UPDATE
    `);
    const row=rows[0];if(!row)return {kind:"not_found" as const};
    if(row.status!=="DISPATCHED")return {kind:"invalid_state" as const};
    const trip=await tx.trip.findFirst({where:{id:row.tripId,organizationId:req.auth!.organizationId},select:{status:true}});
    if(!trip||trip.status!=="CLOSED")return {kind:"trip_not_closed" as const};
    const updated=await tx.dispatchPlan.update({where:{id:row.id},data:{status:"COMPLETED",completedAt:new Date()}});
    return {kind:"updated" as const,updated,oldStatus:row.status};
  });
  if(result.kind==="not_found")return res.status(404).json({error:"Dispatch plan not found."});
  if(result.kind==="invalid_state")return res.status(409).json({error:"Only dispatched plans can be completed."});
  if(result.kind==="trip_not_closed")return res.status(409).json({error:"Trip must be closed through Trip Control before dispatch completion."});
  await audit(req,{action:"COMPLETE",recordType:"DISPATCH_PLAN",recordId:id,oldValue:{status:result.oldStatus},newValue:{status:result.updated.status}});
  return res.json(result.updated);
});

dispatchRouter.post("/:id/cancel", requireFreshMfa, requirePermission(PERMISSIONS.DISPATCH_MANAGE), async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid dispatch id."});
  const input=z.object({reason:z.string().min(5).max(1500)}).parse(req.body);
  const result=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
      SELECT "id","status" FROM "DispatchPlan"
      WHERE "id"=${id}::uuid AND "organizationId"=${req.auth!.organizationId}::uuid FOR UPDATE
    `);
    const row=rows[0];if(!row)return {kind:"not_found" as const};
    if(!["PLANNED","READY","BLOCKED"].includes(row.status))return {kind:"invalid_state" as const,status:row.status};
    const updated=await tx.dispatchPlan.update({where:{id:row.id},data:{status:"CANCELLED",cancelledAt:new Date(),cancelReason:input.reason}});
    return {kind:"updated" as const,updated,oldStatus:row.status};
  });
  if(result.kind==="not_found")return res.status(404).json({error:"Dispatch plan not found."});
  if(result.kind==="invalid_state")return res.status(409).json({error:"An active or completed dispatch cannot be cancelled here."});
  await audit(req,{action:"CANCEL",recordType:"DISPATCH_PLAN",recordId:id,oldValue:{status:result.oldStatus},newValue:result.updated.status},reason:input.reason);
  return res.json(result.updated);
});
