import assert from "node:assert/strict";
import {
  prepareRetry,
  settleRetry,
  reconcileRetry,
  pendingRetry,
  setRetryScope,
} from "../pos/retry.mjs";
import { demoState, applyAction } from "../pos/core.mjs";
const memory = new Map();
globalThis.sessionStorage = {
  getItem: (k) => memory.get(k) || null,
  setItem: (k, v) => memory.set(k, v),
  removeItem: (k) => memory.delete(k),
};
setRetryScope("staff-A");
const payload = {
  id: "one",
  storeId: "depok",
  paid: 100000,
  lines: [{ lotId: "l1", kg: 2, pieces: 1 }],
};
assert.equal(prepareRetry("sale", payload).id, "one");
payload.lines[0].kg = 3;
assert.equal(pendingRetry().payload.lines[0].kg, 2);
payload.lines[0].kg = 2;
settleRetry("sale", true);
assert.equal(prepareRetry("sale", { ...payload, id: "two" }).id, "one");
assert.throws(
  () => prepareRetry("sale", { ...payload, paid: 200000 }),
  /belum pasti/,
);
setRetryScope("staff-B");
assert.equal(pendingRetry(), null);
setRetryScope("staff-A");
assert.equal(pendingRetry().id, "one");
assert.equal(reconcileRetry({ sales: [] }), false);
assert.equal(reconcileRetry({ sales: [{ id: "one" }] }), true);
assert.equal(pendingRetry(), null);
for (const [action, table] of [
  ["order_create", "orders"],
  ["discount_save", "events"],
  ["cashier_approval_request", "cashierApprovals"],
  ["cashier_approval_decide", "events"],
  ["order_complete", "events"],
  ["receipt", "lots"],
  ["movement", "movements"],
  ["unit_receipt", "unitLots"],
  ["produce", "productions"],
  ["waste_process", "wasteRuns"],
]) {
  prepareRetry(action, { id: "first", qty: 1 });
  settleRetry(action, true);
  assert.equal(prepareRetry(action, { id: "second", qty: 1 }).id, "first");
  assert.equal(reconcileRetry({ [table]: [{ id: "first" }] }), true);
  prepareRetry(action, { id: "failed", qty: 2 });
  settleRetry(action, false);
  assert.equal(pendingRetry(), null);
}
prepareRetry("order_void", {id:"void-retry", orderId:"order"});settleRetry("order_void",true);assert(reconcileRetry({events:[],orders:[{id:"order",void_meta:{eventId:"void-retry"}}]}));
const state = demoState(),
  source = state.lots.find((l) => l.kg > 2 && l.pieces > 1),
  to = state.stores.find((s) => s.id !== source.storeId);
const date = "2027-01-01";
const moved = applyAction(state, "movement", {
  id: "transfer-regression",
  lotId: source.id,
  date,
  kind: "Transfer",
  toStoreId: to.id,
  kg: 2,
  pieces: 1,
  note: "Test",
});
assert.equal(moved.lots.find((x) => x.id === "transfer-regression").date, date);
assert.equal(state.lots.find((x) => x.id === source.id).kg, source.kg);
console.log(
  "PASS: uncertain retry, stable IDs, session/account isolation, reconciliation, definitive failure, transfer availability date.",
);
