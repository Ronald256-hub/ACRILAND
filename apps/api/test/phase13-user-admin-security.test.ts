import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const users = readFileSync(new URL("../src/modules/users/routes.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/modules/auth/routes.ts", import.meta.url), "utf8");

test("user provisioning requires fresh MFA and cannot grant protected admin roles casually", () => {
  const create = users.slice(users.indexOf('usersRouter.post("/")'), users.indexOf('usersRouter.patch("/:id/status"'));
  assert.match(create, /requireFreshMfa, requirePermission\(PERMISSIONS\.USER_CREATE\)/);
  assert.match(create, /PROTECTED_ADMIN_ROLES/);
  assert.match(create, /Only a Super Administrator may provision protected administrator roles/);
  assert.match(create, /attemptsToGrantOutsideActor/);
  assert.match(create, /You cannot provision a role containing permissions you do not currently hold/);
});

test("user status administration is serialized and protects the last administrator", () => {
  const status = users.slice(users.indexOf('usersRouter.patch("/:id/status"'));
  assert.match(status, /requireFreshMfa, requirePermission\(PERMISSIONS\.USER_DISABLE\)/);
  assert.match(status, /prisma\.\$transaction\(async tx=>/);
  assert.match(status, /FROM "User"/);
  assert.match(status, /FOR UPDATE/);
  assert.match(status, /protectedActiveCount/);
  assert.match(status, /The last active protected administrator cannot be disabled/);
  assert.match(status, /Only a Super Administrator may change the status of protected administrator accounts/);
  assert.match(status, /tx\.session\.updateMany/);
});

test("login locks the user row before password verification so disable/reset races cannot reactivate the account", () => {
  const login = auth.slice(auth.indexOf('authRouter.post("/login"'), auth.indexOf('authRouter.post("/refresh"'));
  const lockIndex = login.indexOf("FOR UPDATE");
  const passwordIndex = login.indexOf("verifyPassword");
  assert.ok(lockIndex >= 0, "login must lock the account row");
  assert.ok(passwordIndex > lockIndex, "password verification must occur after the row lock");
  assert.match(login, /status !== "ACTIVE"/);
  assert.match(login, /status: "ACTIVE"/);
  assert.match(login, /return \{ kind:"success" as const, session, refresh/);
  assert.match(login, /res\.cookie\("acr_refresh", result\.refresh/);
});
