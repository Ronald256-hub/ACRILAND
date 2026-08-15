import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { validateOdometer } from "../../domain/rules.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize.js";

export const maintenanceRouter = Router();
const activeStatuses = ["OPEN","DIAGNOSIS","AWAITING_APPROVAL","APPROVED","IN_PROGRESS","QC","READY_FOR_RELEASE"] as const;
function routeId(value: string | string[] | undefined): string | null { return typeof value === "string" ? value : null; }
function newWorkOrderNumber(): string { const day = new Date().toISOString().slice(0,10).replaceAll("-",""); return `WO-${day}-${randomUUID().slice(0,8).toUpperCase()}`; }

maintenanceRouter.get("/", requireAnyPermission(PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.MAINTENANCE_OPEN), async (req,res) => {
  const items = await prisma.maintenanceWorkOrder.findMany({
    where: { organizationId: req.auth!.organizationId },
    include: {
      vehicle: { select: { id:true, registrationNumber:true, fleetNumber:true, make:true, model:true, status:true, currentOdometerKm:true, nextServiceDueAt:true, nextServiceDueKm:true } },
      openedBy: { select: { id:true, fullName:true } }, approvedBy: { select: { id:true, fullName:true } }, releasedBy: { select: { id:true, fullName:true } }
    },
    orderBy: [{ status:"asc" },{ priority:"desc" },{ openedAt:"desc" }], take: 200
  });
  return res.json({ items });
});

maintenanceRouter.post("/", requirePermission(PERMISSIONS.MAINTENANCE_OPEN), async (req,res) => {
  const input = z.object({
    vehicleId:z.string().uuid(), category:z.string().min(2).max(100), title:z.string().min(3).max(200), description:z.string().min(3).max(3000),
    priority:z.enum(["LOW","NORMAL","HIGH","CRITICAL"]).default("NORMAL"), odometerKm:z.number().int().min(0), vendor:z.string().max(200).optional(), estimatedCost:z.number().min(0).optional()
  }).parse(req.body);
  const vehicle = await prisma.vehicle.findFirst({ where:{ id:input.vehicleId, organizationId:req.auth!.organizationId, archivedAt:null } });
  if(!vehicle) return res.status(404).json({error:"Vehicle not found."});
  if(vehicle.status === "ON_TRIP") return res.status(409).json({error:"A vehicle cannot enter workshop while an active trip is in progress."});
  const existing = await prisma.maintenanceWorkOrder.findFirst({ where:{ vehicleId:vehicle.id, organizationId:req.auth!.organizationId, status:{in:[...activeStatuses]} } });
  if(existing) return res.status(409).json({error:`Vehicle already has active work order ${existing.workOrderNumber}.`});
  validateOdometer(vehicle.currentOdometerKm,input.odometerKm);
  const now = new Date();
  const created = await prisma.$transaction(async tx => {
    await tx.vehicle.update({ where:{id:vehicle.id}, data:{ status:"UNDER_MAINTENANCE", currentOdometerKm:input.odometerKm } });
    return tx.maintenanceWorkOrder.create({ data:{ organizationId:req.auth!.organizationId, workOrderNumber:newWorkOrderNumber(), vehicleId:vehicle.id, openedByUserId:req.auth!.userId, priority:input.priority, category:input.category, title:input.title, description:input.description, odometerKm:input.odometerKm, vendor:input.vendor??null, estimatedCost:input.estimatedCost??null, downtimeStart:now } });
  });
  await audit(req,{action:"CREATE",recordType:"MAINTENANCE_WORK_ORDER",recordId:created.id,newValue:created});
  return res.status(201).json(created);
});

maintenanceRouter.post("/:id/diagnose", requirePermission(PERMISSIONS.MAINTENANCE_OPEN), async (req,res) => {
  const id=routeId(req.params.id); if(!id) return res.status(400).json({error:"Invalid work order id."});
  const input=z.object({diagnosis:z.string().min(3).max(5000),estimatedCost:z.number().min(0).optional(),vendor:z.string().max(200).optional(),requestApproval:z.boolean().default(true)}).parse(req.body);
  const row=await prisma.maintenanceWorkOrder.findFirst({where:{id,organizationId:req.auth!.organizationId}}); if(!row)return res.status(404).json({error:"Work order not found."});
  if(!["OPEN","DIAGNOSIS","AWAITING_APPROVAL"].includes(row.status))return res.status(409).json({error:`Diagnosis cannot be changed while work order is ${row.status}.`});
  const updated=await prisma.maintenanceWorkOrder.update({where:{id:row.id},data:{diagnosis:input.diagnosis,estimatedCost:input.estimatedCost??row.estimatedCost,vendor:input.vendor??row.vendor,status:input.requestApproval?"AWAITING_APPROVAL":"DIAGNOSIS"}});
  await audit(req,{action:"UPDATE",recordType:"MAINTENANCE_WORK_ORDER",recordId:row.id,oldValue:{status:row.status,diagnosis:row.diagnosis},newValue:{status:updated.status,diagnosis:updated.diagnosis,estimatedCost:updated.estimatedCost}});
  return res.json(updated);
});

maintenanceRouter.post("/:id/decision", requirePermission(PERMISSIONS.MAINTENANCE_APPROVE), async (req,res) => {
  const id=routeId(req.params.id); if(!id) return res.status(400).json({error:"Invalid work order id."});
  const input=z.object({decision:z.enum(["APPROVED","REJECTED"]),comments:z.string().max(1500).optional()}).parse(req.body);
  const row=await prisma.maintenanceWorkOrder.findFirst({where:{id,organizationId:req.auth!.organizationId},include:{vehicle:true}}); if(!row)return res.status(404).json({error:"Work order not found."});
  if(row.status!=="AWAITING_APPROVAL")return res.status(409).json({error:"Only work orders awaiting approval can be decided."});
  const now=new Date();
  const updated=await prisma.$transaction(async tx=>{
    if(input.decision==="REJECTED") await tx.vehicle.update({where:{id:row.vehicleId},data:{status:"GROUNDED"}});
    return tx.maintenanceWorkOrder.update({where:{id:row.id},data:input.decision==="APPROVED"?{status:"APPROVED",approvedByUserId:req.auth!.userId,approvedAt:now}:{status:"CANCELLED",approvedByUserId:req.auth!.userId,approvedAt:now,qcNotes:input.comments??"Repair approval rejected",downtimeEnd:now}});
  });
  await audit(req,{action:input.decision==="APPROVED"?"APPROVE":"REJECT",recordType:"MAINTENANCE_WORK_ORDER",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status},...(input.comments?{reason:input.comments}:{})});
  return res.json(updated);
});

maintenanceRouter.post("/:id/start", requirePermission(PERMISSIONS.MAINTENANCE_OPEN), async (req,res) => {
  const id=routeId(req.params.id); if(!id) return res.status(400).json({error:"Invalid work order id."});
  const row=await prisma.maintenanceWorkOrder.findFirst({where:{id,organizationId:req.auth!.organizationId}}); if(!row)return res.status(404).json({error:"Work order not found."});
  if(!["APPROVED","QC"].includes(row.status))return res.status(409).json({error:"Work can only start after approval or return from QC."});
  const updated=await prisma.maintenanceWorkOrder.update({where:{id:row.id},data:{status:"IN_PROGRESS"}});
  await audit(req,{action:"UPDATE",recordType:"MAINTENANCE_WORK_ORDER",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status}}); return res.json(updated);
});

maintenanceRouter.post("/:id/complete", requirePermission(PERMISSIONS.MAINTENANCE_OPEN), async (req,res) => {
  const id=routeId(req.params.id); if(!id) return res.status(400).json({error:"Invalid work order id."});
  const input=z.object({workPerformed:z.string().min(3).max(6000),labourCost:z.number().min(0).default(0),partsCost:z.number().min(0).default(0),qcNotes:z.string().max(3000).optional(),nextServiceDueAt:z.coerce.date().optional(),nextServiceDueKm:z.number().int().min(0).optional()}).parse(req.body);
  const row=await prisma.maintenanceWorkOrder.findFirst({where:{id,organizationId:req.auth!.organizationId}}); if(!row)return res.status(404).json({error:"Work order not found."});
  if(!["IN_PROGRESS","QC"].includes(row.status))return res.status(409).json({error:"Only work in progress can be completed for release."});
  if(input.nextServiceDueKm!==undefined && input.nextServiceDueKm<row.odometerKm)return res.status(400).json({error:"Next service odometer cannot be below the workshop odometer."});
  const total=input.labourCost+input.partsCost;
  const updated=await prisma.maintenanceWorkOrder.update({where:{id:row.id},data:{status:"READY_FOR_RELEASE",workPerformed:input.workPerformed,labourCost:input.labourCost,partsCost:input.partsCost,totalCost:total,qcNotes:input.qcNotes??null,nextServiceDueAt:input.nextServiceDueAt??null,nextServiceDueKm:input.nextServiceDueKm??null,completedAt:new Date()}});
  await audit(req,{action:"UPDATE",recordType:"MAINTENANCE_WORK_ORDER",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status,totalCost:updated.totalCost}}); return res.json(updated);
});

maintenanceRouter.post("/:id/release", requirePermission(PERMISSIONS.MAINTENANCE_RELEASE), async (req,res) => {
  const id=routeId(req.params.id); if(!id) return res.status(400).json({error:"Invalid work order id."});
  const input=z.object({qcNotes:z.string().min(2).max(3000).optional()}).parse(req.body);
  const row=await prisma.maintenanceWorkOrder.findFirst({where:{id,organizationId:req.auth!.organizationId},include:{vehicle:true}}); if(!row)return res.status(404).json({error:"Work order not found."});
  if(row.status!=="READY_FOR_RELEASE")return res.status(409).json({error:"Work order must be completed and ready before vehicle release."});
  const now=new Date();
  const updated=await prisma.$transaction(async tx=>{
    await tx.vehicle.update({where:{id:row.vehicleId},data:{status:"AVAILABLE",lastServiceAt:now,nextServiceDueAt:row.nextServiceDueAt,nextServiceDueKm:row.nextServiceDueKm,currentOdometerKm:Math.max(row.vehicle.currentOdometerKm,row.odometerKm)}});
    return tx.maintenanceWorkOrder.update({where:{id:row.id},data:{status:"CLOSED",releasedByUserId:req.auth!.userId,releasedAt:now,downtimeEnd:now,qcNotes:input.qcNotes??row.qcNotes}});
  });
  await audit(req,{action:"RELEASE",recordType:"MAINTENANCE_WORK_ORDER",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status,vehicleStatus:"AVAILABLE"},...(input.qcNotes?{reason:input.qcNotes}:{})}); return res.json(updated);
});
