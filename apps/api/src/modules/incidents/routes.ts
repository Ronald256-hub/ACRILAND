import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize.js";

export const incidentsRouter = Router();
function routeId(value:string|string[]|undefined):string|null{return typeof value==="string"?value:null;}
function incidentNumber():string{const day=new Date().toISOString().slice(0,10).replaceAll("-","");return `INC-${day}-${randomUUID().slice(0,8).toUpperCase()}`;}

incidentsRouter.get("/",requireAnyPermission(PERMISSIONS.INCIDENT_VIEW,PERMISSIONS.INCIDENT_CREATE),async(req,res)=>{
  const canViewAll=req.auth!.permissions.has(PERMISSIONS.INCIDENT_VIEW);
  const items=await prisma.incidentReport.findMany({where:{organizationId:req.auth!.organizationId,...(!canViewAll?{reportedByUserId:req.auth!.userId}:{})},orderBy:{occurredAt:"desc"},take:300});
  const vehicleIds=[...new Set(items.map(i=>i.vehicleId).filter((x):x is string=>Boolean(x)))];const driverIds=[...new Set(items.map(i=>i.driverId).filter((x):x is string=>Boolean(x)))];
  const [vehicles,drivers]=await Promise.all([vehicleIds.length?prisma.vehicle.findMany({where:{id:{in:vehicleIds}},select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,status:true}}):[],driverIds.length?prisma.driver.findMany({where:{id:{in:driverIds}},select:{id:true,employeeNumber:true,fullName:true,status:true}}):[]]);
  const vm=new Map(vehicles.map(v=>[v.id,v])),dm=new Map(drivers.map(d=>[d.id,d]));return res.json({items:items.map(i=>({...i,vehicle:i.vehicleId?vm.get(i.vehicleId)??null:null,driver:i.driverId?dm.get(i.driverId)??null:null}))});
});

incidentsRouter.post("/",requirePermission(PERMISSIONS.INCIDENT_CREATE),async(req,res)=>{
  const input=z.object({type:z.enum(["ACCIDENT","BREAKDOWN","DAMAGE","THEFT","SAFETY","OTHER"]),severity:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).default("MEDIUM"),vehicleId:z.string().uuid().optional(),tripId:z.string().uuid().optional(),occurredAt:z.coerce.date(),location:z.string().min(2).max(300),description:z.string().min(10).max(5000),injuriesReported:z.boolean().default(false),policeReference:z.string().max(150).optional(),insuranceReference:z.string().max(150).optional(),estimatedLoss:z.number().min(0).optional()}).parse(req.body);
  let vehicleId=input.vehicleId??null,driverId:string|null=null,tripId=input.tripId??null;
  if(input.tripId){const trip=await prisma.trip.findFirst({where:{id:input.tripId,organizationId:req.auth!.organizationId},select:{id:true,vehicleId:true,driverId:true}});if(!trip)return res.status(400).json({error:"Trip does not belong to this organization."});vehicleId=vehicleId??trip.vehicleId;driverId=trip.driverId;}
  if(req.auth!.roles.includes("DRIVER")){
    const driver=await prisma.driver.findFirst({where:{organizationId:req.auth!.organizationId,userId:req.auth!.userId,archivedAt:null}});if(!driver)return res.status(403).json({error:"Driver profile is not linked to this account."});driverId=driver.id;
    const assignment=await prisma.vehicleAssignment.findFirst({where:{organizationId:req.auth!.organizationId,driverId:driver.id,status:"ACTIVE"}});if(!assignment)return res.status(403).json({error:"No active vehicle assignment is available for incident reporting."});if(vehicleId&&vehicleId!==assignment.vehicleId)return res.status(403).json({error:"Drivers may report incidents only for their actively assigned vehicle."});vehicleId=assignment.vehicleId;
  }
  if(vehicleId){const vehicle=await prisma.vehicle.findFirst({where:{id:vehicleId,organizationId:req.auth!.organizationId,archivedAt:null},select:{id:true}});if(!vehicle)return res.status(404).json({error:"Vehicle not found."});}
  const created=await prisma.$transaction(async tx=>{const incident=await tx.incidentReport.create({data:{organizationId:req.auth!.organizationId,incidentNumber:incidentNumber(),type:input.type,severity:input.severity,vehicleId,driverId,tripId,reportedByUserId:req.auth!.userId,occurredAt:input.occurredAt,location:input.location,description:input.description,injuriesReported:input.injuriesReported,policeReference:input.policeReference??null,insuranceReference:input.insuranceReference??null,estimatedLoss:input.estimatedLoss??null}});if(vehicleId){const status=input.type==="ACCIDENT"?"ACCIDENT":input.type==="BREAKDOWN"?"BREAKDOWN":input.severity==="CRITICAL"?"GROUNDED":null;if(status)await tx.vehicle.update({where:{id:vehicleId},data:{status}});}if(input.severity==="HIGH"||input.severity==="CRITICAL"||input.injuriesReported){await tx.operationalAlert.upsert({where:{organizationId_sourceType_sourceId_category:{organizationId:req.auth!.organizationId,sourceType:"INCIDENT",sourceId:incident.id,category:"INCIDENT"}},update:{severity:input.severity==="CRITICAL"||input.injuriesReported?"CRITICAL":"WARNING",status:"OPEN",title:`${input.type.replaceAll("_"," ")} requires management attention`,message:input.description,vehicleId},create:{organizationId:req.auth!.organizationId,category:"INCIDENT",severity:input.severity==="CRITICAL"||input.injuriesReported?"CRITICAL":"WARNING",sourceType:"INCIDENT",sourceId:incident.id,title:`${input.type.replaceAll("_"," ")} requires management attention`,message:input.description,vehicleId}});}return incident;});
  await audit(req,{action:"CREATE",recordType:"INCIDENT",recordId:created.id,newValue:created});return res.status(201).json(created);
});

incidentsRouter.patch("/:id",requirePermission(PERMISSIONS.INCIDENT_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid incident id."});const input=z.object({severity:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).optional(),status:z.enum(["OPEN","INVESTIGATING","ACTION_REQUIRED","CLOSED"]).optional(),policeReference:z.string().max(150).nullable().optional(),insuranceReference:z.string().max(150).nullable().optional(),estimatedLoss:z.number().min(0).nullable().optional(),rootCause:z.string().max(3000).nullable().optional(),correctiveAction:z.string().max(3000).nullable().optional()}).parse(req.body);
  const row=await prisma.incidentReport.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Incident not found."});const nextStatus=input.status??row.status;const rootCause=input.rootCause===undefined?row.rootCause:input.rootCause;const corrective=input.correctiveAction===undefined?row.correctiveAction:input.correctiveAction;if(nextStatus==="CLOSED"&&(!rootCause||!corrective))return res.status(400).json({error:"Root cause and corrective action are required before an incident can be closed."});
  const data:Prisma.IncidentReportUncheckedUpdateInput={closedAt:nextStatus==="CLOSED"?(row.closedAt??new Date()):null};
  if(input.severity!==undefined)data.severity=input.severity;if(input.status!==undefined)data.status=input.status;if(input.policeReference!==undefined)data.policeReference=input.policeReference;if(input.insuranceReference!==undefined)data.insuranceReference=input.insuranceReference;if(input.estimatedLoss!==undefined)data.estimatedLoss=input.estimatedLoss;if(input.rootCause!==undefined)data.rootCause=input.rootCause;if(input.correctiveAction!==undefined)data.correctiveAction=input.correctiveAction;
  const updated=await prisma.incidentReport.update({where:{id:row.id},data});if(nextStatus==="CLOSED")await prisma.operationalAlert.updateMany({where:{organizationId:req.auth!.organizationId,sourceType:"INCIDENT",sourceId:row.id,status:{not:"CLOSED"}},data:{status:"CLOSED",closedByUserId:req.auth!.userId,closedAt:new Date()}});await audit(req,{action:"UPDATE",recordType:"INCIDENT",recordId:row.id,oldValue:row,newValue:updated});return res.json(updated);
});
