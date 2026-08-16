import assert from "node:assert/strict";
import test from "node:test";

const hasDatabase=Boolean(process.env.DATABASE_URL);

test("Phase 6 settings permission is seeded and mapped to fleet governance roles",{skip:!hasDatabase},async()=>{
  const{PrismaClient}=await import("@prisma/client");const prisma=new PrismaClient();
  try{
    const permission=await prisma.permission.findUnique({where:{key:"settings.manage"}});assert.ok(permission);
    const roles=await prisma.role.findMany({where:{name:{in:["SUPER_ADMINISTRATOR","ORGANIZATION_ADMINISTRATOR","FLEET_MANAGER"]},permissions:{some:{permissionId:permission.id}}},select:{name:true}});
    assert.deepEqual(new Set(roles.map(row=>row.name)),new Set(["SUPER_ADMINISTRATOR","ORGANIZATION_ADMINISTRATOR","FLEET_MANAGER"]));
  }finally{await prisma.$disconnect();}
});
