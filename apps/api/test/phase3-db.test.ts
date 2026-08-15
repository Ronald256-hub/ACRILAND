import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

const hasDatabase = Boolean(process.env.DATABASE_URL);

test("Phase 3 permissions are present after migration", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient();
  try {
    const keys = await prisma.permission.findMany({ where: { key: { in: ["maintenance.view","fuel.view","compliance.view","report.view"] } }, select: { key: true } });
    assert.deepEqual(new Set(keys.map((item) => item.key)), new Set(["maintenance.view","fuel.view","compliance.view","report.view"]));
  } finally { await prisma.$disconnect(); }
});

test("database prevents simultaneous active workshop orders for one vehicle", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient(); const suffix = randomUUID().slice(0, 8);
  try {
    const organization = await prisma.organization.create({ data: { name: `Workshop Test ${suffix}`, slug: `workshop-${suffix}` } });
    const user = await prisma.user.create({ data: { organizationId: organization.id, email: `workshop-${suffix}@example.test`, fullName: "Workshop Manager", passwordHash: "test-only" } });
    const vehicle = await prisma.vehicle.create({ data: { organizationId: organization.id, registrationNumber: `W-${suffix}`, vin: `WVIN-${suffix}`, make: "Test", model: "Truck", category: "TRUCK", manufacturingYear: 2026, fuelType: "DIESEL" } });
    await prisma.maintenanceWorkOrder.create({ data: { organizationId: organization.id, workOrderNumber: `WO-1-${suffix}`, vehicleId: vehicle.id, openedByUserId: user.id, category: "BRAKES", title: "Brake repair", description: "Workshop control test", odometerKm: 1000 } });
    await assert.rejects(() => prisma.maintenanceWorkOrder.create({ data: { organizationId: organization.id, workOrderNumber: `WO-2-${suffix}`, vehicleId: vehicle.id, openedByUserId: user.id, category: "SERVICE", title: "Duplicate workshop order", description: "Must be rejected by partial unique index", odometerKm: 1000 } }));
  } finally { await prisma.$disconnect(); }
});

test("database rejects non-positive fuel quantities", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient(); const suffix = randomUUID().slice(0, 8);
  try {
    const organization = await prisma.organization.create({ data: { name: `Fuel Test ${suffix}`, slug: `fuel-${suffix}` } });
    const user = await prisma.user.create({ data: { organizationId: organization.id, email: `fuel-${suffix}@example.test`, fullName: "Fuel Requester", passwordHash: "test-only" } });
    const vehicle = await prisma.vehicle.create({ data: { organizationId: organization.id, registrationNumber: `F-${suffix}`, vin: `FVIN-${suffix}`, make: "Test", model: "Truck", category: "TRUCK", manufacturingYear: 2026, fuelType: "DIESEL" } });
    await assert.rejects(() => prisma.fuelTransaction.create({ data: { organizationId: organization.id, requestNumber: `FUEL-${suffix}`, vehicleId: vehicle.id, requestedByUserId: user.id, fuelType: "DIESEL", requestedLitres: 0, odometerKm: 1000 } }));
  } finally { await prisma.$disconnect(); }
});

test("database rejects compliance expiry before issue date", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient(); const suffix = randomUUID().slice(0, 8);
  try {
    const organization = await prisma.organization.create({ data: { name: `Compliance Test ${suffix}`, slug: `compliance-${suffix}` } });
    const user = await prisma.user.create({ data: { organizationId: organization.id, email: `compliance-${suffix}@example.test`, fullName: "Compliance Manager", passwordHash: "test-only" } });
    const vehicle = await prisma.vehicle.create({ data: { organizationId: organization.id, registrationNumber: `C-${suffix}`, vin: `CVIN-${suffix}`, make: "Test", model: "Truck", category: "TRUCK", manufacturingYear: 2026, fuelType: "DIESEL" } });
    await assert.rejects(() => prisma.complianceDocument.create({ data: { organizationId: organization.id, vehicleId: vehicle.id, type: "INSURANCE", referenceNumber: `POL-${suffix}`, issueDate: new Date("2027-01-01T00:00:00Z"), expiryDate: new Date("2026-12-31T00:00:00Z"), createdByUserId: user.id } }));
  } finally { await prisma.$disconnect(); }
});
