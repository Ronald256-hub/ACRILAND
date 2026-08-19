import assert from "node:assert/strict";
import test from "node:test";
import { classifyVehicleHealth, shouldGroundFromHealth } from "../src/domain/vehicleHealth.ts";

const good=[{result:"PASS" as const,isCritical:true,labelSnapshot:"Brakes"},{result:"PASS" as const,isCritical:false,labelSnapshot:"Lights"}];

test("all-good driver check classifies vehicle healthy",()=>{assert.equal(classifyVehicleHealth({results:good,driverCanContinue:true,loadState:"LOADED"}),"HEALTHY");});
test("non-critical repair concern becomes attention without grounding",()=>{const results=[...good,{result:"ATTENTION_REQUIRED" as const,isCritical:false,labelSnapshot:"Suspension"}];assert.equal(classifyVehicleHealth({results,driverCanContinue:true,repairRequest:"Inspect suspension knock"}),"ATTENTION");assert.equal(shouldGroundFromHealth({results,driverCanContinue:true}),false);});
test("critical checklist failure is a critical health condition and grounds vehicle",()=>{const results=[{result:"FAIL" as const,isCritical:true,labelSnapshot:"Service brakes"}];assert.equal(classifyVehicleHealth({results,driverCanContinue:true}),"CRITICAL");assert.equal(shouldGroundFromHealth({results,driverCanContinue:true}),true);});
test("driver stop declaration escalates even if checklist looks good",()=>{assert.equal(classifyVehicleHealth({results:good,driverCanContinue:false}),"CRITICAL");assert.equal(shouldGroundFromHealth({results:good,driverCanContinue:false}),true);});
test("suspected overload escalates to critical",()=>{assert.equal(classifyVehicleHealth({results:good,driverCanContinue:true,loadState:"OVERLOAD_SUSPECTED"}),"CRITICAL");});
