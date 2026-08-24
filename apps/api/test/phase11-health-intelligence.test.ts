import assert from "node:assert/strict";
import test from "node:test";
import {
  acknowledgementDueAt,
  acknowledgementIsOverdue,
  buildRepeatFaultIntelligence,
  openAgeBand,
  type HealthPolicy
} from "../src/domain/healthIntelligence.ts";
import { ROLE_TEMPLATES } from "../src/domain/permissions.ts";

const policy: HealthPolicy = { criticalAckMinutes: 30, attentionAckHours: 8, freshnessHours: 24, repeatWindowDays: 30 };
const base = new Date("2026-08-24T10:00:00.000Z");

test("critical and attention acknowledgement targets use different policy units", () => {
  assert.equal(acknowledgementDueAt(base, "CRITICAL", policy).toISOString(), "2026-08-24T10:30:00.000Z");
  assert.equal(acknowledgementDueAt(base, "ATTENTION", policy).toISOString(), "2026-08-24T18:00:00.000Z");
});

test("only open unacknowledged reports become response overdue", () => {
  const now = new Date("2026-08-24T10:31:00.000Z");
  assert.equal(acknowledgementIsOverdue({ createdAt: base, managerStatus: "OPEN", state: "CRITICAL", policy, now }), true);
  assert.equal(acknowledgementIsOverdue({ createdAt: base, managerStatus: "ACKNOWLEDGED", state: "CRITICAL", policy, now }), false);
  assert.equal(acknowledgementIsOverdue({ createdAt: base, acknowledgedAt: new Date("2026-08-24T10:20:00.000Z"), managerStatus: "OPEN", state: "CRITICAL", policy, now }), false);
});

test("open defect ageing uses stable operational bands", () => {
  assert.equal(openAgeBand(base, new Date("2026-08-24T13:59:00.000Z")), "UNDER_4_HOURS");
  assert.equal(openAgeBand(base, new Date("2026-08-24T14:00:00.000Z")), "4_TO_24_HOURS");
  assert.equal(openAgeBand(base, new Date("2026-08-25T10:00:00.000Z")), "1_TO_3_DAYS");
  assert.equal(openAgeBand(base, new Date("2026-08-27T10:00:00.000Z")), "OVER_3_DAYS");
});

test("repeat fault intelligence separates fleet hotspots from same-vehicle recurrence", () => {
  const result = buildRepeatFaultIntelligence([
    { vehicleId: "v1", vehicleRegistration: "UAA 001A", code: "SERVICE_BRAKES", label: "Service brakes", isCritical: true, observedAt: new Date("2026-08-20T10:00:00Z") },
    { vehicleId: "v1", vehicleRegistration: "UAA 001A", code: "SERVICE_BRAKES", label: "Service brakes", isCritical: true, observedAt: new Date("2026-08-22T10:00:00Z") },
    { vehicleId: "v2", vehicleRegistration: "UAA 002A", code: "SERVICE_BRAKES", label: "Service brakes", isCritical: false, observedAt: new Date("2026-08-23T10:00:00Z") },
    { vehicleId: "v2", vehicleRegistration: "UAA 002A", code: "LIGHTS", label: "Exterior lights", isCritical: false, observedAt: new Date("2026-08-23T12:00:00Z") }
  ]);
  assert.equal(result.faultSystems[0]?.code, "SERVICE_BRAKES");
  assert.equal(result.faultSystems[0]?.occurrences, 3);
  assert.equal(result.faultSystems[0]?.vehicleCount, 2);
  assert.equal(result.repeatVehicleFaults.length, 1);
  assert.equal(result.repeatVehicleFaults[0]?.vehicleRegistration, "UAA 001A");
  assert.equal(result.repeatVehicleFaults[0]?.occurrences, 2);
});

test("health intelligence stays management/workshop scoped and is not granted to drivers", () => {
  assert.equal(ROLE_TEMPLATES.DRIVER?.includes("health.intelligence.view"), false);
  assert.equal(ROLE_TEMPLATES.FLEET_MANAGER?.includes("health.intelligence.view"), true);
  assert.equal(ROLE_TEMPLATES.WORKSHOP_MANAGER?.includes("health.intelligence.view"), true);
  assert.equal(ROLE_TEMPLATES.WORKSHOP_SUPERVISOR?.includes("health.intelligence.view"), true);
  assert.equal(ROLE_TEMPLATES.MANAGEMENT_DIRECTOR?.includes("health.intelligence.view"), true);
});
