import assert from "node:assert/strict";
import test from "node:test";
import { BLOCKED_FROM_OPERATION, canDriverOperate, canTransitionVehicle, effectiveDriverStatus, validateOdometer } from "../src/domain/rules.ts";

test("grounded and workshop states are blocked from operation",()=>{
  for(const s of ["GROUNDED","UNDER_MAINTENANCE","BREAKDOWN","ACCIDENT","OUT_OF_SERVICE","DISPOSED","SERVICE_OVERDUE"] as const)assert.equal(BLOCKED_FROM_OPERATION.has(s),true);
});

test("disposed vehicle cannot transition back into service",()=>assert.equal(canTransitionVehicle("DISPOSED","AVAILABLE"),false));
test("vehicle can move from breakdown to maintenance",()=>assert.equal(canTransitionVehicle("BREAKDOWN","UNDER_MAINTENANCE"),true));
test("odometer rejects rollback",()=>assert.throws(()=>validateOdometer(120000,119999),/cannot be lower/));
test("expired licence becomes LICENCE_EXPIRED",()=>assert.equal(effectiveDriverStatus("ACTIVE",new Date("2025-01-01"),new Date("2026-01-01")),"LICENCE_EXPIRED"));
test("expired licence driver cannot operate",()=>assert.equal(canDriverOperate("ACTIVE",new Date("2025-01-01"),new Date("2026-01-01")),false));
test("suspended driver remains suspended even when licence expired",()=>assert.equal(effectiveDriverStatus("SUSPENDED",new Date("2025-01-01"),new Date("2026-01-01")),"SUSPENDED"));
