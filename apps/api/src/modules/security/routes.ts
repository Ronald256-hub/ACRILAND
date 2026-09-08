import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { requirePermission } from "../../middleware/authorize.js";

export const securityRouter=Router();

securityRouter.get("/summary",requirePermission(PERMISSIONS.AUDIT_VIEW),async(req,res)=>{
  const organizationId=req.auth!.organizationId;
  const since=new Date(Date.now()-24*60*60*1000);
  const [counts,recent,loginCounts]=await Promise.all([
    prisma.$queryRaw<Array<{severity:string;count:bigint}>>(Prisma.sql`SELECT "severity",COUNT(*)::bigint AS count FROM "SecurityEvent" WHERE "organizationId"=${organizationId}::uuid AND "createdAt">=${since} GROUP BY "severity"`),
    prisma.$queryRaw<Array<{id:string;eventType:string;severity:string;action:string;recordType:string|null;recordId:string|null;reason:string|null;ipAddress:string|null;createdAt:Date}>>(Prisma.sql`SELECT "id","eventType","severity","action","recordType","recordId","reason","ipAddress","createdAt" FROM "SecurityEvent" WHERE "organizationId"=${organizationId}::uuid ORDER BY "createdAt" DESC LIMIT 50`),
    prisma.$queryRaw<Array<{reason:string|null;count:bigint}>>(Prisma.sql`SELECT "reason",COUNT(*)::bigint AS count FROM "LoginEvent" WHERE "organizationId"=${organizationId}::uuid AND "createdAt">=${since} AND "success"=false GROUP BY "reason" ORDER BY count DESC`)
  ]);
  const bySeverity=Object.fromEntries(counts.map(x=>[x.severity,Number(x.count)]));
  const failedLogins=loginCounts.reduce((n,x)=>n+Number(x.count),0);
  return res.json({windowHours:24,totals:{events24h:counts.reduce((n,x)=>n+Number(x.count),0),info:bySeverity.INFO??0,warning:bySeverity.WARNING??0,high:bySeverity.HIGH??0,critical:bySeverity.CRITICAL??0,failedLogins24h:failedLogins},failedLoginsByReason:loginCounts.map(x=>({reason:x.reason,count:Number(x.count)})),recent});
});

securityRouter.get("/events",requirePermission(PERMISSIONS.AUDIT_VIEW),async(req,res)=>{
  const organizationId=req.auth!.organizationId;
  const limit=Math.min(Math.max(Number(req.query.limit??50)||50,1),200);
  const severity=typeof req.query.severity==="string"?req.query.severity.toUpperCase():null;
  const eventType=typeof req.query.eventType==="string"?req.query.eventType:null;
  const rows=await prisma.$queryRaw<Array<{id:string;userId:string|null;eventType:string;severity:string;action:string;recordType:string|null;recordId:string|null;reason:string|null;ipAddress:string|null;userAgent:string|null;metadata:unknown;createdAt:Date}>>(Prisma.sql`SELECT "id","userId","eventType","severity","action","recordType","recordId","reason","ipAddress","userAgent","metadata","createdAt" FROM "SecurityEvent" WHERE "organizationId"=${organizationId}::uuid AND (${severity} IS NULL OR "severity"=${severity}::"SecurityEventSeverity") AND (${eventType} IS NULL OR "eventType"=${eventType}) ORDER BY "createdAt" DESC LIMIT ${limit}`);
  return res.json({items:rows});
});
