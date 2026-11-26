import { pricingPage } from "../pos/warehouse-ui.mjs";
import assert from "node:assert/strict";
import { Node, makeModal } from "./variant-dom.mjs";
import {
  receiptVariance,
  receiptTotals,
  saveWorkflow,
  loadWorkflowPending,
  clearWorkflowPending,
} from "../pos/warehouse-workflow.mjs";
import { receivingPage, openReceivingSession } from "../pos/receiving-session-ui.mjs";
import { outboundPage, openOutbound, openOutboundForm } from "../pos/outbound-ui.mjs";
import { applySupplyResponse, transferDocument } from "../pos/warehouse-flow.mjs";
import { openSupplierNote } from "../pos/supplier-notes-ui.mjs";
const p = {
  id: "plan",
  invoiceNo: "<img src=x>",
  supplierId: "supplier",
  storeId: "wh",
  date: "2026-11-16",
  revision: 1,
  shippingCost: 10000,
  lines: [{ productId: "fruit", purchaseCost: 500000 }],
  expected: { fruit: { kg: 10, pieces: 5 } },
  receiving: {
    status: "open",
    revision: 1,
    scans: [{ barcode: "92011611260000010001002000", grams: 2000, productId: "fruit" }],
  },
};
let s = {
  me: { userId: "owner", role: "owner" },
  access: { backoffice: true, finance: true },
  warehouseWorkflowVersion: 114,
  warehouseVersion: 107,
  supplierNotesVersion: 112,
  receiptPlans: [p],
  outboundOrders: [],
  supplyEvents: [],
  locations: [{ id: "wh", name: "Gudang", locationType: "warehouse" }],
  stores: [{ id: "wh", name: "Gudang" }],
  lots: [],
  products: [{ id: "fruit", name: "Monthong <script>", stockUnit: "kg_butir" }],
  suppliers: [{ id: "supplier", name: "Supplier <script>" }],
};
assert.deepEqual(receiptTotals(p), { kg: 2, pieces: 1 });
assert.equal(receiptVariance(p, "fruit").percent, null);
const complete = { ...p, receiving: { ...p.receiving, status: "completed" } };
assert.equal(receiptVariance(complete, "fruit").percent, 80);
assert.equal(receiptVariance({ ...complete, expected: {} }, "fruit").percent, null);
assert.equal(
  receiptVariance({ ...complete, expected: { fruit: { kg: 1, pieces: 1 } } }, "fruit")
    .percent,
  -100,
);
assert(!pricingPage(s).includes("data-transfer-price"));
const operational = receivingPage(s, "wh", "warehouse");
assert(!operational.includes("500.000"));
assert(!operational.includes("data-note-new"));
assert(!operational.includes("Pembayaran"));
assert(receivingPage(s, "wh", "backoffice").includes("data-note-new"));
assert(!operational.includes("<script>"));
const map = new Map(),
  storage = {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
globalThis.localStorage = storage;
const request = {
    id: "stable-id",
    planId: "plan",
    barcode: p.receiving.scans[0].barcode,
  },
  calls = [];
await assert.rejects(
  saveWorkflow(
    s,
    "plan",
    {
      mutate: async (a, b) => {
        calls.push([a, b]);
        throw Error("offline");
      },
    },
    "receipt_scan",
    request,
    storage,
  ),
  /offline/,
);
assert.equal(loadWorkflowPending(s, "plan", storage).payload.id, "stable-id");
assert.equal(
  loadWorkflowPending({ ...s, me: { userId: "someone-else" } }, "plan", storage),
  null,
);
await assert.rejects(
  saveWorkflow(
    s,
    "plan",
    {
      mutate: async () => {
        throw Error("should not execute");
      },
    },
    "receipt_scan",
    { ...request, barcode: "other" },
    storage,
  ),
  /belum pasti/,
);
await saveWorkflow(
  s,
  "plan",
  { mutate: async (a, b) => calls.push([a, b]) },
  "receipt_scan",
  { ...request, id: "new-click-id" },
  storage,
);
assert.equal(calls[1][1].id, "stable-id");
assert.equal(loadWorkflowPending(s, "plan", storage), null);
await assert.rejects(
  saveWorkflow(
    s,
    "plan",
    {
      mutate: async () => {
        throw Object.assign(Error("rejected"), { definitive: true });
      },
    },
    "receipt_scan",
    request,
    storage,
  ),
);
assert.equal(loadWorkflowPending(s, "plan", storage), null);
const body = new Node("body");
Node.prototype.prepend = function (n) {
  this.insertBefore(n, this.children[0] || null);
};
globalThis.document = {
  body,
  createElement: (tag) => new Node(tag),
  querySelector: (q) => body.querySelector(q),
  querySelectorAll: (q) => body.querySelectorAll(q),
};
globalThis.confirm = () => true;
const adapter = makeModal();
let renders = 0;
const ctx = {
  workspace: "warehouse",
  getState: () => s,
  render: () => renders++,
  refresh: async () => {},
  modal: (...a) => {
    const d = adapter.modal(...a);
    body.append(d);
    return d;
  },
  mutate: async (a, b) => {
    calls.push([a, b]);
    s = applySupplyResponse(s, {
      supplyDelta: true,
      planId: "plan",
      receiving: {
        ...s.receiptPlans[0].receiving,
        revision: s.receiptPlans[0].receiving.revision + 1,
        status:
          a === "receipt_pause"
            ? "paused"
            : a === "receipt_finish"
              ? "completed"
              : "open",
      },
      event: { id: b.id, action: a },
    });
  },
};
// A failed label must report beside the scanner without changing saved rows.
{
  const originalScans = p.receiving.scans;
  const first = originalScans[0].barcode;
  const second = "92011611260000020001002000";
  const third = "92011611260000030001002000";
  let receiptState = s;
  const scanCtx = {
    ...ctx,
    getState: () => receiptState,
    mutate: async (action, payload) => {
      assert.equal(action, "receipt_scan");
      if (payload.barcode.length !== 26)
        throw Object.assign(Error("Gunakan barcode tracking 26 digit"), {
          definitive: true,
        });
      receiptState = applySupplyResponse(receiptState, {
        supplyDelta: true,
        planId: p.id,
        receiving: {
          status: "open",
          revision: receiptState.receiptPlans[0].receiving.revision + 1,
          scanChanges: [{ ...originalScans[0], barcode: payload.barcode }],
        },
        event: { id: payload.id, action },
      });
    },
  };
  let dialog = openReceivingSession(receiptState, p.id, scanCtx);
  const rows = () =>
    dialog.querySelectorAll("[data-receiving-barcodes] code").map((el) => el.textContent);
  const scan = async (code) => {
    dialog.querySelector("[data-session-code]").value = code;
    await dialog.querySelector("[data-session-scan]").fire("click");
    assert.equal(Node.activeElement, dialog.querySelector("[data-session-code]"));
  };
  await scan(second);
  assert.deepEqual(rows(), [second, first]);
  await scan("8991102026352");
  const feedback = dialog.querySelector("#form-error");
  assert.equal(dialog.querySelector(".supply-scan").parentNode.nextSibling, feedback);
  assert.equal(feedback.textContent, "Gunakan barcode tracking 26 digit");
  assert.deepEqual(rows(), [second, first]);
  await scan(third);
  assert.match(feedback.textContent, new RegExp(third + ".*tersimpan"));
  assert.deepEqual(rows(), [third, second, first]);
  assert.deepEqual(
    receiptState.receiptPlans[0].receiving.scans.map((x) => x.barcode),
    [first, second, third],
  );
  dialog.close();
  dialog = openReceivingSession(receiptState, p.id, scanCtx);
  assert.deepEqual(rows(), [third, second, first]);
  assert.equal(dialog.querySelector("#form-error").textContent, "");
  dialog.close();
}
// Use the normal modal handlers to switch costs, build two rates and restore a legacy draft.
{
  const lots = ["A", "B", "reserved"].map((id, i) => ({
    id,
    productId: "fruit",
    storeId: "wh",
    quality: "ready",
    receivedKg: 10,
    receivedPieces: 5,
    kg: 3,
    pieces: 1,
    unitCost: 50000 + i * 10000,
  }));
  const state = {
    ...s,
    outboundBatchVersion: 126,
    lots,
    fruitUnits: lots.map((l) => ({
      lotId: l.id,
      barcode: l.id,
      grams: 3000,
      status: "available",
      storeId: "wh",
    })),
    outboundOrders: [{ id: "other", status: "ready", items: [{ barcode: "reserved" }] }],
  };
  const bo = {
    ...ctx,
    getState: () => state,
    workspace: "backoffice",
    modal: (...args) => {
      const d = ctx.modal(...args);
      const form = d.querySelector("form");
      Object.defineProperty(form, "elements", {
        value: Object.fromEntries(
          form.querySelectorAll("[name]").map((el) => [el.name, el]),
        ),
      });
      return d;
    },
    mutate: async (action, payload) => calls.push([action, payload]),
  };
  assert.equal(openOutboundForm(state, "wh", ctx), undefined);
  const dialog = openOutboundForm(state, "wh", bo);
  const row = (i) => dialog.querySelector(`[data-rate-row="${i}"]`);
  const field = async (el, selector, value, event = "change") => {
    const input = el.querySelector(selector);
    input.value = value;
    await input.fire(event);
  };
  assert.deepEqual(
    row(0)
      .querySelector("[data-rate-batch]")
      .options.map((x) => x.value),
    ["", "A", "B"],
  );
  await field(row(0), "[data-rate-batch]", "B");
  assert.match(row(0).querySelector("[data-batch-cost]").textContent, /120\.000/);
  await field(row(0), "[data-rate-price]", "120000", "input");
  await field(row(0), "[data-rate-batch]", "A");
  assert.match(row(0).querySelector("[data-batch-cost]").textContent, /50\.000/);
  assert.equal(row(0).querySelector("[data-rate-price]").value, "");
  await field(row(0), "[data-rate-price]", "80000", "input");
  await dialog.querySelector("[data-rate-add]").fire("click");
  assert.deepEqual(
    row(1)
      .querySelector("[data-rate-batch]")
      .options.map((x) => x.value),
    ["", "B"],
  );
  await field(row(1), "[data-rate-batch]", "B");
  await field(row(1), "[data-rate-unit]", "butir");
  await field(row(1), "[data-rate-price]", "150000", "input");
  await dialog.querySelector("form").fire("submit");
  assert.deepEqual(calls.at(-1)[1].rates, [
    { productId: "fruit", sourceLotId: "A", unit: "kg", price: 80000 },
    { productId: "fruit", sourceLotId: "B", unit: "butir", price: 150000 },
  ]);
  state.outboundBatchVersion = 131;
  state.products = [
    ...state.products,
    { id: "susu", name: "Susu", stockUnit: "ml", itemType: "raw" },
  ];
  state.unitLots = [
    { id: "milk", productId: "susu", storeId: "wh", unit: "ml", qty: 100, unitCost: 200 },
    {
      id: "old",
      productId: "susu",
      storeId: "wh",
      unit: "ml",
      qty: 20,
      expiry: "2000-01-01",
    },
    { id: "branch", productId: "susu", storeId: "shop", unit: "ml", qty: 50 },
  ];
  state.outboundOrders.push({
    id: "reserved-unit",
    status: "approved",
    items: [],
    rates: [{ kind: "unit", sourceLotId: "milk", qty: 10.5 }],
  });
  const mixed = openOutboundForm(state, "wh", bo);
  const mr = (i) => mixed.querySelector(`[data-rate-row="${i}"]`);
  await field(mr(0), "[data-rate-batch]", "A");
  await field(mr(0), "[data-rate-price]", "70000", "input");
  await mixed.querySelector("[data-rate-add]").fire("click");
  await field(mr(1), "[data-rate-product]", "susu");
  assert.deepEqual(
    mr(1)
      .querySelector("[data-rate-batch]")
      .options.map((x) => x.value),
    ["", "milk"],
  );
  await field(mr(1), "[data-rate-batch]", "milk");
  const preview = mr(1).querySelector("[data-batch-cost]").textContent;
  for (const text of ["Modal/ml", "200", "89,5 ml"]) assert.ok(preview.includes(text));
  await field(mr(1), "[data-rate-qty]", "12.5", "input");
  await field(mr(1), "[data-rate-price]", "250", "input");
  await mixed.querySelector("form").fire("submit");
  assert.deepEqual(calls.at(-1)[1].rates[1], {
    kind: "unit",
    sourceLotId: "milk",
    productId: "susu",
    unit: "ml",
    qty: 12.5,
    price: 250,
  });
  const only = openOutboundForm(
    { ...state, products: state.products.filter((p) => p.id === "susu") },
    "wh",
    bo,
  );
  assert.ok(only.querySelector("[data-rate-qty]"));
  only.close();
  const unitOrder = {
    id: "milk-shipment",
    status: "packing",
    kind: "transfer",
    rates: [calls.at(-1)[1].rates[1]],
    items: [],
    revision: 7,
  };
  state.outboundOrders.push(unitOrder);
  const warehouse = { ...bo, workspace: "warehouse" };
  const detail = openOutbound(state, unitOrder.id, warehouse);
  assert.ok(!detail.querySelector("[data-outbound-code]"));
  await detail.querySelector("[data-outbound-ready]").fire("click");
  const count = adapter.latest;
  count.querySelector("[data-packed-lot]").value = "12.5";
  await count.querySelector("form").fire("submit");
  assert.equal(calls.at(-1)[0], "outbound_ready");
  assert.deepEqual(calls.at(-1)[1].unitCounts, { milk: "12.5" });
  adapter.latest.close();
  const legacy = openOutboundForm(state, "wh", bo, {
    id: "legacy",
    rates: [{ productId: "fruit", unit: "kg", price: 90000 }],
    items: ["B", "A", "B"].map((sourceLotId) => ({ productId: "fruit", sourceLotId })),
  });
  assert.deepEqual(
    legacy.querySelectorAll("[data-rate-batch]").map((el) => el.value),
    ["B", "A"],
  );
  legacy.close();
}
let d = openReceivingSession(s, "plan", ctx);
assert(d.querySelector("[data-session-code]"));
assert(!d.textContent.includes("500.000"));
await d.querySelector("[data-session-pause]").fire("click");
assert.equal(s.receiptPlans[0].receiving.status, "paused");
assert(!d.querySelector("[data-session-code]"));
await d.querySelector("[data-session-resume]").fire("click");
assert.equal(s.receiptPlans[0].receiving.status, "open");
await d.querySelector("[data-session-finish]").fire("click");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(s.receiptPlans[0].receiving.status, "completed");
assert(!d.querySelector("[data-session-code]"));
d.close();
d = openSupplierNote(s, s.receiptPlans[0], { ...ctx, workspace: "backoffice" });
assert(d.querySelector("[data-expected-edit]"));
assert(d.querySelector("[data-receipt-reopen]"));
assert(d.textContent.includes("80%"));
assert.equal(d.querySelectorAll("script,img").length, 0);
const o = {
  id: "out",
  kind: "wholesale",
  invoiceNo: "INV-114",
  deliveryNo: "SJ-114",
  createdAt: "2026-11-16T00:00:00Z",
  status: "approved",
  sourceId: "wh",
  origin: { name: "Gudang" },
  destination: { name: "<img src=x>" },
  buyer: { name: "<img src=x>" },
  carrier: "Kurir",
  rates: [{ productId: "fruit", unit: "kg", price: 90000 }],
  lines: [
    {
      kind: "fruit",
      productId: "fruit",
      productName: "Monthong",
      sourceLotId: "lot",
      kg: 2,
      pieces: 1,
      unit: "kg",
      price: 90000,
      total: 180000,
    },
  ],
  items: [{ barcode: request.barcode, grams: 2000, productId: "fruit" }],
  total: 180000,
  paid: 0,
  paymentMode: "pending",
};
s = applySupplyResponse(s, { supplyDelta: true, outbound: o, event: { id: "event2" } });
assert.equal(s.receiptPlans.length, 1);
assert.equal(s.outboundOrders.length, 1);
assert(!outboundPage(s, "wh", "warehouse").includes("180.000"));
assert(outboundPage(s, "wh", "backoffice").includes("180.000"));
assert(transferDocument(o, "invoice").includes("INVOICE WHOLESALE"));
assert(!transferDocument(o, "delivery").includes("180.000"));
assert(!transferDocument(o).includes("<img src=x>"));
const delta = applySupplyResponse(s, {
  supplyDelta: true,
  planId: "plan",
  receiving: {
    status: "open",
    revision: 9,
    scanChanges: [{ barcode: "new", productId: "fruit", grams: 1000 }],
    removedBarcode: null,
  },
  event: { id: "delta" },
});
assert.equal(delta.receiptPlans[0].receiving.scans.length, 2);
const removed = applySupplyResponse(delta, {
  supplyDelta: true,
  planId: "plan",
  receiving: { status: "open", revision: 10, scanChanges: [], removedBarcode: "new" },
  event: { id: "delta2" },
});
assert.equal(removed.receiptPlans[0].receiving.scans.length, 1);
const outDelta = applySupplyResponse(s, {
  supplyDelta: true,
  outbound: { ...o, itemsDelta: true, items: [{ barcode: "new-out", grams: 3000 }] },
  event: { id: "delta3" },
});
assert.equal(outDelta.outboundOrders[0].items.length, 2);
clearWorkflowPending(s, "plan", storage);
assert(renders > 0);
console.log(
  "PASS workflow UI/model: expected vs actual variance, unknown/excess weights, role/workspace privacy, durable retry identity, user isolation, pause/resume/finish controls, office reopening, escaped invoices and delta merging.",
);
