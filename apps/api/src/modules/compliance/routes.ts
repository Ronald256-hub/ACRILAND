import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const complianceRouter = Router();
function routeId(value:string|string[]|undefined):string|null{return typeof value==="string"?value:null;}
const documentInput=z.object({vehicleId:z.string().uuid(),type:z.enum(["INSURANCE","ROAD_LICENCE","FITNESS","THIRD_PARTY","TAX","WARRANTY","OTHER"]),referenceNumber:z.string().min(2).max(150),provider:z.string().max(200).optional(),issueDate:z.coerce.date().optional(),expiryDate:z.coerce.date(),notes:z.string().max(2000).optional(),documentUrl:z.string().url().max(1000).optional()});

complianceRouter.get("/documents",requirePermission(PERMISSIONS.COMPLIANCE_VIEW),async(req,res)=>{
  const items=await prisma.complianceDocument.findMany({where:{organizationId:req.auth!.organizationId},include:{vehicle:{select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,status:true}},createdBy:{select:{id:true,fullName:true}}},orderBy:{expiryDate:"asc"},take:300});return res.json({items});
});

complianceRouter.post("/documents",requirePermission(PERMISSIONS.COMPLIANCE_MANAGE),async(req,res)=>{
  const input=documentInput.parse(req.body);if(input.issueDate&&input.expiryDate<input.issueDate)return res.status(400).json({error:"Expiry date cannot be earlier than issue date."});
  const vehicle=await prisma.vehicle.findFirst({where:{id:input.vehicleId,organizationId:req.auth!.organizationId,archivedAt:null},select:{id:true}});if(!vehicle)return res.status(404).json({error:"Vehicle not found."});
  const created=await prisma.complianceDocument.create({data:{organizationId:req.auth!.organizationId,vehicleId:vehicle.id,type:input.type,referenceNumber:input.referenceNumber,provider:input.provider??null,issueDate:input.issueDate??null,expiryDate:input.expiryDate,notes:input.notes??null,documentUrl:input.documentUrl??null,createdByUserId:req.auth!.userId}});
  await audit(req,{action:"CREATE",recordType:"COMPLIANCE_DOCUMENT",recordId:created.id,newValue:created});return res.status(201).json(created);
});

complianceRouter.patch("/documents/:id",requirePermission(PERMISSIONS.COMPLIANCE_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid compliance document id."});const input=documentInput.partial().parse(req.body);
  const row=await prisma.complianceDocument.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Compliance document not found."});
  if(input.vehicleId){const vehicle=await prisma.vehicle.findFirst({where:{id:input.vehicleId,organizationId:req.auth!.organizationId,archivedAt:null},select:{id:true}});if(!vehicle)return res.status(404).json({error:"Vehicle not found."});}
  const issue=input.issueDate===undefined?row.issueDate:input.issueDate;const expiry=input.expiryDate??row.expiryDate;if(issue&&expiry<issue)return res.status(400).json({error:"Expiry date cannot be earlier than issue date."});
  const updated=await prisma.complianceDocument.update({where:{id:row.id},data:{vehicleId:input.vehicleId, type:input.type,referenceNumber:input.referenceNumber,provider:input.provider,issueDate:input.issueDate,expiryDate:input.expiryDate,notes:input.notes,documentUrl:input.documentUrl}});
  await audit(req,{action:"UPDATE",recordType:"COMPLIANCE_DOCUMENT",recordId:row.id,oldValue:row,newValue:updated});return res.json(updated);
});

complianceRouter.get("/alerts",requirePermission(PERMISSIONS.COMPLIANCE_VIEW),async(req,res)=>{
  const org=req.auth!.organizationId;const now=new Date();const ninetyDays=new Date(now.getTime()+90*86400000);const sixtyDays=new Date(now.getTime()+60*86400000);
  const [documents,drivers,vehicles,failedInspections]=await Promise.all([
    prisma.complianceDocument.findMany({where:{organizationId:org,expiryDate:{lte:ninetyDays}},include:{vehicle:{select:{id:true,registrationNumber:true}}},orderBy:{expiryDate:"asc"}}),
    prisma.driver.findMany({where:{organizationId:org,archivedAt:null,licenceExpiry:{lte:sixtyDays}},select:{id:true,fullName:true,employeeNumber:true,licenceExpiry:true,status:true}}),
    prisma.vehicle.findMany({where:{organizationId:org,archivedAt:null},select:{id:true,registrationNumber:true,status:true,currentOdometerKm:true,nextServiceDueAt:true,nextServiceDueKm:true}}),
    prisma.vehicleInspection.findMany({where:{organizationId:org,status:"FAILED",createdAt:{gte:new Date(now.getTime()-30*86400000)}},include:{vehicle:{select:{id:true,registrationNumber:true}},results:{where:{result:"FAIL",isCritical:true},select:{id:true,labelSnapshot:true}}},orderBy:{createdAt:"desc"},take:50})
  ]);
  const alerts:Array<{id:string;kind:string;severity:"critical"|"warning"|"info";entityType:string;entityId:string;entityLabel:string;title:string;detail:string;dueAt?:string}> = [];
  const days=(date:Date)=>Math.ceil((date.getTime()-now.getTime())/86400000);
  for(const doc of documents){const remaining=days(doc.expiryDate);alerts.push({id:`doc:${doc.id}`,kind:"COMPLIANCE",severity:remaining<0?"critical":remaining<=30?"warning":"info",entityType:"VEHICLE",entityId:doc.vehicle.id,entityLabel:doc.vehicle.registrationNumber,title:`${doc.type.replaceAll("_"," ")} ${remaining<0?"expired":"expires soon"}`,detail:`${doc.referenceNumber}${doc.provider?` · ${doc.provider}`:""} · ${remaining<0?`${Math.abs(remaining)} days overdue`:`${remaining} days remaining`}`,dueAt:doc.expiryDate.toISOString()});}
  for(const driver of drivers){const remaining=days(driver.licenceExpiry);alerts.push({id:`driver:${driver.id}`,kind:"DRIVER_LICENCE",severity:remaining<0?"critical":remaining<=30?"warning":"info",entityType:"DRIVER",entityId:driver.id,entityLabel:driver.fullName,title:remaining<0?"Driver licence expired":"Driver licence expiring",detail:`${driver.employeeNumber} · ${remaining<0?`${Math.abs(remaining)} days overdue`:`${remaining} days remaining`}`,dueAt:driver.licenceExpiry.toISOString()});}
  for(const vehicle of vehicles){const dueByDate=vehicle.nextServiceDueAt?days(vehicle.nextServiceDueAt):null;const kmRemaining=vehicle.nextServiceDueKm==null?null:vehicle.nextServiceDueKm-vehicle.currentOdometerKm;const serviceExposure=(dueByDate!==null&&dueByDate<=30)||(kmRemaining!==null&&kmRemaining<=1000);if(serviceExposure){const overdue=(dueByDate!==null&&dueByDate<0)||(kmRemaining!==null&&kmRemaining<0);alerts.push({id:`service:${vehicle.id}`,kind:"SERVICE",severity:overdue?"critical":"warning",entityType:"VEHICLE",entityId:vehicle.id,entityLabel:vehicle.registrationNumber,title:overdue?"Service overdue":"Service due soon",detail:[dueByDate!==null?`${Math.abs(dueByDate)} day${Math.abs(dueByDate)===1?"":"s"} ${dueByDate<0?"overdue":"remaining"}`:null,kmRemaining!==null?`${Math.abs(kmRemaining).toLocaleString()} km ${kmRemaining<0?"overdue":"remaining"}`:null].filter(Boolean).join(" · "),...(vehicle.nextServiceDueAt?{dueAt:vehicle.nextServiceDueAt.toISOString()}:{})});}
    if(["SERVICE_OVERDUE","GROUNDED","BREAKDOWN","ACCIDENT"].includes(vehicle.status))alerts.push({id:`status:${vehicle.id}:${vehicle.status}`,kind:"VEHICLE_STATUS",severity:"critical",entityType:"VEHICLE",entityId:vehicle.id,entityLabel:vehicle.registrationNumber,title:`Vehicle ${vehicle.status.replaceAll("_"," ").toLowerCase()}`,detail:"Vehicle status requires management attention before dispatch."});}
  for(const inspection of failedInspections){if(inspection.results.length)alerts.push({id:`inspection:${inspection.id}`,kind:"SAFETY",severity:"critical",entityType:"VEHICLE",entityId:inspection.vehicle.id,entityLabel:inspection.vehicle.registrationNumber,title:"Critical inspection failure",detail:inspection.results.map(r=>r.labelSnapshot).join(", ")});}
  const rank={critical:0,warning:1,info:2};alerts.sort((a,b)=>rank[a.severity]-rank[b.severity]);return res.json({items:alerts,summary:{critical:alerts.filter(a=>a.severity==="critical").length,warning:alerts.filter(a=>a.severity==="warning").length,info:alerts.filter(a=>a.severity==="info").length,total:alerts.length}});
});
