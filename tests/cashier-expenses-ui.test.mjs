import assert from "node:assert/strict";
import { Node, FormDataAdapter } from "./variant-dom.mjs";
import { storeExpensesPage, bindStoreExpenses } from "../pos/store-expenses-ui.mjs";
import { visibleSections } from "../pos/navigation.mjs";
import { commitMutation } from "../pos/data/mutations.mjs";
import {
  prepareRetry,
  reconcileRetry,
  pendingRetry,
  setRetryScope,
} from "../pos/retry.mjs";
const a = { workspace: "store", sell: true, cashierExpenses: true };
assert.deepEqual(visibleSections(a).find((g) => g.id === "cashier").pages, [
  "shifts",
  "orders",
  "storeExpenses",
]);
for (const change of [
  { sell: false },
  { cashierExpenses: false },
  { workspace: "warehouse" },
  { workspace: "backoffice" },
])
  assert(
    !visibleSections({ ...a, ...change })
      .flatMap((g) => g.pages)
      .includes("storeExpenses"),
  );
const s = {
  cashierExpenseVersion: 128,
  access: { sell: true },
  me: { id: "kasir", name: "Adi" },
  stores: [{ id: "a", name: "Harapan Indah", locationType: "store" }],
  cashierShifts: [{ id: "shift", storeId: "a", cashierId: "kasir" }],
  myStoreExpenses: [
    {
      id: "expense",
      store_id: "a",
      description: "<em>Plastik</em>",
      category: "Operasional",
      date: "2026-11-26",
      amount: 15000,
      payment: "Tunai",
      voided: false,
    },
    { store_id: "b", description: "OTHER BRANCH" },
  ],
};
const root = new Node("main");
globalThis.document = root;
globalThis.FormData = FormDataAdapter;
root.innerHTML = storeExpensesPage(s, "a");
assert(!root.querySelector("em"));
assert(!root.textContent.includes("OTHER BRANCH"));
assert(!storeExpensesPage({ ...s, stockDemo: {} }, "a").includes("<form"));
assert(!storeExpensesPage({ ...s, access: { sell: false } }, "a").includes("<form"));
const form = root.querySelector("form"),
  el = (n) => form.elements.namedItem(n);
assert(!el("funding") && !el("storeId") && !el("date"));
const calls = [],
  notices = [];
let fail = true,
  renders = 0;
const ctx = {
  mutate: async (action, p) => {
    calls.push([action, p]);
    if (fail) throw Error("Koneksi terputus");
    return true;
  },
  render: () => renders++,
  toast: (t) => notices.push(t),
};
bindStoreExpenses(s, "a", ctx);
el("payment").value = "Tunai";
await el("payment").fire("change");
assert.match(form.textContent, /laci shift/);
el("amount").value = "15000";
el("category").value = "Operasional";
el("description").value = "Beli plastik";
el("reference").value = "S-1";
await form.fire("submit");
assert.equal(renders, 0);
assert.match(form.textContent, /Koneksi terputus/);
fail = false;
await form.fire("submit");
assert.equal(renders, 1);
assert.equal(notices.length, 1);
assert.deepEqual(calls[0], calls[1]);
const [action, p] = calls[1];
assert.equal(action, "cashier_expense_save");
assert.equal(p.shiftId, "shift");
assert.equal(p.storeId, "a");
assert.equal(p.amount, 15000);
el("payment").value = "Transfer";
await el("payment").fire("change");
assert.match(form.textContent, /nontunai/);
await form.fire("submit");
assert.equal(calls.at(-1)[1].shiftId, null);
bindStoreExpenses({ ...s, cashierShifts: [] }, "a", ctx);
el("payment").value = "Tunai";
await el("payment").fire("change");
assert.match(form.textContent, /di luar shift/);
await form.fire("submit");
assert.equal(calls.at(-1)[1].shiftId, null);
await commitMutation(s, action, p, async (path, body) => {
  assert.equal(path, "/rest/v1/rpc/pos_warehouse_mutate");
  assert.deepEqual(body, { action, payload: p });
  return s;
});
setRetryScope("cashier-expenses-test");
prepareRetry(action, p);
assert.equal(prepareRetry(action, { ...p, id: "new" }).id, p.id);
assert(!reconcileRetry({ myStoreExpenses: [{ id: "other" }] }));
assert(reconcileRetry({ myStoreExpenses: [{ id: p.id }] }));
assert(!pendingRetry());
console.log(
  "PASS cashier expense navigation, active branch, form, shift, retry and saved feedback.",
);
