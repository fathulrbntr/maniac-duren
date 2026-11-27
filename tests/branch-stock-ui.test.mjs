import assert from "node:assert/strict";
import { workspaceGroups, spacesFor, defaultSpace } from "../pos/workspaces.mjs";
import { receivingPage } from "../pos/receiving-session-ui.mjs";
import { transfersPage } from "../pos/warehouse-ui.mjs";
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
assert.ok(pages("store", state.access).includes("transfers"));
assert.ok(!pages("store", { receive: true }).includes("transfers"));
assert.ok(!pages("backoffice", { backoffice: true }).includes("transfers"));
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
assert.match(transfersPage(state, origin.id, false, "store"), /data-transfer-new/);
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
