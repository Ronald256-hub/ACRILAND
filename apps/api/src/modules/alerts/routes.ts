import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const alertsRouter=Router();
function routeId(value:string|string[]|undefined):string|null{return typeof value==="string"?value:null;}
const dayMs=86_400_000;
const num=(v:unknown)=>Number(v??0);

alertsRouter.get("/",requirePermission(PERMISSIONS.ALERT_VIEW),async(req,res)=>{
  const items=await prisma.operationalAlert.findMany({where:{organizationId:req.auth!.organizationId},orderBy:[{status:"asc"},{severity:"desc"},{createdAt:"desc"}],take:500});const vehicleIds=[...new Set(items.map(i=>i.vehicleId).filter((x):x is string=>Boolean(x)))];const vehicles=vehicleIds.length?await prisma.vehicle.findMany({where:{id:{in:vehicleIds}},select:{id:true,registrationNumber:true,fleetNumber:true,make:true,model:true,status:true}}):[];const map=new Map(vehicles.map(v=>[v.id,v]));return res.json({items:items.map(i=>({...i,vehicle:i.vehicleId?map.get(i.vehicleId)??null:null})),summary:{open:items.filter(i=>i.status==="OPEN").length,acknowledged:items.filter(i=>i.status==="ACKNOWLEDGED").length,critical:items.filter(i=>i.status!=="CLOSED"&&i.severity==="CRITICAL").length,warning:items.filter(i=>i.status!=="CLOSED"&&i.severity==="WARNING").length}});
});

alertsRouter.post("/scan",requirePermission(PERMISSIONS.ALERT_MANAGE),async(req,res)=>{
  const organizationId=req.auth!.organizationId;const now=new Date();const [plans,vehicles,stock,incidents]=await Promise.all([
    prisma.preventiveMaintenancePlan.findMany({where:{organizationId,status:"ACTIVE"}}),
    prisma.vehicle.findMany({where:{organizationId,archivedAt:null},select:{id:true,registrationNumber:true,currentOdometerKm:true}}),
    prisma.inventoryItem.findMany({where:{organizationId,isActive:true}}),
    prisma.incidentReport.findMany({where:{organizationId,status:{not:"CLOSED"},severity:{in:["HIGH","CRITICAL"]}}})
  ]);const vm=new Map(vehicles.map(v=>[v.id,v]));let touched=0;
  for(const plan of plans){const vehicle=vm.get(plan.vehicleId);if(!vehicle)continue;const daysRemaining=plan.nextDueAt?Math.ceil((plan.nextDueAt.getTime()-now.getTime())/dayMs):null;const kmRemaining=plan.nextDueKm===null?null:plan.nextDueKm-vehicle.currentOdometerKm;const overdue=(daysRemaining!==null&&daysRemaining<0)||(kmRemaining!==null&&kmRemaining<0);const dueSoon=!overdue&&((daysRemaining!==null&&daysRemaining<=30)||(kmRemaining!==null&&kmRemaining<=1000));if(!overdue&&!dueSoon)continue;const detail=[daysRemaining!==null?`${Math.abs(daysRemaining)} day${Math.abs(daysRemaining)===1?"":"s"} ${daysRemaining<0?"overdue":"remaining"}`:null,kmRemaining!==null?`${Math.abs(kmRemaining).toLocaleString()} km ${kmRemaining<0?"overdue":"remaining"}`:null].filter(Boolean).join(" · ");await prisma.operationalAlert.upsert({where:{organizationId_sourceType_sourceId_category:{organizationId,sourceType:"PM_PLAN",sourceId:plan.id,category:"PREVENTIVE_MAINTENANCE"}},update:{severity:overdue?"CRITICAL":"WARNING",status:"OPEN",title:`${vehicle.registrationNumber} · ${overdue?"maintenance overdue":"maintenance due soon"}`,message:`${plan.name} · ${detail}`,vehicleId:vehicle.id,dueAt:plan.nextDueAt},create:{organizationId,category:"PREVENTIVE_MAINTENANCE",severity:overdue?"CRITICAL":"WARNING",sourceType:"PM_PLAN",sourceId:plan.id,title:`${vehicle.registrationNumber} · ${overdue?"maintenance overdue":"maintenance due soon"}`,message:`${plan.name} · ${detail}`,vehicleId:vehicle.id,dueAt:plan.nextDueAt}});touched++;}
  for(const item of stock){if(num(item.quantityOnHand)>num(item.reorderLevel))continue;await prisma.operationalAlert.upsert({where:{organizationId_sourceType_sourceId_category:{organizationId,sourceType:"INVENTORY_ITEM",sourceId:item.id,category:"LOW_STOCK"}},update:{severity:num(item.quantityOnHand)===0?"CRITICAL":"WARNING",status:"OPEN",title:`Low stock · ${item.name}`,message:`${item.sku}: ${num(item.quantityOnHand).toLocaleString()} ${item.unit} on hand; reorder level ${num(item.reorderLevel).toLocaleString()} ${item.unit}.`},create:{organizationId,category:"LOW_STOCK",severity:num(item.quantityOnHand)===0?"CRITICAL":"WARNING",sourceType:"INVENTORY_ITEM",sourceId:item.id,title:`Low stock · ${item.name}`,message:`${item.sku}: ${num(item.quantityOnHand).toLocaleString()} ${item.unit} on hand; reorder level ${num(item.reorderLevel).toLocaleString()} ${item.unit}.`}});touched++;}
  for(const incident of incidents){await prisma.operationalAlert.upsert({where:{organizationId_sourceType_sourceId_category:{organizationId,sourceType:"INCIDENT",sourceId:incident.id,category:"INCIDENT"}},update:{severity:incident.severity==="CRITICAL"?"CRITICAL":"WARNING",status:"OPEN",title:`${incident.incidentNumber} · ${incident.type.replaceAll("_"," ")}`,message:incident.description,vehicleId:incident.vehicleId},create:{organizationId,category:"INCIDENT",severity:incident.severity==="CRITICAL"?"CRITICAL":"WARNING",sourceType:"INCIDENT",sourceId:incident.id,title:`${incident.incidentNumber} · ${incident.type.replaceAll("_"," ")}`,message:incident.description,vehicleId:incident.vehicleId}});touched++;}
  await audit(req,{action:"SCAN",recordType:"OPERATIONAL_ALERT",recordId:"phase4-scan",newValue:{recordsEvaluated:plans.length+stock.length+incidents.length,alertsTouched:touched}});return res.json({alertsTouched:touched});
});

alertsRouter.post("/:id/ack",requirePermission(PERMISSIONS.ALERT_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid alert id."});const row=await prisma.operationalAlert.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Alert not found."});if(row.status==="CLOSED")return res.status(409).json({error:"Closed alerts cannot be acknowledged."});const updated=await prisma.operationalAlert.update({where:{id:row.id},data:{status:"ACKNOWLEDGED",acknowledgedByUserId:req.auth!.userId,acknowledgedAt:new Date()}});await audit(req,{action:"ACKNOWLEDGE",recordType:"OPERATIONAL_ALERT",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status}});return res.json(updated);
});

alertsRouter.post("/:id/close",requirePermission(PERMISSIONS.ALERT_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid alert id."});const row=await prisma.operationalAlert.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Alert not found."});const updated=await prisma.operationalAlert.update({where:{id:row.id},data:{status:"CLOSED",closedByUserId:req.auth!.userId,closedAt:new Date()}});await audit(req,{action:"CLOSE",recordType:"OPERATIONAL_ALERT",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status}});return res.json(updated);
});
