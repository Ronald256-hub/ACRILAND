import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

const hasDatabase = Boolean(process.env.DATABASE_URL);
test("database prevents simultaneous active assignments for a vehicle", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient(); const suffix = randomUUID().slice(0, 8);
  try {
    const organization = await prisma.organization.create({ data: { name: `Assignment Test ${suffix}`, slug: `assignment-${suffix}` } });
    const user = await prisma.user.create({ data: { organizationId: organization.id, email: `manager-${suffix}@example.test`, fullName: "Test Manager", passwordHash: "test-only" } });
    const vehicle = await prisma.vehicle.create({ data: { organizationId: organization.id, registrationNumber: `T-${suffix}`, vin: `VIN-${suffix}`, make: "Test", model: "Truck", category: "TRUCK", manufacturingYear: 2026, fuelType: "DIESEL" } });
    const driverOne = await prisma.driver.create({ data: { organizationId: organization.id, employeeNumber: `D1-${suffix}`, fullName: "Driver One", licenceNumber: `L1-${suffix}`, licenceClass: "CM", licenceExpiry: new Date("2030-01-01") } });
    const driverTwo = await prisma.driver.create({ data: { organizationId: organization.id, employeeNumber: `D2-${suffix}`, fullName: "Driver Two", licenceNumber: `L2-${suffix}`, licenceClass: "CM", licenceExpiry: new Date("2030-01-01") } });
    await prisma.vehicleAssignment.create({ data: { organizationId: organization.id, vehicleId: vehicle.id, driverId: driverOne.id, assignmentType: "PRIMARY", assignedByUserId: user.id } });
    await assert.rejects(() => prisma.vehicleAssignment.create({ data: { organizationId: organization.id, vehicleId: vehicle.id, driverId: driverTwo.id, assignmentType: "TEMPORARY", assignedByUserId: user.id } }));
  } finally { await prisma.$disconnect(); }
});

test("database rejects a trip ending odometer below its starting odometer", { skip: !hasDatabase }, async () => {
  const { PrismaClient } = await import("@prisma/client"); const prisma = new PrismaClient(); const suffix = randomUUID().slice(0, 8);
  try {
    const organization = await prisma.organization.create({ data: { name: `Trip Test ${suffix}`, slug: `trip-${suffix}` } });
    const user = await prisma.user.create({ data: { organizationId: organization.id, email: `requester-${suffix}@example.test`, fullName: "Trip Requester", passwordHash: "test-only" } });
    await assert.rejects(() => prisma.trip.create({ data: { organizationId: organization.id, tripNumber: `TRP-${suffix}`, requesterUserId: user.id, purpose: "Constraint test", origin: "A", destination: "B", requestedDeparture: new Date("2026-08-14T10:00:00Z"), expectedReturn: new Date("2026-08-14T12:00:00Z"), startingOdometerKm: 1000, endingOdometerKm: 999 } }));
  } finally { await prisma.$disconnect(); }
});
