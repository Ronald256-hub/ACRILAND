import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page=readFileSync(new URL("../../web/src/pages/InspectionsPage.tsx",import.meta.url),"utf8");
const vehicles=readFileSync(new URL("../../web/src/pages/VehiclesPage.tsx",import.meta.url),"utf8");
const main=readFileSync(new URL("../../web/src/main.tsx",import.meta.url),"utf8");
const defaults=readFileSync(new URL("../src/services/platformDefaults.ts",import.meta.url),"utf8");

test("driver health page captures load, behaviour, repair request and private photos",()=>{for(const token of ["loadState","vehicleBehavior","repairRequest","driverCanContinue","capture=\"environment\"","photos"])assert.match(page,new RegExp(token));});
test("vehicle register exposes HEALTHY ATTENTION and CRITICAL condition states",()=>{for(const token of ["healthState","HEALTHY","ATTENTION","CRITICAL"])assert.match(vehicles,new RegExp(token));});
test("daily driver health checklist is a synchronized platform default",()=>{assert.match(defaults,/Driver Daily Vehicle Health Check/);assert.match(defaults,/LOAD_SECURITY/);assert.match(defaults,/SERVICE_BRAKES/);});
test("Phase 10 styles are loaded by the production React entry point",()=>{assert.match(main,/styles-v10\.css/);});
