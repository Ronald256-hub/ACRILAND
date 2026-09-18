import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assignments = readFileSync(new URL("../src/modules/assignments/routes.ts", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../src/modules/dispatch/routes.ts", import.meta.url), "utf8");

test("vehicle assignment creation uses fresh MFA and serializes vehicle/driver availability", () => {
  const create = assignments.slice(assignments.indexOf('assignmentsRouter.post("/")'), assignments.indexOf('assignmentsRouter.post("/:id/end"'));
  assert.match(create, /requireFreshMfa, requirePermission\(PERMISSIONS\.ASSIGNMENT_CREATE\)/);
  assert.match(create, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.equal((create.match(/FOR UPDATE/g) ?? []).length, 2);
  assert.match(create, /vehicleAssignment/);
  assert.match(create, /driverAssignment/);
  assert.match(create, /assertVehicleAssignable/);
  assert.match(create, /assertDriverAssignable/);
});

test("ending a vehicle assignment uses fresh MFA and locks assignment plus vehicle", () => {
  const end = assignments.slice(assignments.indexOf('assignmentsRouter.post("/:id/end"'));
  assert.match(end, /requireFreshMfa, requirePermission\(PERMISSIONS\.ASSIGNMENT_END\)/);
  assert.match(end, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.equal((end.match(/FOR UPDATE/g) ?? []).length, 2);
  assert.match(end, /status !== "ACTIVE"/);
  assert.match(end, /active_trip/);
  assert.match(end, /status:"AVAILABLE"/);
});

test("dispatch planning uses fresh MFA and locks trip, vehicle and driver before conflict checks", () => {
  const create = dispatch.slice(dispatch.indexOf('dispatchRouter.post("/"'), dispatch.indexOf('dispatchRouter.post("/:id/ready"'));
  assert.match(create, /requireFreshMfa, requirePermission\(PERMISSIONS\.DISPATCH_MANAGE\)/);
  assert.match(create, /prisma\.\$transaction\(async tx=>/);
  assert.equal((create.match(/FOR UPDATE/g) ?? []).length, 3);
  assert.match(create, /currentPlan/);
  assert.match(create, /conflict/);
  assert.match(create, /plannedDeparture:\{lt:input\.plannedReturn\}/);
  assert.match(create, /plannedReturn:\{gt:input\.plannedDeparture\}/);
});

test("dispatch state transitions are serialized and final dispatch re-validates live trip, vehicle and driver state", () => {
  const ready = dispatch.slice(dispatch.indexOf('dispatchRouter.post("/:id/ready"'), dispatch.indexOf('dispatchRouter.post("/:id/dispatch"'));
  const finalDispatch = dispatch.slice(dispatch.indexOf('dispatchRouter.post("/:id/dispatch"'), dispatch.indexOf('dispatchRouter.post("/:id/complete"'));
  assert.match(ready, /requireFreshMfa, requirePermission\(PERMISSIONS\.DISPATCH_MANAGE\)/);
  assert.match(ready, /FOR UPDATE/);
  assert.match(finalDispatch, /requireFreshMfa, requirePermission\(PERMISSIONS\.DISPATCH_MANAGE\)/);
  assert.match(finalDispatch, /FOR UPDATE/);
  assert.match(finalDispatch, /trip\.status!=="ACTIVE"/);
  assert.match(finalDispatch, /vehicle\.status!=="ON_TRIP"/);
  assert.match(finalDispatch, /canDriverOperate/);
  assert.match(finalDispatch, /status:"DISPATCHED"/);
});

test("dispatch completion and cancellation cannot race duplicate state transitions", () => {
  const complete = dispatch.slice(dispatch.indexOf('dispatchRouter.post("/:id/complete"'), dispatch.indexOf('dispatchRouter.post("/:id/cancel"'));
  const cancel = dispatch.slice(dispatch.indexOf('dispatchRouter.post("/:id/cancel"'));
  assert.match(complete, /requireFreshMfa, requirePermission\(PERMISSIONS\.DISPATCH_MANAGE\)/);
  assert.match(complete, /FOR UPDATE/);
  assert.match(complete, /status!=="DISPATCHED"/);
  assert.match(complete, /status:"COMPLETED"/);
  assert.match(cancel, /requireFreshMfa, requirePermission\(PERMISSIONS\.DISPATCH_MANAGE\)/);
  assert.match(cancel, /FOR UPDATE/);
  assert.match(cancel, /Only an active or completed dispatch cannot be cancelled here|An active or completed dispatch cannot be cancelled here/);
});
