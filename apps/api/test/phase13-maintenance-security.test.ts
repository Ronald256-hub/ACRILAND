import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const maintenance = readFileSync(new URL("../src/modules/maintenance/routes.ts", import.meta.url), "utf8");

test("maintenance approval requires fresh MFA", () => {
  const decision = maintenance.slice(maintenance.indexOf('/:id/decision'), maintenance.indexOf('/:id/start'));
  assert.match(decision, /requireFreshMfa, requirePermission\(PERMISSIONS\.MAINTENANCE_APPROVE\)/);
  assert.match(decision, /FOR UPDATE/);
});

test("maintenance release requires fresh MFA and serializes work-order and vehicle state", () => {
  const release = maintenance.slice(maintenance.indexOf('/:id/release'));
  assert.match(release, /requireFreshMfa, requirePermission\(PERMISSIONS\.MAINTENANCE_RELEASE\)/);
  assert.match(release, /prisma\.\$transaction\(async tx=>/);
  assert.equal((release.match(/FOR UPDATE/g) ?? []).length, 2);
  assert.match(release, /vehicle\.status!=="UNDER_MAINTENANCE"/);
  assert.match(release, /status:"AVAILABLE"/);
  assert.match(release, /status:"CLOSED"/);
});

test("maintenance completion is serialized before moving to release-ready", () => {
  const completion = maintenance.slice(maintenance.indexOf('/:id/complete'), maintenance.indexOf('/:id/release'));
  assert.match(completion, /prisma\.\$transaction\(async tx=>/);
  assert.match(completion, /MaintenanceWorkOrder[\s\S]*FOR UPDATE/);
  assert.match(completion, /status:"READY_FOR_RELEASE"/);
});
