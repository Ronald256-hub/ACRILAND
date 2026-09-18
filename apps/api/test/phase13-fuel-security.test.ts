import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fuel = readFileSync(new URL("../src/modules/fuel/routes.ts", import.meta.url), "utf8");

test("fuel approval is protected by fresh MFA and a row lock", () => {
  const decision = fuel.slice(
    fuel.indexOf('fuelRouter.post("/:id/decision"'),
    fuel.indexOf('fuelRouter.post("/:id/issue"')
  );
  assert.match(decision, /requireFreshMfa,requirePermission\(PERMISSIONS\.FUEL_APPROVE\)/);
  assert.match(decision, /prisma\.\$transaction\(async tx=>/);
  assert.match(decision, /FROM "FuelTransaction"/);
  assert.match(decision, /FOR UPDATE/);
  assert.match(decision, /requestedByUserId===req\.auth!\.userId/);
  assert.match(decision, /status!=="REQUESTED"/);
});

test("fuel issuance locks both the transaction and vehicle and cannot over-issue", () => {
  const issue = fuel.slice(fuel.indexOf('fuelRouter.post("/:id/issue"'));
  assert.match(issue, /requireFreshMfa,requirePermission\(PERMISSIONS\.FUEL_APPROVE\)/);
  assert.match(issue, /prisma\.\$transaction\(async tx=>/);
  assert.equal((issue.match(/FOR UPDATE/g) ?? []).length, 2);
  assert.match(issue, /FROM "FuelTransaction"/);
  assert.match(issue, /FROM "Vehicle"/);
  assert.match(issue, /row\.status!=="APPROVED"/);
  assert.match(issue, /input\.issuedLitres.*row\.requestedLitres/);
  assert.match(issue, /Issued litres cannot exceed the approved request/);
  assert.match(issue, /validateOdometer\(vehicle\.currentOdometerKm,issueOdometer\)/);
  assert.match(issue, /status:"ISSUED"/);
  assert.match(issue, /totalCost:total/);
});
