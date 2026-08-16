import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app=readFileSync(new URL("../../web/src/app.tsx",import.meta.url),"utf8");
const main=readFileSync(new URL("../../web/src/main.tsx",import.meta.url),"utf8");

test("Phase 9 structured asset and custody pages are routed",()=>{
  assert.match(app,/BatteryControlPage/);
  assert.match(app,/HandoversV9Page/);
  assert.match(app,/path="batteries" element={<BatteryControlPage\/>}/);
  assert.match(app,/path="handovers" element={<HandoversV9Page\/>}/);
});

test("Phase 9 contextual 360 pages are routed",()=>{
  assert.match(app,/Vehicle360ContextPage/);
  assert.match(app,/Driver360ContextPage/);
  assert.match(app,/path="vehicles\/:id" element={<Vehicle360ContextPage\/>}/);
  assert.match(app,/path="drivers\/:id" element={<Driver360ContextPage\/>}/);
});

test("Phase 9 styles are loaded by the React entry point",()=>{
  assert.match(main,/styles-v9\.css/);
});
