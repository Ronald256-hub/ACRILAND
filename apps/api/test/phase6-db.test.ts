import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_TEMPLATES } from "../src/domain/permissions.ts";

const hasDatabase=Boolean(process.env.DATABASE_URL);

test("Phase 6 settings permission is seeded",{skip:!hasDatabase},async()=>{
  const{PrismaClient}=await import("@prisma/client");const prisma=new PrismaClient();
  try{const permission=await prisma.permission.findUnique({where:{key:"settings.manage"}});assert.ok(permission);}finally{await prisma.$disconnect();}
});

test("Phase 6 settings permission is mapped in governance role templates",()=>{
  for(const role of ["SUPER_ADMINISTRATOR","ORGANIZATION_ADMINISTRATOR","FLEET_MANAGER"]){assert.ok(ROLE_TEMPLATES[role]?.includes("settings.manage"),`${role} should include settings.manage`);}
  assert.equal(ROLE_TEMPLATES.DRIVER?.includes("settings.manage"),false);
  assert.equal(ROLE_TEMPLATES.FINANCE_OFFICER?.includes("settings.manage"),false);
});
