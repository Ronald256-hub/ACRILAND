import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { sendOperationalNotification } from "./mailer.js";

function categoryAllowed(categories:unknown,category:string):boolean{if(!Array.isArray(categories)||categories.length===0)return true;return categories.some(value=>typeof value==="string"&&value===category);}

export async function queueOrganizationAlertEmails(organizationId:string):Promise<number>{
  const preferences=await prisma.notificationPreference.findMany({where:{organizationId,emailEnabled:true}});if(!preferences.length)return 0;const userIds=preferences.map(p=>p.userId);const users=await prisma.user.findMany({where:{organizationId,id:{in:userIds},status:"ACTIVE",archivedAt:null,roles:{some:{role:{permissions:{some:{permission:{key:"alert.view"}}}}}}},select:{id:true,email:true,fullName:true}});const userMap=new Map(users.map(u=>[u.id,u]));const alerts=await prisma.operationalAlert.findMany({where:{organizationId,status:{in:["OPEN","ACKNOWLEDGED"]}},orderBy:[{severity:"desc"},{createdAt:"desc"}],take:500});let queued=0;
  for(const preference of preferences){const user=userMap.get(preference.userId);if(!user)continue;for(const alert of alerts){if(preference.criticalOnly&&alert.severity!=="CRITICAL")continue;if(!categoryAllowed(preference.categories,alert.category))continue;const dedupeKey=`${alert.id}:${user.id}:EMAIL`;try{await prisma.notificationDelivery.create({data:{organizationId,alertId:alert.id,userId:user.id,channel:"EMAIL",destination:user.email,subject:`[${alert.severity}] ${alert.title}`,body:`Hello ${user.fullName},\n\n${alert.message}\n\nCategory: ${alert.category}\nStatus: ${alert.status}\n\nACRILAND Fleet Command Centre`,status:"PENDING",dedupeKey}});queued++;}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")continue;throw error;}}}
  return queued;
}

export async function dispatchPendingNotifications(options?:{organizationId?:string;limit?:number}):Promise<{sent:number;failed:number;skipped:number}>{
  const scope=options?.organizationId?{organizationId:options.organizationId}:{};const limit=Math.max(1,Math.min(200,options?.limit??50));const staleBefore=new Date(Date.now()-15*60_000);
  await prisma.notificationDelivery.updateMany({where:{...scope,status:"PROCESSING",lastAttemptAt:{lt:staleBefore}},data:{status:"FAILED",errorMessage:"Previous delivery claim expired before completion."}});
  const deliveries=await prisma.notificationDelivery.findMany({where:{...scope,status:{in:["PENDING","FAILED"]},attempts:{lt:3}},orderBy:{createdAt:"asc"},take:limit});let sent=0,failed=0,skipped=0;
  for(const delivery of deliveries){const claimedAt=new Date();const claim=await prisma.notificationDelivery.updateMany({where:{id:delivery.id,status:delivery.status,attempts:delivery.attempts},data:{status:"PROCESSING",attempts:{increment:1},lastAttemptAt:claimedAt,errorMessage:null}});if(claim.count!==1)continue;if(delivery.channel!=="EMAIL"){await prisma.notificationDelivery.update({where:{id:delivery.id},data:{status:"SKIPPED",errorMessage:"Channel delivery is not configured."}});skipped++;continue;}try{await sendOperationalNotification(delivery.destination,delivery.subject,delivery.body);await prisma.notificationDelivery.update({where:{id:delivery.id},data:{status:"SENT",sentAt:new Date(),errorMessage:null}});sent++;}catch(error){await prisma.notificationDelivery.update({where:{id:delivery.id},data:{status:"FAILED",errorMessage:error instanceof Error?error.message:"Notification delivery failed."}});failed++;}}
  return{sent,failed,skipped};
}

export async function runAllOperationalNotifications():Promise<{queued:number;sent:number;failed:number;skipped:number}>{const organizations=await prisma.organization.findMany({where:{isActive:true},select:{id:true}});let queued=0;for(const organization of organizations)queued+=await queueOrganizationAlertEmails(organization.id);const result=await dispatchPendingNotifications({limit:200});return{queued,...result};}
