import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { queueOrganizationAlertEmails,dispatchPendingNotifications } from "../../lib/notificationDelivery.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const notificationsRouter=Router();

notificationsRouter.get("/preferences/me",async(req,res)=>{const preference=await prisma.notificationPreference.findUnique({where:{userId:req.auth!.userId}});return res.json(preference??{organizationId:req.auth!.organizationId,userId:req.auth!.userId,emailEnabled:false,criticalOnly:true,categories:null});});
notificationsRouter.put("/preferences/me",async(req,res)=>{const input=z.object({emailEnabled:z.boolean(),criticalOnly:z.boolean().default(true),categories:z.array(z.string().min(1).max(100)).max(50).nullable().optional()}).parse(req.body);const updated=await prisma.notificationPreference.upsert({where:{userId:req.auth!.userId},update:{emailEnabled:input.emailEnabled,criticalOnly:input.criticalOnly,categories:input.categories??undefined},create:{organizationId:req.auth!.organizationId,userId:req.auth!.userId,emailEnabled:input.emailEnabled,criticalOnly:input.criticalOnly,categories:input.categories??undefined}});await audit(req,{action:"UPDATE",recordType:"NOTIFICATION_PREFERENCE",recordId:updated.id,newValue:{emailEnabled:updated.emailEnabled,criticalOnly:updated.criticalOnly,categories:updated.categories}});return res.json(updated);});

notificationsRouter.get("/deliveries",requirePermission(PERMISSIONS.NOTIFICATION_VIEW),async(req,res)=>{const items=await prisma.notificationDelivery.findMany({where:{organizationId:req.auth!.organizationId},orderBy:{createdAt:"desc"},take:500});const summary={pending:items.filter(i=>i.status==="PENDING").length,sent:items.filter(i=>i.status==="SENT").length,failed:items.filter(i=>i.status==="FAILED").length,skipped:items.filter(i=>i.status==="SKIPPED").length};return res.json({items,summary});});
notificationsRouter.post("/queue",requirePermission(PERMISSIONS.NOTIFICATION_MANAGE),async(req,res)=>{const queued=await queueOrganizationAlertEmails(req.auth!.organizationId);await audit(req,{action:"QUEUE",recordType:"NOTIFICATION_DELIVERY",recordId:"operational-alerts",newValue:{queued}});return res.json({queued});});
notificationsRouter.post("/dispatch",requirePermission(PERMISSIONS.NOTIFICATION_DISPATCH),async(req,res)=>{const limit=z.object({limit:z.number().int().min(1).max(200).optional()}).parse(req.body).limit;const result=await dispatchPendingNotifications({organizationId:req.auth!.organizationId,limit});await audit(req,{action:"DISPATCH",recordType:"NOTIFICATION_DELIVERY",recordId:"operational-alerts",newValue:result});return res.json(result);});
