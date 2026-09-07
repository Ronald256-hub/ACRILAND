import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { hashOpaqueToken } from "./tokens.js";
import { decryptMfaSecret, generateRecoveryCodes, verifyTotp } from "./mfaCrypto.js";
import { matchingTotpStep } from "./mfaTotp.js";

type MfaRow = { userId:string; secretEncrypted:string|null; enabled:boolean; confirmedAt:Date|null; failedAttempts:number; lockedUntil:Date|null; lastTotpStep:bigint|null; setupExpiresAt:Date|null };
type RecoveryRow = { id:string; codeHash:string; usedAt:Date|null };
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;
const SETUP_TTL_MS = 10 * 60_000;

function safeEqual(a:string,b:string):boolean { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && crypto.timingSafeEqual(x,y); }

export async function getMfaRow(userId:string):Promise<MfaRow|null> {
  const rows=await prisma.$queryRaw<MfaRow[]>`SELECT "userId","secretEncrypted","enabled","confirmedAt","failedAttempts","lockedUntil","lastTotpStep","setupExpiresAt" FROM "UserMfa" WHERE "userId"=${userId} LIMIT 1`;
  return rows[0]??null;
}

export async function savePendingMfaSecret(userId:string,encryptedSecret:string):Promise<void> {
  await prisma.$executeRaw`INSERT INTO "UserMfa" ("userId","secretEncrypted","enabled","confirmedAt","failedAttempts","lockedUntil","lastTotpStep","setupExpiresAt","createdAt","updatedAt") VALUES (${userId},${encryptedSecret},FALSE,NULL,0,NULL,NULL,${new Date(Date.now()+SETUP_TTL_MS)},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("userId") DO UPDATE SET "secretEncrypted"=EXCLUDED."secretEncrypted","enabled"=FALSE,"confirmedAt"=NULL,"failedAttempts"=0,"lockedUntil"=NULL,"lastTotpStep"=NULL,"setupExpiresAt"=EXCLUDED."setupExpiresAt","updatedAt"=CURRENT_TIMESTAMP`;
}

export async function verifyPendingMfaSetup(userId:string,code:string):Promise<{ok:boolean;recoveryCodes:string[]}> {
  return prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<MfaRow[]>`SELECT "userId","secretEncrypted","enabled","confirmedAt","failedAttempts","lockedUntil","lastTotpStep","setupExpiresAt" FROM "UserMfa" WHERE "userId"=${userId} FOR UPDATE`;
    const row=rows[0];
    if(!row?.secretEncrypted || row.enabled || !row.setupExpiresAt || row.setupExpiresAt<=new Date() || !verifyTotp(decryptMfaSecret(row.secretEncrypted),code)) return {ok:false,recoveryCodes:[]};
    const recoveryCodes=generateRecoveryCodes();
    await tx.$executeRaw`UPDATE "UserMfa" SET "enabled"=TRUE,"confirmedAt"=CURRENT_TIMESTAMP,"failedAttempts"=0,"lockedUntil"=NULL,"lastTotpStep"=NULL,"setupExpiresAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=${userId}`;
    await tx.$executeRaw`DELETE FROM "MfaRecoveryCode" WHERE "userId"=${userId}`;
    for(const recoveryCode of recoveryCodes) await tx.$executeRaw`INSERT INTO "MfaRecoveryCode" ("id","userId","codeHash","createdAt") VALUES (${crypto.randomUUID()},${userId},${hashOpaqueToken(recoveryCode)},CURRENT_TIMESTAMP)`;
    return {ok:true,recoveryCodes};
  });
}

export async function verifyAndRecordMfaAttempt(userId:string,code:string):Promise<{ok:boolean;locked:boolean;recovery:boolean}> {
  return prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<MfaRow[]>`SELECT "userId","secretEncrypted","enabled","confirmedAt","failedAttempts","lockedUntil","lastTotpStep","setupExpiresAt" FROM "UserMfa" WHERE "userId"=${userId} FOR UPDATE`;
    const row=rows[0];
    if(!row?.enabled || !row.secretEncrypted) return {ok:false,locked:false,recovery:false};
    if(row.lockedUntil && row.lockedUntil>new Date()) return {ok:false,locked:true,recovery:false};
    const secret=decryptMfaSecret(row.secretEncrypted);
    const matchedStep=matchingTotpStep(secret,code);
    if(matchedStep!==null) {
      if(row.lastTotpStep!==null && BigInt(matchedStep)<=row.lastTotpStep) return {ok:false,locked:false,recovery:false};
      await tx.$executeRaw`UPDATE "UserMfa" SET "failedAttempts"=0,"lockedUntil"=NULL,"lastTotpStep"=${BigInt(matchedStep)},"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=${userId}`;
      return {ok:true,locked:false,recovery:false};
    }
    const recoveryRows=await tx.$queryRaw<RecoveryRow[]>`SELECT "id","codeHash","usedAt" FROM "MfaRecoveryCode" WHERE "userId"=${userId} AND "usedAt" IS NULL`;
    const rawCode=code.replace(/[\s-]+/g,"").toUpperCase();
    const matching=recoveryRows.find(candidate=>safeEqual(candidate.codeHash,hashOpaqueToken(code))||safeEqual(candidate.codeHash,hashOpaqueToken(rawCode)));
    if(matching) {
      const changed=await tx.$executeRaw`UPDATE "MfaRecoveryCode" SET "usedAt"=CURRENT_TIMESTAMP WHERE "id"=${matching.id} AND "usedAt" IS NULL`;
      if(changed!==1) return {ok:false,locked:false,recovery:false};
      await tx.$executeRaw`UPDATE "UserMfa" SET "failedAttempts"=0,"lockedUntil"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=${userId}`;
      return {ok:true,locked:false,recovery:true};
    }
    const failed=row.failedAttempts+1;
    const lockedUntil=failed>=MAX_FAILED?new Date(Date.now()+LOCK_MS):null;
    await tx.$executeRaw`UPDATE "UserMfa" SET "failedAttempts"=${lockedUntil?0:failed},"lockedUntil"=${lockedUntil},"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=${userId}`;
    return {ok:false,locked:Boolean(lockedUntil),recovery:false};
  });
}

export async function revokeMfa(userId:string):Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "MfaRecoveryCode" WHERE "userId"=${userId}`,
    prisma.$executeRaw`DELETE FROM "UserMfa" WHERE "userId"=${userId}`
  ]);
}
