import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { PERMISSION_CATALOG, ROLE_TEMPLATES } from "../src/domain/permissions.js";

const name=process.env.BOOTSTRAP_ORG_NAME??"ACRILAND LTD";
const slug=(process.env.BOOTSTRAP_ORG_SLUG??"acriland").toLowerCase();
const email=process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
if(!email||!password||password.length<12)throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ characters).");

const org=await prisma.organization.upsert({where:{slug},update:{name},create:{name,slug}});
for(const p of PERMISSION_CATALOG)await prisma.permission.upsert({where:{key:p.key},update:{description:p.description},create:p});
for(const [name,keys] of Object.entries(ROLE_TEMPLATES)){
  const role=await prisma.role.upsert({where:{organizationId_name:{organizationId:org.id,name}},update:{isSystem:true},create:{organizationId:org.id,name,isSystem:true,description:`Default ${name.replaceAll("_"," ").toLowerCase()} role`}});
  const perms=await prisma.permission.findMany({where:{key:{in:keys}}});
  await prisma.rolePermission.deleteMany({where:{roleId:role.id}});
  await prisma.rolePermission.createMany({data:perms.map((p)=>({roleId:role.id,permissionId:p.id})),skipDuplicates:true});
}
const superRole=await prisma.role.findUniqueOrThrow({where:{organizationId_name:{organizationId:org.id,name:"SUPER_ADMINISTRATOR"}}});
const admin=await prisma.user.upsert({where:{organizationId_email:{organizationId:org.id,email}},update:{fullName:"ACRILAND Administrator",status:"ACTIVE"},create:{organizationId:org.id,email,fullName:"ACRILAND Administrator",passwordHash:await hashPassword(password),mustChangePassword:true,status:"ACTIVE"}});
await prisma.userRole.upsert({where:{userId_roleId:{userId:admin.id,roleId:superRole.id}},update:{},create:{userId:admin.id,roleId:superRole.id}});
console.log(`Bootstrapped ${org.name} and administrator ${admin.email}`);
await prisma.$disconnect();
