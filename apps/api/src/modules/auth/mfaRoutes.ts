import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { verifyAccessToken } from "../../lib/tokens.js";
import { buildOtpAuthUri, encryptMfaSecret, generateMfaSecret } from "../../lib/mfaCrypto.js";
import { getMfaRow, savePendingMfaSecret, verifyAndRecordMfaAttempt, verifyPendingMfaSetup } from "../../lib/mfaStore.js";
import { isPrivilegedRole } from "../../middleware/mfa.js";

export const mfaRouter=Router();
const limiter=rateLimit({windowMs:15*60_000,limit:10,standardHeaders:true,legacyHeaders:false});

async function sessionContext(req:any) {
  const header=req.get("authorization");
  if(!header?.startsWith("Bearer ")) return null;
  try {
    const claims=verifyAccessToken(header.slice(7));
    const session=await prisma.session.findFirst({where:{id:claims.sessionId,userId:claims.sub,revokedAt:null,expiresAt:{gt:new Date()}},include:{user:{include:{roles:{include:{role:true}}}}}});
    if(!session||session.user.status!=="ACTIVE"||session.user.archivedAt||session.user.organizationId!==claims.organizationId) return null;
    return {claims,session};
  } catch { return null; }
}

async function auditMfa(userId:string,organizationId:string,req:any,action:string,reason?:string){
  await prisma.auditLog.create({data:{organizationId,userId,action,recordType:"MFA",recordId:userId,reason:reason??null,ipAddress:req.ip??null,userAgent:req.get("user-agent")??null}});
}

mfaRouter.post("/status",limiter,async(req,res)=>{
  const ctx=await sessionContext(req);
  if(!ctx) return res.status(401).json({error:"Authentication required."});
  const enabled=Boolean((await getMfaRow(ctx.session.user.id))?.enabled);
  return res.json({enabled,required:isPrivilegedRole(ctx.session.user.roles.map(r=>r.role.name))});
});

mfaRouter.post("/setup",limiter,async(req,res)=>{
  const ctx=await sessionContext(req);
  if(!ctx) return res.status(401).json({error:"Authentication required."});
  const input=z.object({currentPassword:z.string().min(8).max(128)}).parse(req.body);
  if(new Date(ctx.session.createdAt).getTime()<Date.now()-15*60_000) return res.status(403).json({error:"Sign in again before enrolling MFA."});
  if(!(await verifyPassword(input.currentPassword,ctx.session.user.passwordHash))) return res.status(400).json({error:"Current password is incorrect."});
  const existing=await getMfaRow(ctx.session.user.id);
  if(existing?.enabled) return res.status(409).json({error:"MFA is already enabled."});
  const secret=generateMfaSecret();
  await savePendingMfaSecret(ctx.session.user.id,encryptMfaSecret(secret));
  await auditMfa(ctx.session.user.id,ctx.session.user.organizationId,req,"MFA_SETUP_STARTED");
  return res.json({secret,otpauthUri:buildOtpAuthUri(ctx.session.user.email,secret)});
});

mfaRouter.post("/confirm",limiter,async(req,res)=>{
  const ctx=await sessionContext(req);
  if(!ctx) return res.status(401).json({error:"Authentication required."});
  const input=z.object({code:z.string().regex(/^\d{6}$/)}).parse(req.body);
  const result=await verifyPendingMfaSetup(ctx.session.user.id,input.code);
  if(!result.ok) return res.status(400).json({error:"The authenticator code is invalid or the setup has expired. Start setup again."});
  await prisma.$executeRaw`INSERT INTO "MfaSession" ("sessionId","verifiedAt") VALUES (${ctx.session.id},CURRENT_TIMESTAMP) ON CONFLICT ("sessionId") DO UPDATE SET "verifiedAt"=CURRENT_TIMESTAMP`;
  await auditMfa(ctx.session.user.id,ctx.session.user.organizationId,req,"MFA_ENABLED");
  return res.json({enabled:true,recoveryCodes:result.recoveryCodes});
});

mfaRouter.post("/verify",limiter,async(req,res)=>{
  const ctx=await sessionContext(req);
  if(!ctx) return res.status(401).json({error:"Authentication required."});
  const input=z.object({code:z.string().min(6).max(20)}).parse(req.body);
  const result=await verifyAndRecordMfaAttempt(ctx.session.user.id,input.code.replace(/\s+/g,"").toUpperCase());
  if(result.locked) return res.status(423).json({error:"MFA is temporarily locked after repeated failed codes."});
  if(!result.ok) return res.status(401).json({error:"Invalid MFA code."});
  await prisma.$executeRaw`INSERT INTO "MfaSession" ("sessionId","verifiedAt") VALUES (${ctx.session.id},CURRENT_TIMESTAMP) ON CONFLICT ("sessionId") DO UPDATE SET "verifiedAt"=CURRENT_TIMESTAMP`;
  await auditMfa(ctx.session.user.id,ctx.session.user.organizationId,req,result.recovery?"MFA_RECOVERY_CODE_USED":"MFA_VERIFIED");
  return res.json({verified:true,recoveryCodeUsed:result.recovery});
});

mfaRouter.post("/logout",limiter,async(req,res)=>{
  const ctx=await sessionContext(req);
  if(!ctx) return res.status(401).json({error:"Authentication required."});
  await prisma.$executeRaw`DELETE FROM "MfaSession" WHERE "sessionId"=${ctx.session.id}`;
  return res.status(204).end();
});
