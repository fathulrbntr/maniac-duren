import assert from "node:assert/strict";
import { Node, makeModal } from "./variant-dom.mjs";
import { bindSupply } from "../pos/warehouse-ui.mjs";
import { openReceivingSession, varianceTable } from "../pos/receiving-session-ui.mjs";
const body = new Node("body");
body.innerHTML = "<button data-note-new></button>";
Node.prototype.prepend = function (n) {
  this.insertBefore(n, this.children[0] || null);
};
globalThis.document = {
  body,
  createElement: (tag) => new Node(tag),
  querySelector: (q) => body.querySelector(q),
  querySelectorAll: (q) => body.querySelectorAll(q),
};
const cache = new Map();
globalThis.localStorage = {
  getItem: (k) => cache.get(k),
  setItem: (k, v) => cache.set(k, v),
  removeItem: (k) => cache.delete(k),
};
const adapter = makeModal();
const plan = {
  id: "plan",
  invoiceNo: "T-122",
  storeId: "wh",
  lines: [{ productId: "milk" }],
  expected: { milk: { unit: "ml", qty: 1000 } },
  receiving: { revision: 1, status: "open", scans: [], quantities: {} },
};
const state = {
  supplierStockVersion: 122,
  warehouseWorkflowVersion: 114,
  warehouseVersion: 107,
  access: {},
  me: { userId: "worker" },
  products: [
    { id: "fruit", name: "Monthong", itemType: "direct", stockUnit: "kg_butir" },
    { id: "milk", name: "Susu", itemType: "raw", stockUnit: "ml" },
    { id: "menu", name: "Es resep", itemType: "recipe", stockUnit: "porsi" },
  ],
  suppliers: [{ id: "sup", name: "Supplier" }],
  locations: [{ id: "wh", locationType: "warehouse", name: "Gudang" }],
  receiptPlans: [plan],
};
const calls = [];
const ctx = {
  workspace: "warehouse",
  getState: () => state,
  render() {},
  modal: adapter.modal,
  mutate: async (a, p) => calls.push([a, p]),
};
bindSupply(state, "wh", "receiving", ctx);
await body.querySelector("[data-note-new]").fire("click");
const note = adapter.latest;
assert(note.querySelector("[data-note-kg]"));
assert(!note.querySelector('[value="menu"]'));
await note.querySelector("[data-note-add]").fire("click");
let line = note.querySelectorAll("[data-note-line]")[1];
assert.equal(line.querySelector("[data-note-product]").value, "milk");
assert(line.querySelector("[data-note-qty]"));
assert(!line.querySelector("[data-note-pieces]"));
line.querySelector("[data-note-product]").value = "fruit";
await line.querySelector("[data-note-product]").fire("change");
assert(note.querySelectorAll("[data-note-line]")[1].querySelector("[data-note-pieces]"));
const session = openReceivingSession(state, plan.id, ctx);
assert(!session.querySelector("[data-session-code]"));
await session.querySelector("[data-session-quantity]").fire("click");
const form = adapter.latest.querySelector("form");
assert(form.textContent.includes("Jumlah aktual (ml)"));
form.querySelector('[name="qty"]').value = "975";
Object.defineProperty(form, "elements", {
  value: {
    qty: form.querySelector('[name="qty"]'),
    expiry: form.querySelector('[name="expiry"]'),
  },
});
await form.fire("submit");
assert.equal(calls[0][0], "receipt_quantity");
assert.equal(calls[0][1].qty, 975);
assert.equal(calls[0][1].expectedSessionRevision, 1);
plan.receiving.quantities.milk = { qty: 975 };
plan.receiving.status = "completed";
assert(varianceTable(state, plan).includes("25 ml"));
plan.lines.push({ productId: "fruit" });
assert(
  openReceivingSession(state, plan.id, ctx).querySelector("[data-session-code]") === null,
);
plan.receiving.status = "open";
const mixed = openReceivingSession(state, plan.id, ctx);
assert(mixed.querySelector("[data-session-code]"));
assert(mixed.querySelector("[data-session-quantity]"));
