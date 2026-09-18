import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lifecycle = readFileSync(new URL("../src/modules/lifecycle/routes.ts", import.meta.url), "utf8");

test("manual lifecycle cost registration requires fresh MFA and locks the vehicle", () => {
  const costs = lifecycle.slice(
    lifecycle.indexOf('lifecycleRouter.post("/costs"'),
    lifecycle.indexOf('lifecycleRouter.get("/disposals"')
  );
  assert.match(costs, /requireFreshMfa,requirePermission\(PERMISSIONS\.LIFECYCLE_COST_MANAGE\)/);
  assert.match(costs, /prisma\.\$transaction\(async tx=>/);
  assert.match(costs, /FROM "Vehicle"/);
  assert.match(costs, /FOR UPDATE/);
  assert.match(costs, /amount:z\.number\(\)\.positive\(\)/);
  assert.match(costs, /vehicle\.status==="DISPOSED"/);
  assert.match(costs, /Lifecycle costs cannot be added to a disposed vehicle/);
  assert.match(costs, /vendor_invalid/);
  assert.match(costs, /VEHICLE_COST/);
});
