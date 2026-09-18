import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { BusinessRuleError } from "../../domain/rules.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireFreshMfa } from "../../middleware/mfa.js";

export const lifecycleRouter=Router();
const routeId=(value:string|string[]|undefined)=>typeof value==="string"?value:null;
const num=(value:unknown)=>Number(value??0);

lifecycleRouter.get("/summary",requirePermission(PERMISSIONS.LIFECYCLE_VIEW),async(req,res)=>{
  const organizationId=req.auth!.organizationId;const [organization,vehicles,fuel,maintenance,manualCosts,disposals]=await Promise.all([
    prisma.organization.findUnique({where:{id:organizationId},select:{currency:true}}),
    prisma.vehicle.findMany({where:{organizationId},select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,status:true,purchasePrice:true,initialOdometerKm:true,currentOdometerKm:true}}),
    prisma.fuelTransaction.groupBy({by:["vehicleId"],where:{organizationId,status:"ISSUED"},_sum:{totalCost:true}}),
    prisma.maintenanceWorkOrder.groupBy({by:["vehicleId"],where:{organizationId,status:"CLOSED"},_sum:{totalCost:true}}),
    prisma.vehicleCostEntry.groupBy({by:["vehicleId"],where:{organizationId},_sum:{amount:true}}),
    prisma.vehicleDisposal.findMany({where:{organizationId,status:"COMPLETED"},select:{vehicleId:true,actualProceeds:true}})
  ]);const fm=new Map(fuel.map(r=>[r.vehicleId,num(r._sum.totalCost)])),mm=new Map(maintenance.map(r=>[r.vehicleId,num(r._sum.totalCost)])),cm=new Map(manualCosts.map(r=>[r.vehicleId,num(r._sum.amount)])),dm=new Map(disposals.map(r=>[r.vehicleId,num(r.actualProceeds)]));const items=vehicles.map(vehicle=>{const acquisition=num(vehicle.purchasePrice),fuelCost=fm.get(vehicle.id)??0,maintenanceCost=mm.get(vehicle.id)??0,otherCost=cm.get(vehicle.id)??0,grossTco=acquisition+fuelCost+maintenanceCost+otherCost,disposalProceeds=dm.get(vehicle.id)??0,netLifecycleCost=Math.max(0,grossTco-disposalProceeds),distanceKm=Math.max(0,vehicle.currentOdometerKm-vehicle.initialOdometerKm),costPerKm=distanceKm>0?netLifecycleCost/distanceKm:null;return{...vehicle,currency:organization?.currency??"UGX",acquisitionCost:acquisition,fuelCost,maintenanceCost,additionalCost:otherCost,grossTco,disposalProceeds,netLifecycleCost,distanceKm,costPerKm};});return res.json({items,totals:{grossTco:items.reduce((s,i)=>s+i.grossTco,0),netLifecycleCost:items.reduce((s,i)=>s+i.netLifecycleCost,0),fuelCost:items.reduce((s,i)=>s+i.fuelCost,0),maintenanceCost:items.reduce((s,i)=>s+i.maintenanceCost,0),additionalCost:items.reduce((s,i)=>s+i.additionalCost,0)}});
});

lifecycleRouter.get("/costs",requirePermission(PERMISSIONS.LIFECYCLE_VIEW),async(req,res)=>{const vehicleId=typeof req.query.vehicleId==="string"?req.query.vehicleId:undefined;const items=await prisma.vehicleCostEntry.findMany({where:{organizationId:req.auth!.organizationId,...(vehicleId?{vehicleId}:{})},orderBy:{occurredAt:"desc"},take:500});return res.json({items});});
lifecycleRouter.post("/costs",requireFreshMfa,requirePermission(PERMISSIONS.LIFECYCLE_COST_MANAGE),async(req,res)=>{
  const input=z.object({
    vehicleId:z.string().uuid(),
    category:z.enum(["TYRE","INSURANCE","LICENCE","TAX","TOLL","PARKING","ACCIDENT","OTHER"]),
    amount:z.number().positive(),
    currency:z.string().min(3).max(3).optional(),
    occurredAt:z.coerce.date(),
    description:z.string().min(3).max(1000),
    vendorId:z.string().uuid().optional(),
    sourceType:z.string().max(80).optional(),
    sourceId:z.string().max(150).optional()
  }).parse(req.body);

  const organizationId=req.auth!.organizationId;
  const result=await prisma.$transaction(async tx=>{
    const vehicleRows=await tx.$queryRaw<Array<{id:string;status:string;archivedAt:Date|null}>>(Prisma.sql`
      SELECT "id","status","archivedAt"
      FROM "Vehicle"
      WHERE "id"=${input.vehicleId}::uuid
        AND "organizationId"=${organizationId}::uuid
      FOR UPDATE
    `);
    const vehicle=vehicleRows[0];
    if(!vehicle||vehicle.archivedAt)return {kind:"vehicle_not_found" as const};
    if(vehicle.status==="DISPOSED")return {kind:"disposed" as const};

    let vendorId:string|null=input.vendorId??null;
    if(input.vendorId){
      const vendor=await tx.vendor.findFirst({where:{id:input.vendorId,organizationId,status:"ACTIVE"},select:{id:true}});
      if(!vendor)return {kind:"vendor_invalid" as const};
      vendorId=vendor.id;
    }

    const organization=await tx.organization.findUnique({where:{id:organizationId},select:{currency:true}});
    const created=await tx.vehicleCostEntry.create({
      data:{
        organizationId,
        vehicleId:vehicle.id,
        category:input.category,
        amount:input.amount,
        currency:(input.currency??organization?.currency??"UGX").toUpperCase(),
        occurredAt:input.occurredAt,
        description:input.description,
        vendorId,
        sourceType:input.sourceType??null,
        sourceId:input.sourceId??null,
        createdByUserId:req.auth!.userId
      }
    });
    return {kind:"created" as const,created};
  });

  if(result.kind==="vehicle_not_found")return res.status(404).json({error:"Vehicle not found."});
  if(result.kind==="disposed")return res.status(409).json({error:"Lifecycle costs cannot be added to a disposed vehicle."});
  if(result.kind==="vendor_invalid")return res.status(400).json({error:"Vendor does not belong to this organization or is inactive."});

  await audit(req,{action:"CREATE",recordType:"VEHICLE_COST",recordId:result.created.id,newValue:result.created});
  return res.status(201).json(result.created);
});

lifecycleRouter.get("/disposals",requirePermission(PERMISSIONS.DISPOSAL_VIEW),async(req,res)=>{const items=await prisma.vehicleDisposal.findMany({where:{organizationId:req.auth!.organizationId},orderBy:{requestedAt:"desc"},take:300});const vehicleIds=[...new Set(items.map(i=>i.vehicleId))];const vehicles=await prisma.vehicle.findMany({where:{id:{in:vehicleIds}},select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,status:true}});const vm=new Map(vehicles.map(v=>[v.id,v]));return res.json({items:items.map(i=>({...i,vehicle:vm.get(i.vehicleId)??null}))});});
lifecycleRouter.post("/disposals",requirePermission(PERMISSIONS.DISPOSAL_REQUEST),async(req,res)=>{const input=z.object({vehicleId:z.string().uuid(),disposalMethod:z.string().min(3).max(120),reason:z.string().min(10).max(2500),estimatedProceeds:z.number().min(0).optional(),notes:z.string().max(2000).optional()}).parse(req.body);const vehicle=await prisma.vehicle.findFirst({where:{id:input.vehicleId,organizationId:req.auth!.organizationId}});if(!vehicle)return res.status(404).json({error:"Vehicle not found."});if(vehicle.status==="DISPOSED")return res.status(409).json({error:"Vehicle is already disposed."});const created=await prisma.vehicleDisposal.create({data:{organizationId:req.auth!.organizationId,vehicleId:vehicle.id,status:"REQUESTED",requestedByUserId:req.auth!.userId,disposalMethod:input.disposalMethod,reason:input.reason,estimatedProceeds:input.estimatedProceeds??null,notes:input.notes??null}});await audit(req,{action:"REQUEST",recordType:"VEHICLE_DISPOSAL",recordId:created.id,newValue:created,reason:input.reason});return res.status(201).json(created);});

lifecycleRouter.post("/disposals/:id/decision",requireFreshMfa,requirePermission(PERMISSIONS.DISPOSAL_APPROVE),async(req,res)=>{const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid disposal id."});const input=z.object({decision:z.enum(["APPROVED","REJECTED"]),comments:z.string().max(1500).optional()}).parse(req.body);const result=await prisma.$transaction(async tx=>{const locked=await tx.$queryRaw<Array<{id:string,status:string,requestedByUserId:string}>>`SELECT "id","status","requestedByUserId" FROM "VehicleDisposal" WHERE "id"=${id}::uuid AND "organizationId"=${req.auth!.organizationId}::uuid FOR UPDATE`;const row=locked[0];if(!row)throw new BusinessRuleError("Disposal request not found.",404);if(row.status!=="REQUESTED")throw new BusinessRuleError("Only requested disposals can be approved or rejected.",409);if(row.requestedByUserId===req.auth!.userId)throw new BusinessRuleError("A user cannot approve their own disposal request.",403);if(input.decision==="REJECTED"&&!input.comments)throw new BusinessRuleError("A rejection reason is required.",400);const now=new Date();const updated=await tx.vehicleDisposal.update({where:{id:row.id},data:input.decision==="APPROVED"?{status:"APPROVED",approvedByUserId:req.auth!.userId,approvedAt:now,rejectionReason:null}:{status:"REJECTED",approvedByUserId:req.auth!.userId,approvedAt:now,rejectionReason:input.comments??"Rejected"}});return{row,updated};});await audit(req,{action:input.decision==="APPROVED"?"APPROVE":"REJECT",recordType:"VEHICLE_DISPOSAL",recordId:result.row.id,oldValue:{status:result.row.status},newValue:{status:result.updated.status},...(input.comments?{reason:input.comments}:{})});return res.json(result.updated);});

lifecycleRouter.post("/disposals/:id/complete",requireFreshMfa,requirePermission(PERMISSIONS.DISPOSAL_APPROVE),async(req,res)=>{const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid disposal id."});const input=z.object({actualProceeds:z.number().min(0).optional(),buyer:z.string().max(200).optional(),notes:z.string().max(2000).optional()}).parse(req.body);const result=await prisma.$transaction(async tx=>{const locked=await tx.$queryRaw<Array<{id:string,status:string,vehicleId:string,notes:string|null}>>`SELECT "id","status","vehicleId","notes" FROM "VehicleDisposal" WHERE "id"=${id}::uuid AND "organizationId"=${req.auth!.organizationId}::uuid FOR UPDATE`;const row=locked[0];if(!row)throw new BusinessRuleError("Disposal request not found.",404);if(row.status!=="APPROVED")throw new BusinessRuleError("Disposal must be independently approved before completion.",409);const vehicleLocked=await tx.$queryRaw<Array<{id:string,status:string}>>`SELECT "id","status" FROM "Vehicle" WHERE "id"=${row.vehicleId}::uuid AND "organizationId"=${req.auth!.organizationId}::uuid FOR UPDATE`;if(!vehicleLocked[0])throw new BusinessRuleError("Vehicle not found.",404);const [activeTrip,activeAssignment,activeWorkshop]=await Promise.all([tx.trip.count({where:{organizationId:req.auth!.organizationId,vehicleId:row.vehicleId,status:{in:["ACTIVE","RETURNED","POST_TRIP_INSPECTION"]}}}),tx.vehicleAssignment.count({where:{organizationId:req.auth!.organizationId,vehicleId:row.vehicleId,status:"ACTIVE"}}),tx.maintenanceWorkOrder.count({where:{organizationId:req.auth!.organizationId,vehicleId:row.vehicleId,status:{in:["OPEN","DIAGNOSIS","AWAITING_APPROVAL","APPROVED","IN_PROGRESS","QC","READY_FOR_RELEASE"]}}})]);if(activeTrip||activeAssignment||activeWorkshop)throw new BusinessRuleError("Vehicle cannot be disposed while it has an active trip, assignment or workshop order.",409);const disposal=await tx.vehicleDisposal.update({where:{id:row.id},data:{status:"COMPLETED",actualProceeds:input.actualProceeds??null,buyer:input.buyer??null,notes:input.notes??row.notes,completedAt:new Date()}});const vehicle=await tx.vehicle.update({where:{id:row.vehicleId},data:{status:"DISPOSED"}});return{disposal,vehicle};});await audit(req,{action:"COMPLETE",recordType:"VEHICLE_DISPOSAL",recordId:result.disposal.id,oldValue:{status:"APPROVED"},newValue:{status:result.disposal.status,vehicleStatus:result.vehicle.status,actualProceeds:result.disposal.actualProceeds}});return res.json(result);});
