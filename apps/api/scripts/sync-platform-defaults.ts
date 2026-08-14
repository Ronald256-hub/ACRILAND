import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { syncPlatformDefaults } from "../src/services/platformDefaults.js";

const organizations = await prisma.organization.findMany({ where: { isActive: true }, select: { id: true, name: true } });
for (const organization of organizations) {
  await syncPlatformDefaults(organization.id);
  console.log(`Synchronized RBAC and fleet defaults for ${organization.name}`);
}
await prisma.$disconnect();
