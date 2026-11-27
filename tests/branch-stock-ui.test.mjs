import assert from "node:assert/strict";
import { workspaceGroups, spacesFor, defaultSpace } from "../pos/workspaces.mjs";
import { receivingPage } from "../pos/receiving-session-ui.mjs";
import { Node, makeModal } from "./variant-dom.mjs";
import { bindCostPrices, costPricesPage } from "../pos/cost-prices-ui.mjs";
import { transfersPage, supplyHome } from "../pos/warehouse-ui.mjs";
import {
  scanForDispatch,
  transferPreview,
  transferDocument,
} from "../pos/warehouse-flow.mjs";

const origin = { id: "ckr", name: "Cikarang", locationType: "store" };
const destination = { id: "hi", name: "Harapan Indah", locationType: "store" };
const warehouse = { id: "wh", name: "Gudang lama", locationType: "warehouse" };
const note = (id, storeId) => ({
  id,
  storeId,
  invoiceNo: id,
  shippingCost: 0,
  date: "2026-11-27",
  lines: [],
  receiving: { status: "open", scans: [] },
});
const barcode = "92012611260000019913002000";
const state = {
  warehouseVersion: 107,
  warehouseWorkflowVersion: 114,
  branchStockVersion: 132,
  access: { stock: true, receive: true },
  stores: [warehouse, origin, destination],
  locations: [warehouse, origin, destination],
  receiptPlans: [note("SUP-CKR", origin.id), note("SUP-HI", destination.id)],
  products: [
    { id: "durian", name: "Durian" },
    { id: "box", name: "Kotak" },
  ],
  fruitUnits: [
    {
      barcode,
      storeId: origin.id,
      lotId: "lot",
      productId: "durian",
      status: "available",
      grams: 2000,
    },
  ],
  lots: [{ id: "lot", storeId: origin.id, quality: "ready", kg: 2 }],
  unitLots: [{ id: "pack", storeId: origin.id, productId: "box", unit: "pcs", qty: 5 }],
};

assert.deepEqual(spacesFor(state), ["store"]);
assert.equal(defaultSpace({ ...state, unitLots: [{ storeId: "wh", qty: 2 }] }), "store");
assert.ok(
  spacesFor({ ...state, unitLots: [{ storeId: "wh", qty: 2 }] }).includes("warehouse"),
);
const pages = (workspace, access) =>
  workspaceGroups({ workspace, branchStock: true, ...access }).flatMap(
    (group) => group.pages,
  );
assert.ok(!pages("store", state.access).includes("transfers"));
assert.ok(!pages("store", { receive: true }).includes("transfers"));
const bo = { ...state, access: { backoffice: true, stock: true, finance: true } };
for (const page of ["costPrices", "transfers"]) {
  assert.ok(pages("backoffice", bo.access).includes(page));
  assert.ok(!pages("store", bo.access).includes(page));
}
assert.ok(pages("store", state.access).includes("receiving"));
assert.doesNotMatch(supplyHome(state, origin.id, "store"), /Kirim ke cabang/);
assert.doesNotMatch(costPricesPage(state, origin.id, "backoffice"), /data-cost-prices/);
assert.equal(costPricesPage(bo, origin.id, "store"), "");
const costState = {
  ...bo,
  suppliers: [{ id: "s", name: "Pemasok" }],
  lots: [
    {
      id: "old",
      storeId: origin.id,
      productId: "durian",
      receivedKg: 10,
      receivedPieces: 5,
      unitCost: 50000,
      kg: 4,
      pieces: 2,
      shipmentId: "receipt",
      supplierId: "s",
    },
    {
      id: "moved",
      storeId: destination.id,
      sourceLotId: "old",
      productId: "durian",
      receivedKg: 6,
      receivedPieces: 3,
      unitCost: 50000,
      kg: 2,
      pieces: 1,
    },
    {
      id: "second",
      storeId: destination.id,
      productId: "durian",
      kg: 2,
      pieces: 1,
      unitCost: 60000,
    },
  ],
  unitLots: [
    {
      id: "pack",
      storeId: destination.id,
      productId: "box",
      unit: "pcs",
      qty: 3,
      unitCost: 1200,
    },
  ],
  receiptPlans: [{ id: "plan", receivedId: "receipt", invoiceNo: "SUP-01" }],
};
const noBatch = [
  { id: "raw", name: "Gula", sku: "BB-GULA", stockUnit: "g", itemType: "raw" },
  {
    id: "recipe",
    name: "Es duren",
    sku: "ES-MENU",
    stockUnit: "porsi",
    itemType: "recipe",
  },
];
costState.products = [...costState.products, ...noBatch];
const root = new Node("main"),
  modal = makeModal();
globalThis.document = { querySelector: (selector) => root.querySelector(selector) };
root.innerHTML = costPricesPage(costState, destination.id, "backoffice");
let current = costState;
const ctx = {
  workspace: "backoffice",
  getState: () => current,
  modal: modal.modal,
  refresh: async () => {
    current = {
      ...current,
      products: [
        ...current.products,
        { id: "new", name: "Gula cair", sku: "BB-GULA-CAIR", stockUnit: "ml" },
      ],
    };
  },
};
bindCostPrices(costState, destination.id, ctx);
const select = root.querySelector("[data-cost-store]"),
  search = root.querySelector("[data-cost-search]"),
  list = root.querySelector("[data-cost-rows]");
assert.equal(select.value, destination.id);
assert.equal(
  list.querySelectorAll("[data-cost-product]").length,
  costState.products.length,
);
for (const label of [
  "50.000",
  "100.000",
  "60.000",
  "1.200",
  "/pcs",
  "BB-GULA",
  "ES-MENU",
  "Belum tersedia",
])
  assert.ok(list.textContent.includes(label), label);
for (const { id } of noBatch)
  assert.ok(list.querySelector('[data-cost-detail="' + id + '"]').disabled);
assert.equal(list.querySelectorAll("input").length, 0);
list.onclick({ target: list.querySelector('[data-cost-detail="durian"]') });
for (const label of ["SUP-01", "Pemasok", "50.000", "60.000", "100.000"])
  assert.ok(modal.latest.textContent.includes(label), label);
assert.ok(modal.latest.querySelector('[data-cost-note="plan"]'));
assert.doesNotMatch(modal.latest.textContent, /4 kg · 2 butir/);
select.value = origin.id;
await select.fire("change");
assert.doesNotMatch(list.textContent, /60.000|1.200/);
search.value = "bb-gula";
await search.fire("input");
assert.equal(list.querySelectorAll("[data-cost-product]").length, 1);
await root.querySelector("[data-cost-refresh]").fire("click");
assert.equal(select.value, origin.id);
assert.equal(list.querySelectorAll("[data-cost-product]").length, 2);
search.value = "SUP-01";
await search.fire("input");
assert.equal(list.querySelectorAll("[data-cost-product]").length, 1);
search.value = "tidak cocok";
await search.fire("input");
assert.match(list.textContent, /tidak ditemukan/);
const branchPage = receivingPage(state, origin.id, "store");
assert.match(branchPage, /SUP-CKR/);
assert.doesNotMatch(branchPage, /SUP-HI|data-note-new/);
const officePage = receivingPage(
  { ...state, access: { backoffice: true } },
  origin.id,
  "backoffice",
);
assert.match(officePage, /Lokasi penerima/);
assert.match(officePage, /Harapan Indah/);
assert.match(officePage, /data-note-new/);
assert.doesNotMatch(transfersPage(state, origin.id, false, "store"), /data-transfer-new/);
assert.doesNotMatch(transfersPage(bo, origin.id, false, "store"), /data-transfer-new/);
assert.match(transfersPage(bo, origin.id, false, "backoffice"), /data-transfer-new/);
assert.doesNotMatch(
  transfersPage(state, destination.id, true, "store"),
  /data-transfer-new/,
);
assert.equal(scanForDispatch(state, origin.id, barcode).barcode, barcode);
assert.throws(() => scanForDispatch(state, destination.id, barcode), /lokasi asal/);
const lines = transferPreview(state, [barcode], [{ lotId: "pack", qty: 3 }]);
assert.deepEqual(
  lines.map((l) => [l.sourceLotId, l.qty, l.price]),
  [
    ["lot", 2, null],
    ["pack", 3, null],
  ],
);
const doc = transferDocument(
  {
    invoiceNo: null,
    deliveryNo: "SJ-CBG-001",
    lines: [{ ...lines[0], kind: "fruit" }, lines[1]],
    items: [{ barcode, grams: 2000 }],
    origin,
    destination,
    status: "in_transit",
    createdAt: "2026-11-27",
    carrier: "Rian",
  },
  "invoice",
);
assert.match(doc, /SURAT JALAN MUTASI ANTARCABANG/);
assert.match(doc, /Cikarang/);
assert.match(doc, /Harapan Indah/);
assert.match(doc, new RegExp(barcode));
assert.doesNotMatch(doc, /Total tagihan|Harga satuan|INVOICE TRANSFER|Disiapkan gudang/);
