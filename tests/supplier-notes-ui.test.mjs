import assert from "node:assert/strict";
import { Node, makeModal } from "./variant-dom.mjs";
import {
  noteBalance,
  noteMoney,
  noteOwner,
  noteUnitCosts,
} from "../pos/supplier-notes.mjs";
import { money } from "../pos/core.mjs";
import { openSupplierNote } from "../pos/supplier-notes-ui.mjs";
import { supplierNotesPage, bindSupply } from "../pos/warehouse-ui.mjs";
Object.defineProperties(Node.prototype, {
  elements: {
    get() {
      return new Proxy({}, { get: (_, key) => this.querySelector(`[name="${key}"]`) });
    },
  },
  isConnected: {
    get() {
      return !!this.closest("body");
    },
  },
});
const body = new Node("body");
globalThis.document = {
  body,
  querySelector: (s) => body.querySelector(s),
  querySelectorAll: (s) => body.querySelectorAll(s),
};
const p = {
  id: "plan",
  invoiceNo: "NOTA <img src=x>",
  supplierId: "supplier",
  storeId: "wh",
  date: "2026-11-13",
  receivedId: "receipt",
  revision: 4,
  shippingCost: 20,
  lines: [{ productId: "fruit", purchaseCost: 100.3 }],
  payments: [],
};
let s = {
  supplierNotesVersion: 112,
  warehouseVersion: 107,
  me: { role: "owner" },
  access: { backoffice: true, finance: true },
  receiptPlans: [p],
  suppliers: [{ id: "supplier", name: "Supplier <script>" }],
  stores: [{ id: "wh", name: "Gudang", locationType: "warehouse" }],
  products: [{ id: "fruit", name: "Monthong <img src=x>" }],
  lots: [],
};
const adapter = makeModal(),
  calls = [];
let rejectOnce = false,
  release;
const ctx = {
  getState: () => s,
  render() {},
  modal(title, html, submit) {
    const d = adapter.modal(title, html, submit);
    body.append(d);
    return d;
  },
  async mutate(action, payload, options) {
    calls.push({ action, payload, options });
    if (rejectOnce) {
      rejectOnce = false;
      throw Error("Koneksi terputus");
    }
    if (release)
      await new Promise((resolve) => {
        release = resolve;
      });
    s = {
      ...s,
      receiptPlans: [{ ...s.receiptPlans[0], revision: s.receiptPlans[0].revision + 1 }],
    };
  },
};
const set = (d, n, v) => (d.querySelector(`[name="${n}"]`).value = v);
const submit = () => adapter.latest.querySelector("form").fire("submit");
body.innerHTML = supplierNotesPage(s, "wh");
bindSupply(s, "wh", "supplierNotes", ctx);
assert(body.querySelector("[data-note-open]"), "received note can be reopened");
assert(!body.querySelector("[data-note-receive]"));
await body.querySelector("[data-note-open]").fire("click");
let d = adapter.latest;
assert(d.textContent.includes("Belum dicatat"));
assert.equal(d.querySelectorAll("img,script").length, 0);
await d.querySelector('[data-note-pay="shipping"]').fire("click");
d = adapter.latest;
set(d, "amount", "10");
set(d, "date", "2026-11-14");
set(d, "reference", "0000123");
rejectOnce = true;
await submit();
assert.match(d.querySelector("#form-error").textContent, /Koneksi/);
assert(!d.closed);
assert(!d.querySelector('[type="submit"]').disabled);
await submit();
assert(d.closed);
assert.equal(calls[0].payload.id, calls[1].payload.id);
assert.equal(calls[1].payload.component, "shipping");
assert.equal(calls[1].payload.amount, 10);
assert.equal(calls[1].payload.expectedRevision, 4);
assert.equal(calls[1].payload.reference, "0000123");
assert.equal(calls[1].options.throwOnError, true);
// Fresh detail uses the returned revision for the next operation.
d = adapter.latest;
await d.querySelector("[data-note-correct]").fire("click");
d = adapter.latest;
set(d, "cost0", "120.35");
set(d, "shippingCost", "0");
set(d, "reason", "Ongkir ditanggung supplier");
d.querySelector('[name="confirmed"]').checked = true;
release = true;
const pending = submit();
await Promise.resolve();
const count = calls.length;
await submit();
assert.equal(calls.length, count, "double submit cannot create a second mutation");
release();
release = null;
await pending;
assert.equal(calls.at(-1).payload.expectedRevision, 5);
assert.deepEqual(calls.at(-1).payload.lines, [
  { productId: "fruit", purchaseCost: 120.35 },
]);
assert.equal(calls.at(-1).payload.ownerConfirmed, true);
for (const role of ["admin", "warehouse", "cashier"]) {
  const state = {
    ...s,
    me: { role },
    access: { backoffice: role === "admin", finance: role === "admin" },
  };
  d = openSupplierNote(state, p, ctx);
  assert(!d.querySelector("[data-note-correct]"));
  assert.equal(!!d.querySelector("[data-note-pay]"), role === "admin");
}
assert(!noteOwner({ ...s, stockDemo: true }));
d = openSupplierNote({ ...s, stockDemo: true }, p, ctx);
assert.match(d.textContent, /Mode demo aktif/);
assert(!d.querySelector("[data-note-pay]"));
d = openSupplierNote({ ...s, supplierNotesVersion: undefined }, p, ctx);
assert(!d.querySelector("[data-note-pay]"));
assert.match(d.textContent, /pembaruan nota supplier 112/);
const withPayments = {
  ...p,
  invoiceTracked: true,
  shippingTracked: true,
  payments: [
    {
      id: "pay1",
      component: "invoice",
      amount: 0.1,
      reference: "<img src=x>",
      actor: "<script>",
      date: "2026-11-14",
      method: "cash",
    },
    { id: "pay2", component: "invoice", amount: 100.2 },
    { id: "pay3", component: "shipping", amount: 10 },
  ],
};
assert.equal(noteBalance(withPayments, "invoice").status, "paid");
assert.equal(noteBalance(withPayments, "shipping").status, "partial");
assert.equal(
  noteBalance({ ...withPayments, shippingCost: 5 }, "shipping").status,
  "overpaid",
);
assert.equal(noteBalance({ ...p, shippingCost: 0 }, "shipping").status, "none");
assert.equal(noteBalance({ ...p, invoiceTracked: true }, "invoice").status, "unpaid");
assert.equal(
  noteBalance(
    {
      ...p,
      payments: [{ component: "invoice", amount: 100.3, voided: true }],
      invoiceTracked: true,
    },
    "invoice",
  ).paid,
  0,
);
d = openSupplierNote(s, withPayments, ctx);
assert.equal(d.querySelectorAll("img,script").length, 0);
await d.querySelector('[data-note-void="pay1"]').fire("click");
set(adapter.latest, "reason", "Salah catat nomor referensi");
await submit();
assert.equal(calls.at(-1).action, "supplier_note_payment_void");
assert.equal(calls.at(-1).payload.paymentId, "pay1");
d = openSupplierNote(s, p, ctx);
await d.querySelector('[data-note-unpaid="invoice"]').fire("click");
await submit();
assert.equal(calls.at(-1).action, "supplier_note_confirm_unpaid");
for (const value of ["", " ", null, NaN, Infinity, -1, 1.001])
  assert.throws(() => noteMoney(value, true));
assert.equal(noteMoney("150000.25"), 150000.25);
assert.equal(noteMoney("0", true), 0);
// Ratios use landed cost and original receipt quantities, even with no stock left.
const batch = {
  id: "batch",
  shipmentId: "receipt",
  productId: "fruit",
  totalCost: 220000,
  purchaseCost: 200000,
  shippingCost: 20000,
  receivedKg: 6,
  receivedPieces: 3,
  kg: 0,
  pieces: 0,
};
assert.deepEqual(noteUnitCosts(batch), { perKg: 220000 / 6, perPiece: 220000 / 3 });
assert.deepEqual(noteUnitCosts({ ...batch, kg: 2, pieces: 1 }), noteUnitCosts(batch));
assert.deepEqual(noteUnitCosts({ ...batch, totalCost: 270000 }), {
  perKg: 45000,
  perPiece: 90000,
});
assert.deepEqual(noteUnitCosts({ ...batch, totalCost: 0 }), { perKg: 0, perPiece: 0 });
assert.deepEqual(
  noteUnitCosts({ ...batch, receivedKg: "6", receivedPieces: "3", totalCost: "220000" }),
  noteUnitCosts(batch),
);
for (const value of [null, undefined, "", " ", -1, NaN, Infinity, true]) {
  assert.deepEqual(noteUnitCosts({ ...batch, totalCost: value }), {
    perKg: null,
    perPiece: null,
  });
  assert.equal(noteUnitCosts({ ...batch, receivedKg: value }).perKg, null);
  assert.equal(noteUnitCosts({ ...batch, receivedPieces: value }).perPiece, null);
}
assert.equal(noteUnitCosts({ ...batch, receivedPieces: 1.5 }).perPiece, null);
assert.equal(noteUnitCosts({ ...batch, receivedKg: 0 }).perKg, null);
assert.equal(noteUnitCosts({ ...batch, receivedPieces: 0 }).perPiece, null);
assert.deepEqual(noteUnitCosts(), { perKg: null, perPiece: null });
const detailsState = {
  ...s,
  lots: [
    {
      ...batch,
      id: "transferred",
      sourceLotId: "batch",
      totalCost: 500000,
      receivedKg: 2,
      receivedPieces: 1,
    },
    { ...batch, id: "other-shipment", shipmentId: "other", totalCost: 1 },
    batch,
  ],
};
d = openSupplierNote(detailsState, p, ctx);
assert.equal(d.querySelector("[data-note-cost-kg]").textContent, money(220000 / 6));
assert.equal(d.querySelector("[data-note-cost-piece]").textContent, money(220000 / 3));
assert.match(d.textContent, /termasuk alokasi ongkir/);
const callsBeforeViewing = calls.length;
d = openSupplierNote(detailsState, { ...p, receivedId: null }, ctx);
assert.equal(d.querySelector("[data-note-cost-kg]").textContent, "—");
assert.equal(d.querySelector("[data-note-cost-piece]").textContent, "—");
assert.match(d.textContent, /setelah penerimaan selesai/);
d = openSupplierNote({ ...detailsState, lots: [{ ...batch, totalCost: null }] }, p, ctx);
assert.equal(
  d.querySelector("[data-note-cost-kg]").textContent,
  "—",
  "unavailable finance data is not displayed as zero",
);
assert.equal(calls.length, callsBeforeViewing, "opening cost details does not save data");
const unposted = {
  ...p,
  receivedId: null,
  invoiceTracked: true,
  shippingTracked: true,
  receiving: { status: "open", revision: 3, scans: [], quantities: {} },
};
const office = { ...ctx, workspace: "backoffice" };
const capable = {
  ...detailsState,
  access: { backoffice: true, finance: true },
  supplierNoteCancelVersion: 134,
};
d = openSupplierNote(capable, unposted, office);
await d.querySelector("[data-note-cancel]").fire("click");
set(adapter.latest, "reason", "Nota tertukar");
await submit();
assert.equal(calls.at(-1).action, "supplier_note_cancel");
assert.equal(calls.at(-1).payload.expectedSessionRevision, 3);
assert.equal(calls.at(-1).payload.reason, "Nota tertukar");
for (const protectedNote of [
  p,
  { ...unposted, payments: [{ amount: 1, component: "shipping" }] },
  { ...unposted, invoiceTracked: false },
])
  assert(
    !openSupplierNote(capable, protectedNote, office).querySelector("[data-note-cancel]"),
  );
assert(
  !openSupplierNote(capable, unposted, { ...office, workspace: "store" }).querySelector(
    "[data-note-cancel]",
  ),
);
const archivedNote = {
  ...unposted,
  cancelled: { at: "2026-11-27T04:00:00Z", actor: "Admin", reason: "Nota tertukar" },
};
d = openSupplierNote(capable, archivedNote, office);
assert.match(d.textContent, /Nota tertukar/);
assert(
  !d.querySelector(
    "[data-note-pay],[data-note-correct],[data-note-cancel],[data-expected-edit]",
  ),
);
assert.equal(noteBalance(archivedNote, "shipping").remaining, 0);
console.log(
  "PASS supplier note UI: received detail, separate statuses and forms, legacy unknown, owner gate, escaped content, stable retry/revision, double-submit guard, corrections, payment cancellation, landed cost/kg and cost/piece from original receipt quantities.",
);
