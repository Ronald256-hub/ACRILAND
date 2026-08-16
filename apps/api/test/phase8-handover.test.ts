import assert from "node:assert/strict";
import test from "node:test";
import { canAcceptHandover,canAddHandoverEvidence,canRejectHandover } from "../src/domain/handoverRules.ts";

const receiving={fromDriverId:"driver-a",toDriverId:"driver-b",fromUserId:"user-a",toUserId:"user-b",status:"PENDING"};
test("portal-enabled receiving driver must personally accept custody",()=>{assert.equal(canAcceptHandover(receiving,"manager",true),false);assert.equal(canAcceptHandover(receiving,"user-b",false),true);});
test("management may accept when receiving driver has no portal identity",()=>{assert.equal(canAcceptHandover({...receiving,toUserId:null},"manager",true),true);});
test("management or receiving driver may reject pending custody",()=>{assert.equal(canRejectHandover(receiving,"manager",true),true);assert.equal(canRejectHandover(receiving,"user-b",false),true);assert.equal(canRejectHandover(receiving,"user-a",false),false);});
test("handover evidence is limited to management or custody parties",()=>{assert.equal(canAddHandoverEvidence(receiving,"manager",true),true);assert.equal(canAddHandoverEvidence(receiving,"user-a",false),true);assert.equal(canAddHandoverEvidence(receiving,"user-b",false),true);assert.equal(canAddHandoverEvidence(receiving,"outsider",false),false);});
