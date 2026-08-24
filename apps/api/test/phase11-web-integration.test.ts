import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../web/src/app.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../web/src/components/Shell.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../../web/src/pages/VehicleHealthIntelligencePage.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../../web/src/pages/DashboardPage.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../../web/src/main.tsx", import.meta.url), "utf8");

test("vehicle health intelligence workspace is routed and permission-gated in navigation", () => {
  assert.match(app, /VehicleHealthIntelligencePage/);
  assert.match(app, /path="vehicle-health"/);
  assert.match(shell, /Vehicle Health Intelligence/);
  assert.match(shell, /health\.intelligence\.view/);
});

test("management health workspace exposes response, compliance and repeat-fault intelligence", () => {
  for (const token of ["compliancePercent", "responseOverdue", "repeatVehicleFaults", "healthCriticalAckMinutes", "healthRepeatWindowDays", "workOrderConversionPercent"]) assert.match(page, new RegExp(token));
});

test("management dashboard surfaces driver vehicle health and response control", () => {
  assert.match(dashboard, /driverVehicleHealth/);
  assert.match(dashboard, /Health response control/);
  assert.match(dashboard, /Vehicle health intelligence/);
});

test("Phase 11 stylesheet is loaded by the production React entry point", () => {
  assert.match(main, /styles-v11\.css/);
});
