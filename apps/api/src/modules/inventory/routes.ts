import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { assertDifferentApprover, BusinessRuleError } from "../../domain/rules.js";
import { requirePermission } from "../../middleware/authorize.js";

export const inventoryRouter = Router();
function routeId(value:string|string[]|undefined):string|null{return typeof value==="string"?value:null;}
function requestNumber():string{const day=new Date().toISOString().slice(0,10).replaceAll("-","");return `PR-${day}-${randomUUID().slice(0,8).toUpperCase()}`;}
const n=(value:unknown)=>Number(value??0);

inventoryRouter.get("/items",requirePermission(PERMISSIONS.INVENTORY_VIEW),async(req,res)=>{
  const items=await prisma.inventoryItem.findMany({where:{organizationId:req.auth!.organizationId,isActive:true},orderBy:{name:"asc"},take:500});
  return res.json({items:items.map(item=>({...item,lowStock:n(item.quantityOnHand)<=n(item.reorderLevel),stockValue:n(item.quantityOnHand)*n(item.unitCost)}))});
});

inventoryRouter.post("/items",requirePermission(PERMISSIONS.INVENTORY_MANAGE),async(req,res)=>{
  const input=z.object({sku:z.string().min(2).max(80),name:z.string().min(2).max(200),category:z.string().min(2).max(120),unit:z.string().min(1).max(20).default("EA"),openingQuantity:z.number().min(0).default(0),reorderLevel:z.number().min(0).default(0),unitCost:z.number().min(0).optional(),preferredSupplier:z.string().max(200).optional()}).parse(req.body);
  const created=await prisma.$transaction(async tx=>{const item=await tx.inventoryItem.create({data:{organizationId:req.auth!.organizationId,sku:input.sku.trim().toUpperCase(),name:input.name.trim(),category:input.category.trim(),unit:input.unit.trim().toUpperCase(),quantityOnHand:input.openingQuantity,reorderLevel:input.reorderLevel,unitCost:input.unitCost??null,preferredSupplier:input.preferredSupplier??null}});if(input.openingQuantity>0)await tx.stockMovement.create({data:{organizationId:req.auth!.organizationId,itemId:item.id,type:"RECEIPT",quantity:input.openingQuantity,unitCost:input.unitCost??null,reference:"OPENING_STOCK",performedByUserId:req.auth!.userId}});return item;});
  await audit(req,{action:"CREATE",recordType:"INVENTORY_ITEM",recordId:created.id,newValue:created});return res.status(201).json(created);
});

inventoryRouter.patch("/items/:id",requirePermission(PERMISSIONS.INVENTORY_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid inventory item id."});const input=z.object({name:z.string().min(2).max(200).optional(),category:z.string().min(2).max(120).optional(),unit:z.string().min(1).max(20).optional(),reorderLevel:z.number().min(0).optional(),unitCost:z.number().min(0).nullable().optional(),preferredSupplier:z.string().max(200).nullable().optional(),isActive:z.boolean().optional()}).parse(req.body);const row=await prisma.inventoryItem.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Inventory item not found."});
  const data:Prisma.InventoryItemUncheckedUpdateInput={};if(input.name!==undefined)data.name=input.name;if(input.category!==undefined)data.category=input.category;if(input.unit!==undefined)data.unit=input.unit;if(input.reorderLevel!==undefined)data.reorderLevel=input.reorderLevel;if(input.unitCost!==undefined)data.unitCost=input.unitCost;if(input.preferredSupplier!==undefined)data.preferredSupplier=input.preferredSupplier;if(input.isActive!==undefined)data.isActive=input.isActive;
  const updated=await prisma.inventoryItem.update({where:{id:row.id},data});await audit(req,{action:"UPDATE",recordType:"INVENTORY_ITEM",recordId:row.id,oldValue:row,newValue:updated});return res.json(updated);
});

inventoryRouter.post("/items/:id/movements",requirePermission(PERMISSIONS.INVENTORY_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid inventory item id."});const input=z.object({type:z.enum(["RECEIPT","ISSUE","RETURN"]),quantity:z.number().positive(),unitCost:z.number().min(0).optional(),reference:z.string().max(150).optional(),workOrderId:z.string().uuid().optional(),notes:z.string().max(1000).optional()}).parse(req.body);const item=await prisma.inventoryItem.findFirst({where:{id,organizationId:req.auth!.organizationId,isActive:true}});if(!item)return res.status(404).json({error:"Inventory item not found."});if(input.workOrderId){const order=await prisma.maintenanceWorkOrder.findFirst({where:{id:input.workOrderId,organizationId:req.auth!.organizationId},select:{id:true}});if(!order)return res.status(400).json({error:"Work order does not belong to this organization."});}
  if(input.type==="ISSUE"&&n(item.quantityOnHand)<input.quantity)return res.status(409).json({error:"Stock issue exceeds quantity on hand."});
  const result=await prisma.$transaction(async tx=>{
    let updated;
    if(input.type==="ISSUE"){
      const changed=await tx.inventoryItem.updateMany({where:{id:item.id,organizationId:req.auth!.organizationId,isActive:true,quantityOnHand:{gte:input.quantity}},data:{quantityOnHand:{decrement:input.quantity}}});
      if(changed.count!==1)throw new BusinessRuleError("Stock issue exceeds quantity on hand.",409);
      updated=await tx.inventoryItem.findUniqueOrThrow({where:{id:item.id}});
    }else{
      updated=await tx.inventoryItem.update({where:{id:item.id},data:{quantityOnHand:{increment:input.quantity},...(input.type==="RECEIPT"&&input.unitCost!==undefined?{unitCost:input.unitCost}:{})}});
    }
    const movement=await tx.stockMovement.create({data:{organizationId:req.auth!.organizationId,itemId:item.id,type:input.type,quantity:input.quantity,unitCost:input.unitCost??item.unitCost,reference:input.reference??null,workOrderId:input.workOrderId??null,performedByUserId:req.auth!.userId,notes:input.notes??null}});
    if(n(updated.quantityOnHand)>n(updated.reorderLevel))await tx.operationalAlert.updateMany({where:{organizationId:req.auth!.organizationId,sourceType:"INVENTORY_ITEM",sourceId:item.id,category:"LOW_STOCK",status:{not:"CLOSED"}},data:{status:"CLOSED",closedAt:new Date()}});
    return{movement,item:updated};
  });
  await audit(req,{action:input.type,recordType:"STOCK_MOVEMENT",recordId:result.movement.id,newValue:{itemId:item.id,quantity:input.quantity,quantityOnHand:result.item.quantityOnHand}});return res.status(201).json(result);
});

inventoryRouter.get("/procurement",requirePermission(PERMISSIONS.PROCUREMENT_VIEW),async(req,res)=>{
  const items=await prisma.procurementRequest.findMany({where:{organizationId:req.auth!.organizationId},orderBy:{createdAt:"desc"},take:300});const itemIds=[...new Set(items.map(i=>i.itemId))];const stock=itemIds.length?await prisma.inventoryItem.findMany({where:{id:{in:itemIds}},select:{id:true,sku:true,name:true,unit:true,quantityOnHand:true,reorderLevel:true,unitCost:true,preferredSupplier:true}}):[];const map=new Map(stock.map(i=>[i.id,i]));return res.json({items:items.map(row=>({...row,item:map.get(row.itemId)??null}))});
});

inventoryRouter.post("/procurement",requirePermission(PERMISSIONS.PROCUREMENT_CREATE),async(req,res)=>{
  const input=z.object({itemId:z.string().uuid(),requestedQuantity:z.number().positive(),neededBy:z.coerce.date().optional(),justification:z.string().min(5).max(2000),supplier:z.string().max(200).optional()}).parse(req.body);const item=await prisma.inventoryItem.findFirst({where:{id:input.itemId,organizationId:req.auth!.organizationId,isActive:true}});if(!item)return res.status(404).json({error:"Inventory item not found."});const created=await prisma.procurementRequest.create({data:{organizationId:req.auth!.organizationId,requestNumber:requestNumber(),itemId:item.id,requestedQuantity:input.requestedQuantity,status:"REQUESTED",requestedByUserId:req.auth!.userId,supplier:input.supplier??item.preferredSupplier,neededBy:input.neededBy??null,justification:input.justification}});await audit(req,{action:"CREATE",recordType:"PROCUREMENT_REQUEST",recordId:created.id,newValue:created});return res.status(201).json(created);
});

inventoryRouter.post("/procurement/:id/decision",requirePermission(PERMISSIONS.PROCUREMENT_APPROVE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid procurement request id."});const input=z.object({decision:z.enum(["APPROVED","REJECTED"]),comments:z.string().max(1500).optional()}).parse(req.body);const row=await prisma.procurementRequest.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Procurement request not found."});if(row.status!=="REQUESTED")return res.status(409).json({error:"Only requested procurement can be approved or rejected."});assertDifferentApprover(row.requestedByUserId,req.auth!.userId);if(input.decision==="REJECTED"&&!input.comments)return res.status(400).json({error:"A rejection reason is required."});const updated=await prisma.procurementRequest.update({where:{id:row.id},data:input.decision==="APPROVED"?{status:"APPROVED",approvedByUserId:req.auth!.userId,approvedAt:new Date(),rejectionReason:null}:{status:"REJECTED",approvedByUserId:req.auth!.userId,approvedAt:new Date(),rejectionReason:input.comments??"Rejected"}});await audit(req,{action:input.decision==="APPROVED"?"APPROVE":"REJECT",recordType:"PROCUREMENT_REQUEST",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status},...(input.comments?{reason:input.comments}:{})});return res.json(updated);
});

inventoryRouter.post("/procurement/:id/order",requirePermission(PERMISSIONS.PROCUREMENT_APPROVE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid procurement request id."});const input=z.object({supplier:z.string().min(2).max(200),unitPrice:z.number().min(0)}).parse(req.body);const row=await prisma.procurementRequest.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Procurement request not found."});if(row.status!=="APPROVED")return res.status(409).json({error:"Procurement must be approved before ordering."});const total=n(row.requestedQuantity)*input.unitPrice;const updated=await prisma.procurementRequest.update({where:{id:row.id},data:{status:"ORDERED",supplier:input.supplier,unitPrice:input.unitPrice,totalCost:total,orderedAt:new Date()}});await audit(req,{action:"ORDER",recordType:"PROCUREMENT_REQUEST",recordId:row.id,oldValue:{status:row.status},newValue:{status:updated.status,totalCost:updated.totalCost}});return res.json(updated);
});

inventoryRouter.post("/procurement/:id/receive",requirePermission(PERMISSIONS.INVENTORY_MANAGE),async(req,res)=>{
  const id=routeId(req.params.id);if(!id)return res.status(400).json({error:"Invalid procurement request id."});const input=z.object({reference:z.string().max(150).optional(),notes:z.string().max(1000).optional()}).parse(req.body);const row=await prisma.procurementRequest.findFirst({where:{id,organizationId:req.auth!.organizationId}});if(!row)return res.status(404).json({error:"Procurement request not found."});if(row.status!=="ORDERED")return res.status(409).json({error:"Only an ordered procurement request can be received."});const item=await prisma.inventoryItem.findFirst({where:{id:row.itemId,organizationId:req.auth!.organizationId,isActive:true}});if(!item)return res.status(404).json({error:"Inventory item not found."});const qty=n(row.requestedQuantity);
  const result=await prisma.$transaction(async tx=>{const updatedItem=await tx.inventoryItem.update({where:{id:item.id},data:{quantityOnHand:{increment:qty},...(row.unitPrice!==null?{unitCost:row.unitPrice}:{})}});const movement=await tx.stockMovement.create({data:{organizationId:req.auth!.organizationId,itemId:item.id,type:"RECEIPT",quantity:qty,unitCost:row.unitPrice,reference:input.reference??row.requestNumber,performedByUserId:req.auth!.userId,notes:input.notes??null}});const procurement=await tx.procurementRequest.update({where:{id:row.id},data:{status:"RECEIVED",receivedAt:new Date()}});if(n(updatedItem.quantityOnHand)>n(updatedItem.reorderLevel))await tx.operationalAlert.updateMany({where:{organizationId:req.auth!.organizationId,sourceType:"INVENTORY_ITEM",sourceId:item.id,category:"LOW_STOCK",status:{not:"CLOSED"}},data:{status:"CLOSED",closedAt:new Date()}});return{item:updatedItem,movement,procurement};});
  await audit(req,{action:"RECEIVE",recordType:"PROCUREMENT_REQUEST",recordId:row.id,oldValue:{status:row.status},newValue:{status:result.procurement.status,quantityOnHand:result.item.quantityOnHand}});return res.json(result);
});
