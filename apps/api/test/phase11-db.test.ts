import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const hasDatabase = Boolean(process.env.DATABASE_URL);

test("Phase 11 health policy columns and permission are deployed", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Organization'
        AND column_name IN ('healthCriticalAckMinutes','healthAttentionAckHours','healthFreshnessHours','healthRepeatWindowDays')`;
    assert.equal(columns.length, 4);
    assert.equal(await prisma.permission.count({ where: { key: "health.intelligence.view" } }), 1);
  } finally { await prisma.$disconnect(); }
});

test("Phase 11 health policy constraints reject unsafe configuration", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const id = randomUUID();
  try {
    await prisma.$executeRaw`INSERT INTO "Organization"("id","name","slug","createdAt","updatedAt") VALUES (${id}::uuid,'Phase11 Policy Org',${`p11-${id}`},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
    const row = await prisma.organization.findUniqueOrThrow({ where: { id }, select: { healthCriticalAckMinutes: true, healthAttentionAckHours: true, healthFreshnessHours: true, healthRepeatWindowDays: true } });
    assert.deepEqual(row, { healthCriticalAckMinutes: 30, healthAttentionAckHours: 8, healthFreshnessHours: 24, healthRepeatWindowDays: 30 });
    await assert.rejects(() => prisma.$executeRaw`UPDATE "Organization" SET "healthCriticalAckMinutes"=4 WHERE "id"=${id}::uuid`);
    await assert.rejects(() => prisma.$executeRaw`UPDATE "Organization" SET "healthRepeatWindowDays"=6 WHERE "id"=${id}::uuid`);
  } finally {
    await prisma.organization.deleteMany({ where: { id } });
    await prisma.$disconnect();
  }
});

test("Prisma schema exposes Phase 10 vehicle health and evidence fields", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.vehicle.findMany({ take: 1, select: { id: true, healthState: true, healthUpdatedAt: true, healthSourceInspectionId: true } });
    await prisma.vehicleInspection.findMany({ take: 1, select: { id: true, loadState: true, vehicleBehavior: true, repairRequest: true, driverCanContinue: true, healthState: true, managerStatus: true, acknowledgedAt: true, resolvedAt: true, workOrderId: true, _count: { select: { evidence: true } } } });
    await prisma.inspectionEvidence.findMany({ take: 1, select: { id: true, inspectionId: true, mimeType: true, sizeBytes: true } });
    assert.ok(true);
  } finally { await prisma.$disconnect(); }
});
