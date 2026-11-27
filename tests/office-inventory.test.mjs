import assert from "node:assert/strict";
import {
  inventorySnapshot,
  inventoryTotals,
  inventoryHistory,
} from "../pos/office-inventory.mjs";
import { workspaceGroups } from "../pos/workspaces.mjs";
import { officeInventoryPage } from "../pos/office-inventory-ui.mjs";

const state = {
  products: [
    { id: "fruit", name: "Buah", stockUnit: "kg_butir" },
    { id: "milk", name: "Susu", stockUnit: "ml" },
    { id: "flour", name: "Tepung", stockUnit: "g" },
    { id: "empty", name: "Kemasan", stockUnit: "pcs" },
  ],
  unitLots: [
    {
      id: "m1",
      productId: "milk",
      storeId: "a",
      unit: "ml",
      qty: 100.5,
      receivedQty: 120,
      kind: "purchase",
      date: "2026-11-20",
    },
    {
      id: "f1",
      productId: "flour",
      storeId: "b",
      unit: "g",
      qty: 80.25,
      receivedQty: 80.25,
      date: "2026-11-20",
    },
  ],
  lots: [
    {
      id: "l1",
      productId: "fruit",
      storeId: "a",
      kg: 1.25,
      pieces: 1,
      quality: "reject",
      receivedKg: 1.25,
      receivedPieces: 1,
      date: "2026-11-18",
    },
  ],
  transfers: [
    { status: "cancelled", lines: [{ productId: "flour", qty: 35, unit: "g" }] },
  ],
  access: { backoffice: true },
};
const rows = inventorySnapshot(state),
  totals = inventoryTotals(rows);
assert.equal(totals.get("ml").onHand, 100.5);
assert.equal(totals.get("g").onHand, 80.25);
assert.equal(totals.get("g").transit, 0);
assert.deepEqual(totals.get("kg_butir"), {
  onHand: 1.25,
  pieces: 1,
  transit: 0,
  transitPieces: 0,
});
assert.equal(totals.get("pcs").onHand, 0);
assert.equal(inventoryTotals(rows, "a").get("g").onHand, 0);
const legacy = inventoryHistory(state, "milk", "a");
assert.equal(legacy.length, 1);
assert.equal(legacy[0].qty, 120);
assert.equal(legacy[0].event_id, undefined);
assert.deepEqual(inventoryHistory(state, "milk", "b"), []);
assert.ok(
  workspaceGroups({ workspace: "backoffice", backoffice: true })
    .find((g) => g.id === "masters")
    .pages.includes("officeInventory"),
);
assert.ok(
  !workspaceGroups({ workspace: "store", backoffice: true }).some((g) =>
    g.pages.includes("officeInventory"),
  ),
);
assert.equal(officeInventoryPage(state, "store"), "");
assert.equal(officeInventoryPage({ ...state, access: {} }, "backoffice"), "");
