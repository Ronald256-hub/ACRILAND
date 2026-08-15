import assert from "node:assert/strict";
import test from "node:test";
import { calculateDriverScore,haversineMetres,overlapsWindow,pointInGeofence,speedPenalty,validateDispatchWindow } from "../src/domain/controlIntelligence.ts";
import { BusinessRuleError } from "../src/domain/rules.ts";

test("circle geofence evaluates inside and outside positions",()=>{
  const fence={shape:"CIRCLE" as const,centerLatitude:0,centerLongitude:0,radiusMetres:1000};
  assert.equal(pointInGeofence({latitude:0.001,longitude:0.001},fence),true);
  assert.equal(pointInGeofence({latitude:0.02,longitude:0.02},fence),false);
  assert.ok(haversineMetres({latitude:0,longitude:0},{latitude:0.001,longitude:0.001})>0);
});

test("polygon geofence evaluates a point using ray casting",()=>{
  const fence={shape:"POLYGON" as const,polygon:[{latitude:0,longitude:0},{latitude:0,longitude:1},{latitude:1,longitude:1},{latitude:1,longitude:0}]};
  assert.equal(pointInGeofence({latitude:0.5,longitude:0.5},fence),true);
  assert.equal(pointInGeofence({latitude:2,longitude:2},fence),false);
});

test("dispatch window rejects return before departure",()=>{
  assert.throws(()=>validateDispatchWindow(new Date("2026-08-15T10:00:00Z"),new Date("2026-08-15T09:00:00Z")),BusinessRuleError);
  assert.doesNotThrow(()=>validateDispatchWindow(new Date("2026-08-15T10:00:00Z"),new Date("2026-08-15T12:00:00Z")));
});

test("dispatch overlap recognizes shared time windows",()=>{
  const aStart=new Date("2026-08-15T08:00:00Z"),aEnd=new Date("2026-08-15T12:00:00Z");
  assert.equal(overlapsWindow(aStart,aEnd,new Date("2026-08-15T11:00:00Z"),new Date("2026-08-15T13:00:00Z")),true);
  assert.equal(overlapsWindow(aStart,aEnd,new Date("2026-08-15T12:00:00Z"),new Date("2026-08-15T13:00:00Z")),false);
});

test("driver score is transparent, clamped and banded",()=>{
  assert.deepEqual(calculateDriverScore({safetyEventPoints:3,incidentPoints:2,inspectionPoints:0}),{score:95,riskBand:"EXCELLENT"});
  assert.deepEqual(calculateDriverScore({safetyEventPoints:12,incidentPoints:5,inspectionPoints:0}),{score:83,riskBand:"GOOD"});
  assert.deepEqual(calculateDriverScore({safetyEventPoints:20,incidentPoints:5,inspectionPoints:0}),{score:75,riskBand:"WATCH"});
  assert.deepEqual(calculateDriverScore({safetyEventPoints:90,incidentPoints:30,inspectionPoints:10}),{score:0,riskBand:"HIGH_RISK"});
});

test("speed penalty increases with excess speed",()=>{
  assert.equal(speedPenalty(80,80),0);
  assert.equal(speedPenalty(85,80),2);
  assert.equal(speedPenalty(91,80),5);
  assert.equal(speedPenalty(101,80),10);
  assert.equal(speedPenalty(115,80),15);
});
