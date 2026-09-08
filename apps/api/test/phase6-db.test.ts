import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_TEMPLATES } from "../src/domain/permissions.ts";

const hasDatabase=Boolean(process.env.DATABASE_URL);

test("Phase 6 settings permission is seeded",{skip:!hasDatabase},async()=>{
  const{PrismaClient}=await import("@prisma/client");const prisma=new PrismaClient();
  try{const permission=await prisma.permission.findUnique({where:{key:"settings.manage"}});assert.ok(permission);}finally{await prisma.$disconnect();}
});

test("settings management is restricted to administrator governance templates",()=>{
  for(const role of ["SUPER_ADMINISTRATOR","ORGANIZATION_ADMINISTRATOR"]){assert.ok(ROLE_TEMPLATES[role]?.includes("settings.manage"),`${role} should include settings.manage`);}
  for(const role of ["FLEET_MANAGER","DRIVER","FINANCE_OFFICER"]){assert.equal(ROLE_TEMPLATES[role]?.includes("settings.manage"),false,`${role} should not include settings.manage`);}
});
