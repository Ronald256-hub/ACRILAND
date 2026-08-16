import assert from "node:assert/strict";
import test from "node:test";
import { detectPrivateEvidenceMime } from "../src/lib/fileStorage.ts";

test("private evidence detects PDF signature",()=>{assert.equal(detectPrivateEvidenceMime(Buffer.from("%PDF-1.7\nexample")),"application/pdf");});
test("private evidence detects JPEG signature",()=>{assert.equal(detectPrivateEvidenceMime(Buffer.from([0xff,0xd8,0xff,0x01,0x02])),"image/jpeg");});
test("private evidence rejects extension-only or arbitrary bytes",()=>{assert.equal(detectPrivateEvidenceMime(Buffer.from("report.pdf but not actually a pdf")),null);assert.equal(detectPrivateEvidenceMime(Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12])),null);});
