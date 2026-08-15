import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { calculateDriverScore, incidentPenalty } from "../../domain/controlIntelligence.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize.js";

export const safetyRouter=Router();
const dayMs=86_400_000;
function scorePeriod(days:number){const end=new Date();end.setUTCHours(23,59,59,999);const start=new Date(end.getTime()-(days*dayMs)+1);start.setUTCHours(0,0,0,0);return{start,end};}

async function latestScores(organizationId:string,driverFilter?:string){
  const drivers=await prisma.driver.findMany({where:{organizationId,archivedAt:null,...(driverFilter?{id:driverFilter}:{})},select:{id:true,employeeNumber:true,fullName:true,status:true,licenceExpiry:true}});const snapshots=drivers.length?await prisma.driverScoreSnapshot.findMany({where:{organizationId,driverId:{in:drivers.map(d=>d.id)}},orderBy:{calculatedAt:"desc"}}):[];const latest=new Map<string,(typeof snapshots)[number]>();for(const row of snapshots)if(!latest.has(row.driverId))latest.set(row.driverId,row);return drivers.map(driver=>({...driver,score:latest.get(driver.id)??null}));
}

safetyRouter.get("/scores",requirePermission(PERMISSIONS.SAFETY_VIEW),async(req,res)=>res.json({items:await latestScores(req.auth!.organizationId)}));
safetyRouter.get("/me",requirePermission(PERMISSIONS.SAFETY_VIEW_SELF),async(req,res)=>{const driver=await prisma.driver.findFirst({where:{organizationId:req.auth!.organizationId,userId:req.auth!.userId,archivedAt:null},select:{id:true}});if(!driver)return res.status(404).json({error:"Driver profile is not linked to this account."});const items=await latestScores(req.auth!.organizationId,driver.id);const events=await prisma.driverSafetyEvent.findMany({where:{organizationId:req.auth!.organizationId,driverId:driver.id},orderBy:{occurredAt:"desc"},take:50});return res.json({driver:items[0]??null,events});});

safetyRouter.get("/events",requireAnyPermission(PERMISSIONS.SAFETY_VIEW,PERMISSIONS.SAFETY_VIEW_SELF),async(req,res)=>{let driverId=typeof req.query.driverId==="string"?req.query.driverId:undefined;if(!req.auth!.permissions.has(PERMISSIONS.SAFETY_VIEW)){const driver=await prisma.driver.findFirst({where:{organizationId:req.auth!.organizationId,userId:req.auth!.userId,archivedAt:null},select:{id:true}});if(!driver)return res.status(404).json({error:"Driver profile is not linked to this account."});driverId=driver.id;}const items=await prisma.driverSafetyEvent.findMany({where:{organizationId:req.auth!.organizationId,...(driverId?{driverId}:{})},orderBy:{occurredAt:"desc"},take:300});return res.json({items});});

safetyRouter.post("/recalculate",requirePermission(PERMISSIONS.SAFETY_RECALCULATE),async(req,res)=>{
  const raw=Number(req.body?.days??90);const days=Number.isInteger(raw)?Math.max(30,Math.min(365,raw)):90;const {start,end}=scorePeriod(days),organizationId=req.auth!.organizationId;const drivers=await prisma.driver.findMany({where:{organizationId,archivedAt:null},select:{id:true}});let calculated=0;
  for(const driver of drivers){const [events,incidents,failedInspections]=await Promise.all([
    prisma.driverSafetyEvent.findMany({where:{organizationId,driverId:driver.id,occurredAt:{gte:start,lte:end}},select:{penaltyPoints:true,type:true}}),
    prisma.incidentReport.findMany({where:{organizationId,driverId:driver.id,occurredAt:{gte:start,lte:end}},select:{severity:true,type:true,status:true}}),
    prisma.vehicleInspection.count({where:{organizationId,driverId:driver.id,status:"FAILED",createdAt:{gte:start,lte:end}}})
  ]);const safetyEventPoints=events.reduce((sum,event)=>sum+event.penaltyPoints,0),incidentPoints=incidents.reduce((sum,incident)=>sum+incidentPenalty(incident.severity),0),inspectionPoints=failedInspections*5;const result=calculateDriverScore({safetyEventPoints,incidentPoints,inspectionPoints});await prisma.driverScoreSnapshot.upsert({where:{organizationId_driverId_periodStart_periodEnd:{organizationId,driverId:driver.id,periodStart:start,periodEnd:end}},update:{score:result.score,safetyEventPoints,incidentPoints,inspectionPoints,riskBand:result.riskBand,details:{days,eventCount:events.length,incidentCount:incidents.length,failedInspectionCount:failedInspections},calculatedByUserId:req.auth!.userId,calculatedAt:new Date()},create:{organizationId,driverId:driver.id,periodStart:start,periodEnd:end,score:result.score,safetyEventPoints,incidentPoints,inspectionPoints,riskBand:result.riskBand,details:{days,eventCount:events.length,incidentCount:incidents.length,failedInspectionCount:failedInspections},calculatedByUserId:req.auth!.userId}});calculated++;}
  await audit(req,{action:"RECALCULATE",recordType:"DRIVER_SCORE",recordId:`${start.toISOString()}:${end.toISOString()}`,newValue:{drivers:calculated,days}});return res.json({driversCalculated:calculated,periodStart:start,periodEnd:end});
});
