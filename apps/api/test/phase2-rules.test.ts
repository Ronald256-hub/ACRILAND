import assert from "node:assert/strict";
import test from "node:test";
import { assertDifferentApprover, assertDriverAssignable, assertVehicleAssignable, evaluateInspectionResults, validateTripOdometers } from "../src/domain/rules.ts";

test("cannot assign a grounded vehicle", () => { assert.throws(() => assertVehicleAssignable("GROUNDED"), /cannot be assigned/i); });
test("cannot assign a driver whose licence has expired", () => { assert.throws(() => assertDriverAssignable("ACTIVE", new Date("2025-01-01"), new Date("2026-01-01")), /not authorized/i); });
test("requester cannot approve own trip", () => { assert.throws(() => assertDifferentApprover("user-1", "user-1"), /cannot approve their own/i); });
test("trip return rejects odometer rollback and calculates distance", () => { assert.throws(() => validateTripOdometers(150000, 149999), /cannot be lower/i); assert.equal(validateTripOdometers(150000, 150325), 325); });
test("critical failed inspection grounds operation", () => { assert.deepEqual(evaluateInspectionResults([{ result: "PASS", isCritical: false }, { result: "FAIL", isCritical: true }]), { status: "FAILED", hasFailure: true, criticalFailure: true }); });
test("attention-only inspection can proceed with attention status", () => { assert.deepEqual(evaluateInspectionResults([{ result: "PASS", isCritical: true }, { result: "ATTENTION_REQUIRED", isCritical: false }]), { status: "COMPLETED_WITH_ATTENTION", hasFailure: false, criticalFailure: false }); });
