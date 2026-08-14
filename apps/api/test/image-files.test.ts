import assert from "node:assert/strict";
import test from "node:test";
import { detectSupportedImageMime, extensionForMime } from "../src/lib/imageFiles.ts";

test("detects JPEG by binary signature", () => {
  assert.equal(detectSupportedImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), "image/jpeg");
});

test("detects PNG by binary signature", () => {
  assert.equal(detectSupportedImageMime(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00])), "image/png");
});

test("detects WebP by RIFF/WEBP signature", () => {
  assert.equal(detectSupportedImageMime(Buffer.from("RIFF0000WEBPmore", "ascii")), "image/webp");
});

test("rejects spoofed or unsupported image payload", () => {
  assert.equal(detectSupportedImageMime(Buffer.from("not-an-image", "utf8")), null);
});

test("maps supported image MIME types to safe server-generated extensions", () => {
  assert.equal(extensionForMime("image/jpeg"), "jpg");
  assert.equal(extensionForMime("image/png"), "png");
  assert.equal(extensionForMime("image/webp"), "webp");
});
