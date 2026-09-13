import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lifecycle=readFileSync(new URL("../src/modules/lifecycle/routes.ts",import.meta.url),"utf8");

test("vehicle disposal decision is serialized by a database row lock",()=>{
  const decision=lifecycle.slice(lifecycle.indexOf('/disposals/:id/decision'),lifecycle.indexOf('/disposals/:id/complete'));
  assert.match(decision,/prisma\.\$transaction\(async tx=>/);
  assert.match(decision,/VehicleDisposal[\s\S]*FOR UPDATE/);
});

test("vehicle disposal completion locks both disposal and vehicle before final state changes",()=>{
  const completion=lifecycle.slice(lifecycle.indexOf('/disposals/:id/complete'));
  assert.match(completion,/prisma\.\$transaction\(async tx=>/);
  assert.equal((completion.match(/FOR UPDATE/g)??[]).length,2);
  assert.match(completion,/vehicleDisposal\.update/);
  assert.match(completion,/vehicle\.update/);
});
