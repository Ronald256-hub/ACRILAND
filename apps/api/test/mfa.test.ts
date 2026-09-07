import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV="test";
process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET="test-secret-that-is-long-enough-for-the-schema-123456";
process.env.MFA_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.CORS_ORIGIN="http://localhost:5173";
process.env.APP_URL="http://localhost:5173";

const { totpAt } = await import("../src/lib/mfaCrypto.ts");
const { matchingTotpStep } = await import("../src/lib/mfaTotp.ts");

const RFC_SECRET="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("TOTP matches RFC 6238 SHA-1 six-digit vector",()=>{
  assert.equal(totpAt(RFC_SECRET,59_000),"287082");
});

test("TOTP accepts one adjacent time step for clock skew",()=>{
  const timestamp=59_000;
  const code=totpAt(RFC_SECRET,29_000);
  assert.equal(matchingTotpStep(RFC_SECRET,code,timestamp),0);
});

test("TOTP rejects malformed codes",()=>{
  assert.equal(matchingTotpStep(RFC_SECRET,"12345",59_000),null);
  assert.equal(matchingTotpStep(RFC_SECRET,"abcdef",59_000),null);
});
