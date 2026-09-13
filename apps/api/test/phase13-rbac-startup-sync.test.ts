import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../../../Dockerfile", import.meta.url), "utf8");

 test("production startup synchronizes RBAC and fleet defaults after migrations", () => {
  assert.match(dockerfile, /prisma migrate deploy/);
  assert.match(dockerfile, /node apps\/api\/dist\/scripts\/bootstrap-admin\.js/);
  assert.match(dockerfile, /node apps\/api\/dist\/scripts\/sync-platform-defaults\.js/);
  assert.ok(
    dockerfile.indexOf("sync-platform-defaults.js") > dockerfile.indexOf("bootstrap-admin.js"),
    "RBAC sync should run after bootstrap and before the API server starts",
  );
  assert.ok(
    dockerfile.indexOf("sync-platform-defaults.js") < dockerfile.indexOf("apps/api/dist/src/server.js"),
    "RBAC sync should complete before the API server starts",
  );
});
