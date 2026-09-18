import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inventory = readFileSync(new URL("../src/modules/inventory/routes.ts", import.meta.url), "utf8");

test("procurement approval requires fresh MFA and serializes the decision", () => {
  const decision = inventory.slice(
    inventory.indexOf('inventoryRouter.post("/procurement/:id/decision"'),
    inventory.indexOf('inventoryRouter.post("/procurement/:id/order"')
  );
  assert.notEqual(decision, "", "procurement decision route must be present");
  assert.match(decision, /requireFreshMfa,requirePermission\(PERMISSIONS\.PROCUREMENT_APPROVE\)/);
  assert.match(decision, /prisma\.\$transaction\(async tx=>/);
  assert.match(decision, /FROM "ProcurementRequest"/);
  assert.match(decision, /FOR UPDATE/);
  assert.match(decision, /requestedByUserId===req\.auth!\.userId/);
  assert.match(decision, /status!=="REQUESTED"/);
  assert.match(decision, /A rejection reason is required/);
});

test("procurement ordering requires fresh MFA and cannot race an approval", () => {
  const order = inventory.slice(
    inventory.indexOf('inventoryRouter.post("/procurement/:id/order"'),
    inventory.indexOf('inventoryRouter.post("/procurement/:id/receive"')
  );
  assert.notEqual(order, "", "procurement order route must be present");
  assert.match(order, /requireFreshMfa,requirePermission\(PERMISSIONS\.PROCUREMENT_APPROVE\)/);
  assert.match(order, /prisma\.\$transaction\(async tx=>/);
  assert.match(order, /FROM "ProcurementRequest"/);
  assert.match(order, /FOR UPDATE/);
  assert.match(order, /status!=="APPROVED"/);
  assert.match(order, /total=n\(row\.requestedQuantity\)\*input\.unitPrice/);
});

test("procurement receipt locks the request and inventory item before updating stock", () => {
  const receive = inventory.slice(inventory.indexOf('inventoryRouter.post("/procurement/:id/receive"'));
  assert.notEqual(receive, "", "procurement receive route must be present");
  assert.match(receive, /prisma\.\$transaction\(async tx=>/);
  assert.equal((receive.match(/FOR UPDATE/g) ?? []).length, 2);
  assert.match(receive, /FROM "ProcurementRequest"/);
  assert.match(receive, /FROM "InventoryItem"/);
  assert.match(receive, /status!=="ORDERED"/);
  assert.match(receive, /quantityOnHand:\{increment:qty\}/);
  assert.match(receive, /status:"RECEIVED"/);
});
