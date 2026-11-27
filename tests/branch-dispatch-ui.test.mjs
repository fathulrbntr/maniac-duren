import assert from "node:assert/strict";
import { openDispatch } from "../pos/warehouse-ui.mjs";
import { allocateBranchUnits } from "../pos/warehouse-flow.mjs";
import { Node, makeModal } from "./variant-dom.mjs";
import { answerConfirmations } from "./helpers/confirmation-ui.mjs";

globalThis.document = { body: new Node("body"), createElement: (tag) => new Node(tag) };
let approve = true;
answerConfirmations(document, () => approve);

const code = (n) => "9201261126" + String(n).padStart(6, "0") + "9913002000";
const labels = Array.from({ length: 33 }, (_, i) => code(i + 1));
const state = {
  access: { backoffice: true },
  branchStockVersion: 132,
  warehouseVersion: 107,
  outboundBatchVersion: 131,
  stores: [
    { id: "a", name: "Cikarang", locationType: "store" },
    { id: "b", name: "Harapan Indah", locationType: "store" },
  ],
  people: [{ id: "employee", name: "Agus" }],
  products: [
    { id: "fruit", sku: "D01", name: "Monthong", stockUnit: "kg_butir" },
    { id: "other", sku: "D02", name: "Bawor", stockUnit: "kg_butir" },
    { id: "box", sku: "B01", name: "Kotak", stockUnit: "pcs" },
  ],
  lots: [
    { id: "f", storeId: "a", productId: "fruit", quality: "ready", kg: 64, pieces: 32 },
    { id: "o", storeId: "a", productId: "other", quality: "ready", kg: 2, pieces: 1 },
  ],
  fruitUnits: labels.map((barcode, i) => ({
    barcode,
    storeId: i === 31 ? "b" : "a",
    lotId: i === 30 ? "o" : "f",
    productId: i === 30 ? "other" : "fruit",
    status: "available",
    grams: 2000,
  })),
  outboundOrders: [
    {
      id: "pre",
      status: "ready",
      items: [{ barcode: labels[32] }],
      rates: [{ kind: "unit", sourceLotId: "old", qty: 1 }],
    },
  ],
  unitLots: [
    {
      id: "new",
      storeId: "a",
      productId: "box",
      unit: "pcs",
      date: "2026-11-20",
      qty: 5,
    },
    {
      id: "old",
      storeId: "a",
      productId: "box",
      unit: "pcs",
      date: "2026-11-01",
      qty: 3,
    },
    {
      id: "foreign",
      storeId: "b",
      productId: "box",
      unit: "pcs",
      date: "2026-10-01",
      qty: 100,
    },
    {
      id: "expired",
      storeId: "a",
      productId: "box",
      unit: "pcs",
      date: "2020-01-01",
      expiry: "2020-02-01",
      qty: 100,
    },
  ],
};
const modal = makeModal(),
  calls = [];
const dialog = openDispatch(state, "a", {
  workspace: "backoffice",
  modal: modal.modal,
  getState: () => state,
  render() {},
  toast() {},
  async mutate(action, payload, opts) {
    calls.push({ action, payload, opts });
  },
});
const get = (sel) => dialog.querySelector(sel);
const form = get("form"),
  submit = get('[type="submit"]');
async function enter(node, value, event = "input") {
  node.value = value;
  await node.fire(event);
}
assert.equal(get('[name="fromStoreId"]').value, "");
assert(get('[name="toStoreId"]').disabled);
await enter(get('[name="fromStoreId"]'), "b", "change");
assert.deepEqual(
  get('[name="toStoreId"]').options.map((o) => o.value),
  ["", "a"],
);
await enter(get('[name="fromStoreId"]'), "a", "change");
assert.deepEqual(
  get('[name="toStoreId"]').options.map((o) => o.value),
  ["", "b"],
);
assert.deepEqual(
  get('[name="senderId"]').options.map((o) => o.value),
  ["", "employee"],
);
await enter(get('[name="toStoreId"]'), "b", "change");
await enter(get('[name="senderId"]'), "employee", "change");
assert.equal(submit.disabled, true);
const product = get("[data-product]");
await enter(product, "Mont");
assert.match(get("[data-line-error]").textContent, /master SKU/);
await enter(product, "D01", "change");
assert.match(product.value, /Monthong/);
assert.match(get("[data-stock]").textContent, /30 butir/);
const scan = get("[data-scan]");
async function scanLabel(code) {
  await enter(scan, code);
  await get("[data-add-code]").fire("click");
}
for (const [i, error] of [
  [30, /SKU/],
  [31, /tidak tersedia/],
  [32, /tidak tersedia/],
]) {
  await scanLabel(labels[i]);
  assert.match(get("[data-scan-result]").textContent, error);
}
await scanLabel(labels[0]);
assert.equal(product.readOnly, true);
await scanLabel(labels[0]);
assert.match(get("[data-scan-result]").textContent, /sudah masuk/);
assert.equal(submit.disabled, true);
await enter(scan, "");
await get("[data-codes] button").fire("click");
assert.equal(product.readOnly, false);
for (const label of labels.slice(0, 30)) await scanLabel(label);
assert.equal(get("[data-count]").textContent, "30 butir · 60 kg");
assert.equal(submit.disabled, false);
await get("[data-add-line]").fire("click");
const second = dialog.querySelectorAll("[data-product]")[1];
await enter(second, "Monthong", "change");
assert.ok(
  dialog
    .querySelectorAll("[data-line-error]")
    .every((e) => e.textContent.includes("sudah ada")),
);
await enter(second, "Kotak", "change");
const quantity = dialog.querySelectorAll("[data-qty]")[1];
assert.match(dialog.querySelectorAll("[data-stock]")[1].textContent, /7 pcs/);
await enter(quantity, "8");
assert.match(
  dialog.querySelectorAll("[data-line-error]")[1].textContent,
  /melebihi stok/,
);
assert.equal(submit.disabled, true);
await enter(quantity, "1.5");
assert.match(
  dialog.querySelectorAll("[data-line-error]")[1].textContent,
  /bilangan bulat/,
);
await enter(quantity, "3");
assert.equal(submit.disabled, false);
approve = false;
await form.fire("submit");
assert.equal(calls.length, 0);
approve = true;
state.unitLots[0].qty = 0;
await form.fire("submit");
assert.equal(calls.length, 0);
assert.match(get("#form-error").textContent, /melebihi stok/);
assert.match(dialog.querySelectorAll("[data-stock]")[1].textContent, /2 pcs/);
state.unitLots[0].qty = 5;
await enter(quantity, "2");
state.fruitUnits[0].status = "sold";
await form.fire("submit");
assert.equal(calls.length, 0);
assert.match(get("#form-error").textContent, /tidak tersedia/);
state.fruitUnits[0].status = "available";
await enter(quantity, "3");
await form.fire("submit");
assert.equal(calls.length, 1);
const { action, payload, opts } = calls[0];
assert.equal(action, "transfer_dispatch");
assert.equal(opts.throwOnError, true);
assert.equal(payload.storeId, "a");
assert.equal(payload.toStoreId, "b");
assert.equal(payload.carrier, "Agus");
assert.equal(payload.senderEmployeeId, "employee");
assert.deepEqual(payload.barcodes, labels.slice(0, 30));
assert.deepEqual(payload.units, [
  { lotId: "old", qty: 2 },
  { lotId: "new", qty: 1 },
]);
assert.ok(dialog.closed);

assert.deepEqual(
  allocateBranchUnits(
    [
      { id: "x", productId: "p", unit: "kg", available: { qty: 0.1 } },
      { id: "y", productId: "p", unit: "kg", available: { qty: 0.2 } },
    ],
    { id: "p", stockUnit: "kg" },
    0.3,
  ),
  [
    { lotId: "x", qty: 0.1 },
    { lotId: "y", qty: 0.2 },
  ],
);
