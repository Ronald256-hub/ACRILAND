import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { assertDifferentApprover, validateOdometer } from "../../domain/rules.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize.js";
import { requireFreshMfa } from "../../middleware/mfa.js";

export const fuelRouter = Router();
function routeId(value:string|string[]|undefined):string|null{return typeof value==="string"?value:null;}
function newRequestNumber():string{const day=new Date().toISOString().slice(0,10).replaceAll("-","");return `FUEL-${day}-${randomUUID().slice(0,8).toUpperCase()}`;}

fuelRouter.get("/",requireAnyPermission(PERMISSIONS.FUEL_VIEW,PERMISSIONS.FUEL_CREATE),async(req,res)=>{
  const canViewAll=req.auth!.permissions.has(PERMISSIONS.FUEL_VIEW);
  const where={organizationId:req.auth!.organizationId,...(!canViewAll?{requestedByUserId:req.auth!.userId}:{})};
  const items=await prisma.fuelTransaction.findMany({where,include:{vehicle:{select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,fuelType:true,currentOdometerKm:true}},driver:{select:{id:true,employeeNumber:true,fullName:true}},trip:{select:{id:true,tripNumber:true,origin:true,destination:true}},requestedBy:{select:{id:true,fullName:true}},approvedBy:{select:{id:true,fullName:true}}},orderBy:{requestedAt:"desc"},take:250});
  return res.json({items});
});

fuelRouter.post("/",requirePermission(PERMISSIONS.FUEL_CREATE),async(req,res)=>{
  const input=z.object({vehicleId:z.string().uuid(),tripId:z.string().uuid().optional(),requestedLitres:z.number().positive().max(5000),odometerKm:z.number().int().min(0),station:z.string().max(200).optional(),notes:z.string().max(2000).optional()}).parse(req.body);
  const vehicle=await prisma.vehicle.findFirst({where:{id:input.vehicleId,organizationId:req.auth!.organizationId,archivedAt:null}});if(!vehicle)return res.status(404).json({error:"Vehicle not found."});
  validateOdometer(vehicle.currentOdometerKm,input.odometerKm);
  let driverId:string|null=null;
  if(req.auth!.roles.includes("DRIVER")){
    const driver=await prisma.driver.findFirst({where:{organizationId:req.auth!.organizationId,userId:req.auth!.userId,archivedAt:null}});if(!driver)return res.status(403).json({error:"Driver profile is not linked to this account."});
    const assignment=await prisma.vehicleAssignment.findFirst({where:{organizationId:req.auth!.organizationId,vehicleId:vehicle.id,driverId:driver.id,status:"ACTIVE"}});if(!assignment)return res.status(403).json({error:"Drivers may request fuel only for their actively assigned vehicle."});
    driverId=driver.id;
  } else {
    const assignment=await prisma.vehicleAssignment.findFirst({where:{organizationId:req.auth!.organizationId,vehicleId:vehicle.id,status:"ACTIVE"}});driverId=assignment?.driverId??null;
  }
  if(input.tripId){const trip=await prisma.trip.findFirst({where:{id:input.tripId,organizationId:req.auth!.organizationId,vehicleId:vehicle.id}});if(!trip)return res.status(400).json({error:"Linked trip does not belong to the selected vehicle."});}
  const created=await prisma.fuelTransaction.create({data:{organizationId:req.auth!.organizationId,requestNumber:newRequestNumber(),vehicleId:vehicle.id,driverId,tripId:input.tripId??null,requestedByUserId:req.auth!.userId,status:"REQUESTED",fuelType:vehicle.fuelType,requestedLitres:input.requestedLitres,odometerKm:input.odometerKm,station:input.station??null,notes:input.notes??null}});
  await audit(req,{action:"CREATE",recordType:"FUEL_TRANSACTION",recordId:created.id,newValue:created});return res.status(201).json(created);
});

fuelRouter.post("/:id/decision",requireFreshMfa,requirePermission(PERMISSIONS.FUEL_APPROVE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid fuel request id."});
  const input=z.object({decision:z.enum(["APPROVED","REJECTED"]),comments:z.string().max(1500).optional()}).parse(req.body);

  const result=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{id:string;status:string;requestedByUserId:string}>>(Prisma.sql`
      SELECT "id","status","requestedByUserId"
      FROM "FuelTransaction"
      WHERE "id"=${id}::uuid
        AND "organizationId"=${req.auth!.organizationId}::uuid
      FOR UPDATE
    `);
    const row=rows[0];
    if(!row)return {kind:"not_found" as const};
    if(row.status!=="REQUESTED")return {kind:"invalid_state" as const};
    if(row.requestedByUserId===req.auth!.userId)return {kind:"self_approval" as const};
    if(input.decision==="REJECTED"&&!input.comments)return {kind:"missing_reason" as const};

    const updated=await tx.fuelTransaction.update({
      where:{id:row.id},
      data:input.decision==="APPROVED"
        ? {status:"APPROVED",approvedByUserId:req.auth!.userId,approvedAt:new Date(),rejectionReason:null}
        : {status:"REJECTED",approvedByUserId:req.auth!.userId,approvedAt:new Date(),rejectionReason:input.comments!}
    });
    return {kind:"updated" as const,updated,oldStatus:row.status};
  });

  if(result.kind==="not_found")return res.status(404).json({error:"Fuel request not found."});
  if(result.kind==="invalid_state")return res.status(409).json({error:"Only pending fuel requests can be approved or rejected."});
  if(result.kind==="self_approval")return res.status(403).json({error:"A user cannot approve their own fuel request."});
  if(result.kind==="missing_reason")return res.status(400).json({error:"A rejection reason is required."});

  await audit(req,{action:input.decision==="APPROVED"?"APPROVE":"REJECT",recordType:"FUEL_TRANSACTION",recordId:result.updated.id,oldValue:{status:result.oldStatus},newValue:{status:result.updated.status},...(input.comments?{reason:input.comments}:{})});
  return res.json(result.updated);
});

fuelRouter.post("/:id/issue",requireFreshMfa,requirePermission(PERMISSIONS.FUEL_APPROVE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid fuel request id."});
  const input=z.object({issuedLitres:z.number().positive().max(5000),unitPrice:z.number().min(0),station:z.string().min(2).max(200),receiptNumber:z.string().max(150).optional(),odometerKm:z.number().int().min(0).optional(),notes:z.string().max(2000).optional()}).parse(req.body);

  const result=await prisma.$transaction(async tx=>{
    const fuelRows=await tx.$queryRaw<Array<{id:string;status:string;vehicleId:string;requestedLitres:Prisma.Decimal;odometerKm:number;notes:string|null}>>(Prisma.sql`
      SELECT "id","status","vehicleId","requestedLitres","odometerKm","notes"
      FROM "FuelTransaction"
      WHERE "id"=${id}::uuid
        AND "organizationId"=${req.auth!.organizationId}::uuid
      FOR UPDATE
    `);
    const row=fuelRows[0];
    if(!row)return {kind:"not_found" as const};
    if(row.status!=="APPROVED")return {kind:"invalid_state" as const};

    const vehicleRows=await tx.$queryRaw<Array<{id:string;status:string;archivedAt:Date|null;currentOdometerKm:number}>>(Prisma.sql`
      SELECT "id","status","archivedAt","currentOdometerKm"
      FROM "Vehicle"
      WHERE "id"=${row.vehicleId}::uuid
        AND "organizationId"=${req.auth!.organizationId}::uuid
      FOR UPDATE
    `);
    const vehicle=vehicleRows[0];
    if(!vehicle||vehicle.archivedAt)return {kind:"vehicle_not_found" as const};
    if(Number(input.issuedLitres)>Number(row.requestedLitres))return {kind:"over_issue" as const,requestedLitres:Number(row.requestedLitres)};
    const issueOdometer=input.odometerKm??row.odometerKm;
    validateOdometer(vehicle.currentOdometerKm,issueOdometer);
    const total=input.issuedLitres*input.unitPrice;

    await tx.vehicle.update({where:{id:vehicle.id},data:{currentOdometerKm:issueOdometer}});
    const updated=await tx.fuelTransaction.update({
      where:{id:row.id},
      data:{status:"ISSUED",issuedLitres:input.issuedLitres,unitPrice:input.unitPrice,totalCost:total,station:input.station,receiptNumber:input.receiptNumber??null,odometerKm:issueOdometer,issuedAt:new Date(),notes:input.notes??row.notes}
    });
    return {kind:"updated" as const,updated,oldStatus:row.status};
  });

  if(result.kind==="not_found")return res.status(404).json({error:"Fuel request not found."});
  if(result.kind==="invalid_state")return res.status(409).json({error:"Fuel must be approved before issue."});
  if(result.kind==="vehicle_not_found")return res.status(404).json({error:"Fuel vehicle not found."});
  if(result.kind==="over_issue")return res.status(409).json({error:`Issued litres cannot exceed the approved request of ${result.requestedLitres} litres.`});

  await audit(req,{action:"ISSUE",recordType:"FUEL_TRANSACTION",recordId:result.updated.id,oldValue:{status:result.oldStatus},newValue:{status:result.updated.status,issuedLitres:result.updated.issuedLitres,totalCost:result.updated.totalCost}});
  return res.json(result.updated);
});

