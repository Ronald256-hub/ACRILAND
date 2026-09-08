import test from "node:test";
import assert from "node:assert/strict";
import { telemetrySignature, canonicalTelemetryPayload, generateTelemetryDeviceSecret } from "../src/modules/telemetry/deviceAuth.js";

test("telemetry canonicalization sorts object keys deterministically", () => {
  assert.equal(canonicalTelemetryPayload({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.equal(canonicalTelemetryPayload({ a: 1, z: 2 }), canonicalTelemetryPayload({ z: 2, a: 1 }));
});

test("telemetry signatures are deterministic and secret-bound", () => {
  const secret = generateTelemetryDeviceSecret();
  const payload = { vehicleId: "v1", latitude: 0.123456, longitude: 32.654321, speedKph: 42 };
  const one = telemetrySignature(secret, "1788876000", "nonce-1234567890", payload);
  assert.equal(one, telemetrySignature(secret, "1788876000", "nonce-1234567890", { speedKph: 42, longitude: 32.654321, latitude: 0.123456, vehicleId: "v1" }));
  assert.notEqual(one, telemetrySignature("different-secret", "1788876000", "nonce-1234567890", payload));
  assert.notEqual(one, telemetrySignature(secret, "1788876001", "nonce-1234567890", payload));
});

