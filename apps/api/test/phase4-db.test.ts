import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const phase4Permissions = [
  "tyre.view","tyre.manage","incident.view","incident.create","incident.manage","inventory.view","inventory.manage",
  "procurement.view","procurement.create","procurement.approve","pm.view","pm.manage","alert.view","alert.manage","telemetry.view","telemetry.ingest"
];

async function fixture(prisma: InstanceType<(typeof import("@prisma/client"))["PrismaClient"]>, label: string) {
  const suffix = randomUUID().slice(0, 8);
  const organization = await prisma.organization.create({ data: { name: `${label} ${suffix}`, slug: `${label.toLowerCase().replaceAll(" ", "-")}-${suffix}` } });
  const user = await prisma.user.create({ data: { organizationId: organization.id, email: `${label.toLowerCase().replaceAll(" ", "-")}-${suffix}@example.test`, fullName: `${label} User`, passwordHash: "test-only" } });
  const vehicle = await prisma.vehicle.create({ data: { organizationId: organization.id, registrationNumber: `P4-${suffix}`, vin: `P4VIN-${suffix}`, make: "Test", model: "Truck", category: "TRUCK", manufacturingYear: 2026, fuelType: "DIESEL", currentOdometerKm: 1000 } });
  return { organization, user, vehicle, suffix };
}

test("Phase 4 permissions are present after migration", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient();
  try {
    const keys = await prisma.permission.findMany({ where: { key: { in: phase4Permissions } }, select: { key: true } });
    assert.deepEqual(new Set(keys.map((item) => item.key)), new Set(phase4Permissions));
  } finally { await prisma.$disconnect(); }
});

test("database prevents two fitted tyres occupying the same vehicle wheel position", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient();
  try {
    const { organization, vehicle, suffix } = await fixture(prisma, "Tyre Position"); const fittedAt = new Date();
    await prisma.tyreAsset.create({ data: { organizationId: organization.id, serialNumber: `TYRE-A-${suffix}`, brand: "Test", size: "315/80R22.5", status: "FITTED", currentVehicleId: vehicle.id, position: "FRONT_LEFT", fittedAt, mileageAtFitKm: 1000 } });
    await assert.rejects(() => prisma.tyreAsset.create({ data: { organizationId: organization.id, serialNumber: `TYRE-B-${suffix}`, brand: "Test", size: "315/80R22.5", status: "FITTED", currentVehicleId: vehicle.id, position: "FRONT_LEFT", fittedAt, mileageAtFitKm: 1000 } }));
  } finally { await prisma.$disconnect(); }
});

test("database enforces maker checker separation for procurement approvals", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient();
  try {
    const { organization, user, suffix } = await fixture(prisma, "Procurement Separation");
    const item = await prisma.inventoryItem.create({ data: { organizationId: organization.id, sku: `SKU-${suffix}`, name: "Brake Pad", category: "BRAKES", quantityOnHand: 0, reorderLevel: 2 } });
    await assert.rejects(() => prisma.procurementRequest.create({ data: { organizationId: organization.id, requestNumber: `PR-${suffix}`, itemId: item.id, requestedQuantity: 4, status: "APPROVED", requestedByUserId: user.id, approvedByUserId: user.id, approvedAt: new Date(), justification: "Replenish workshop stock" } }));
  } finally { await prisma.$disconnect(); }
});

test("database rejects negative inventory quantity", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient();
  try {
    const { organization, suffix } = await fixture(prisma, "Inventory Integrity");
    await assert.rejects(() => prisma.inventoryItem.create({ data: { organizationId: organization.id, sku: `NEG-${suffix}`, name: "Invalid Stock", category: "TEST", quantityOnHand: -1, reorderLevel: 0 } }));
  } finally { await prisma.$disconnect(); }
});

test("database rejects preventive maintenance plan without a time or mileage interval", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient();
  try {
    const { organization, user, vehicle } = await fixture(prisma, "PM Interval");
    await assert.rejects(() => prisma.preventiveMaintenancePlan.create({ data: { organizationId: organization.id, vehicleId: vehicle.id, name: "Invalid interval", createdByUserId: user.id } }));
  } finally { await prisma.$disconnect(); }
});

test("database rejects telemetry outside geographic and fuel bounds", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient();
  try {
    const { organization, vehicle } = await fixture(prisma, "Telemetry Bounds");
    await assert.rejects(() => prisma.telemetrySnapshot.create({ data: { organizationId: organization.id, vehicleId: vehicle.id, provider: "TEST", latitude: 91, longitude: 32.5, fuelPercent: 50, recordedAt: new Date() } }));
    await assert.rejects(() => prisma.telemetrySnapshot.create({ data: { organizationId: organization.id, vehicleId: vehicle.id, provider: "TEST", latitude: 0.3, longitude: 32.5, fuelPercent: 101, recordedAt: new Date() } }));
  } finally { await prisma.$disconnect(); }
});
