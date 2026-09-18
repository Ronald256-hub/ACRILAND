import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const vehicles = readFileSync(new URL("../src/modules/vehicles/routes.ts", import.meta.url), "utf8");

test("vehicle state changes require fresh MFA and are serialized by a vehicle row lock", () => {
  const patch = vehicles.slice(vehicles.indexOf('vehiclesRouter.patch("/:id"'), vehicles.indexOf('vehiclesRouter.post("/:id/archive"'));
  assert.match(patch, /requireFreshMfaOnStateChange, requirePermission\(PERMISSIONS\.VEHICLE_EDIT\)/);
  assert.match(patch, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(patch, /FROM "Vehicle"/);
  assert.match(patch, /FOR UPDATE/);
  assert.match(patch, /canTransitionVehicle/);
  assert.match(patch, /A reason is required for this status change/);
  assert.match(patch, /tx\.vehicle\.update/);
});

test("vehicle archive requires fresh MFA and locks the disposed vehicle before archiving", () => {
  const archive = vehicles.slice(vehicles.indexOf('vehiclesRouter.post("/:id/archive"'));
  assert.match(archive, /requireFreshMfa, requirePermission\(PERMISSIONS\.VEHICLE_EDIT\)/);
  assert.match(archive, /prisma\.\$transaction\(async tx=>/);
  assert.match(archive, /FOR UPDATE/);
  assert.match(archive, /current\.status!=="DISPOSED"/);
  assert.match(archive, /archivedAt:new Date\(\)/);
});
