import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { assertDifferentApprover, validateOdometer } from "../../domain/rules.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize.js";

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

fuelRouter.post("/:id/decision",requirePermission(PERMISSIONS.FUEL_APPROVE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid fuel request id."});
  const input=z.object({decision:z.enum(["APPROVED","REJECTED"]),comments:z.string().max(1500).optional()}).parse(req.body);
  const row=await prisma.fuelTransaction.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Fuel request not found."});if(row.status!=="REQUESTED")return res.status(409).json({error:"Only pending fuel requests can be approved or rejected."});
  assertDifferentApprover(row.requestedByUserId,req.auth!.userId);
  let updated;
  if(input.decision==="APPROVED"){
    updated=await prisma.fuelTransaction.update({where:{id:row.id},data:{status:"APPROVED",approvedByUserId:req.auth!.userId,approvedAt:new Date(),rejectionReason:null}});
  }else{
    const rejectionReason=input.comments;if(!rejectionReason)return res.status(400).json({error:"A rejection reason is required."});
    updated=await prisma.fuelTransaction.update({where:{id:row.id},data:{status:"REJECTED",approvedByUserId:req.auth!.userId,approvedAt:new Date(),rejectionReason}});
  }
  await audit(req,{action:input.decision==="APPROVED"?"APPROVE":"REJECT",recordType:"FUEL_TRANSACTION",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status},...(input.comments?{reason:input.comments}:{})});return res.json(updated);
});

fuelRouter.post("/:id/issue",requirePermission(PERMISSIONS.FUEL_APPROVE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid fuel request id."});
  const input=z.object({issuedLitres:z.number().positive().max(5000),unitPrice:z.number().min(0),station:z.string().min(2).max(200),receiptNumber:z.string().max(150).optional(),odometerKm:z.number().int().min(0).optional(),notes:z.string().max(2000).optional()}).parse(req.body);
  const row=await prisma.fuelTransaction.findFirst({where:{id,organizationId:req.auth!.organizationId},include:{vehicle:true}});if(!row)return res.status(404).json({error:"Fuel request not found."});if(row.status!=="APPROVED")return res.status(409).json({error:"Fuel must be approved before issue."});
  const issueOdometer=input.odometerKm??row.odometerKm;validateOdometer(row.vehicle.currentOdometerKm,issueOdometer);const total=input.issuedLitres*input.unitPrice;
  const updated=await prisma.$transaction(async tx=>{await tx.vehicle.update({where:{id:row.vehicleId},data:{currentOdometerKm:issueOdometer}});return tx.fuelTransaction.update({where:{id:row.id},data:{status:"ISSUED",issuedLitres:input.issuedLitres,unitPrice:input.unitPrice,totalCost:total,station:input.station,receiptNumber:input.receiptNumber??null,odometerKm:issueOdometer,issuedAt:new Date(),notes:input.notes??row.notes}});});
  await audit(req,{action:"ISSUE",recordType:"FUEL_TRANSACTION",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status,issuedLitres:updated.issuedLitres,totalCost:updated.totalCost}});return res.json(updated);
});
