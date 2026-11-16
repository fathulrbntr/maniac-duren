import assert from "node:assert/strict";
import { invoiceFixture } from "./helpers/outbound-invoices-fixture.mjs";
import { Node, makeModal } from "./variant-dom.mjs";
import {
  invoiceDate,
  invoicePeriod,
  invoicePaymentStatus,
  outboundInvoiceView,
  saveInvoiceFilters,
  loadInvoiceFilters,
} from "../pos/warehouse-workflow.mjs";
import { outboundPage, bindOutboundPage } from "../pos/outbound-ui.mjs";
import { money } from "../pos/core.mjs";
const day = "2026-11-16",
  filters = { period: "custom", from: day, to: day, payment: "all" };
let s = invoiceFixture();
const before = structuredClone(s);
let v = outboundInvoiceView(s.outboundOrders, filters, day, { transfers: s.transfers });
assert.deepEqual(v.summary, {
  total: 1200000,
  paid: 250000,
  remaining: 950000,
  incomplete: false,
});
assert.equal(v.activeCount, 4);
assert.equal(v.issued.length, 4);
assert.equal(v.drafts.length, 2);
assert.equal(v.cancelled.length, 2);
assert.equal(v.missingDates, 1);
assert(
  v.issued.some((o) => o.id === "late-payment"),
  "late payment remains attributed to the invoice issue period",
);
assert(
  !v.issued.some((o) => o.id === "previous" || o.id === "next" || o.id === "undated"),
);
const paid = outboundInvoiceView(s.outboundOrders, { ...filters, payment: "paid" }, day),
  unpaid = outboundInvoiceView(s.outboundOrders, { ...filters, payment: "unpaid" }, day);
assert.deepEqual(
  paid.issued.map((o) => o.id),
  ["paid"],
);
assert.equal(unpaid.issued.length, 3);
assert(unpaid.issued.some((o) => o.id === "partial"));
assert.deepEqual(paid.summary, v.summary);
assert.deepEqual(unpaid.summary, v.summary);
assert.deepEqual(s, before, "sorting and filtering must not mutate source documents");
assert.equal(invoiceDate("2026-11-16T17:00:00Z"), "2026-11-17");
assert.equal(invoiceDate("2026-11-16T16:59:59.999Z"), day);
assert.equal(invoiceDate("2026-11-16T23:59:59+07:00"), day);
assert.equal(invoiceDate("2026-11-16T23:59:59"), "");
assert.equal(invoiceDate("2026-02-30"), "");
assert.deepEqual(invoicePeriod({ period: "week" }, "2026-11-22"), {
  from: "2026-11-16",
  to: "2026-11-22",
  error: "",
});
assert.deepEqual(invoicePeriod({ period: "month" }, "2024-02-29"), {
  from: "2024-02-01",
  to: "2024-02-29",
  error: "",
});
assert.equal(invoicePeriod({ period: "week" }, "2027-01-01").from, "2026-12-28");
assert.equal(invoicePeriod({ period: "today" }, day).to, day);
for (const f of [
  { ...filters, to: "2026-11-15" },
  { ...filters, from: "" },
  { ...filters, from: "2026-02-30" },
]) {
  v = outboundInvoiceView(s.outboundOrders, f, day);
  assert(v.period.error);
  assert.equal(v.summary, null);
  assert.equal(v.issued.length, 0);
  assert.equal(v.drafts.length, 2);
}
assert.equal(outboundInvoiceView([], { period: "all" }, day).summary.total, 0);
assert.equal(invoicePaymentStatus({ total: 1, paid: 0.99 }), "partial");
assert.equal(invoicePaymentStatus({ total: 1, paid: 1 }), "paid");
assert.equal(invoicePaymentStatus({ total: null, paid: 0 }), "unknown");
assert.equal(
  outboundInvoiceView(
    [
      { id: "c1", invoiceNo: "I1", total: 0.1, paid: 0.1 },
      { id: "c2", invoiceNo: "I2", total: 0.2, paid: 0.1 },
    ],
    { period: "all" },
    day,
  ).summary.total,
  0.3,
);
const conflict = outboundInvoiceView(s.outboundOrders, filters, day, {
  transfers: [{ id: "paid", status: "cancelled" }],
});
assert.equal(conflict.cancelled.length, 3);
assert.equal(conflict.summary.total, 1100000);
const storageMap = new Map(),
  storage = {
    getItem: (k) => storageMap.get(k) || null,
    setItem: (k, v) => storageMap.set(k, v),
  };
globalThis.sessionStorage = storage;
saveInvoiceFilters(s, "wh", "backoffice", filters);
assert.deepEqual(loadInvoiceFilters(s, "wh", "backoffice"), filters);
assert.equal(
  loadInvoiceFilters({ ...s, me: { id: "other" } }, "wh", "backoffice").period,
  "all",
);
assert.equal(loadInvoiceFilters(s, "wh", "warehouse").period, "all");
assert.equal(loadInvoiceFilters(s, "other", "backoffice").period, "all");
const broken = {
  getItem() {
    throw Error("blocked");
  },
  setItem() {
    throw Error("blocked");
  },
};
saveInvoiceFilters(s, "wh", "blocked", filters, broken);
assert.deepEqual(loadInvoiceFilters(s, "wh", "blocked", broken), filters);
const body = new Node("body"),
  adapter = makeModal();
globalThis.document = {
  body,
  querySelector: (q) => body.querySelector(q),
  querySelectorAll: (q) => body.querySelectorAll(q),
  createElement: (tag) => new Node(tag),
};
Node.prototype.prepend = function (n) {
  this.insertBefore(n, this.children[0] || null);
};
let mutations = 0;
const ctx = {
  workspace: "backoffice",
  getState: () => s,
  refresh: async () => {},
  render: () => render(),
  modal: (...args) => {
    const d = adapter.modal(...args);
    body.append(d);
    return d;
  },
  mutate: async () => {
    mutations++;
  },
  printOutbound() {},
};
const render = () => {
  body.innerHTML = outboundPage(s, "wh", ctx.workspace);
  bindOutboundPage(s, "wh", ctx);
};
render();
const $ = (q) => body.querySelector(q),
  count = (group) =>
    $(`[data-invoice-table="${group}"]`).querySelectorAll("[data-outbound-row]").length;
assert.equal(count("issued"), 4);
assert.equal(count("drafts"), 2);
assert.equal(count("cancelled"), 2);
assert.equal($('[data-invoice-total="total"]').textContent, money(1200000));
assert.equal(body.querySelectorAll("img,script").length, 0);
const change = async (q, value) => {
  $(q).value = value;
  await $(q).fire("change");
};
await change("[data-invoice-payment]", "unpaid");
assert.equal(count("issued"), 3);
assert.equal($('[data-invoice-total="total"]').textContent, money(1200000));
$('[data-outbound-open="partial"]').dispatchEvent(new Event("click", { bubbles: true }));
assert(adapter.latest?.textContent.includes("INV-partial"));
adapter.latest.close();
// After payment, a normal refresh/rerender retains the filter and recalculates the same cohort.
s.outboundOrders.find((o) => o.id === "partial").paid = 200000;
render();
assert.equal($("[data-invoice-payment]").value, "unpaid");
assert.equal(count("issued"), 2);
assert.equal($('[data-invoice-total="paid"]').textContent, money(400000));
assert.equal($('[data-invoice-total="remaining"]').textContent, money(800000));
await change("[data-invoice-from]", "2026-11-18");
assert($("[data-invoice-error]").textContent);
assert.equal(count("issued"), 0);
assert.equal($('[data-invoice-total="total"]').textContent, "—");
await $("[data-invoice-reset]").fire("click");
assert.equal(count("issued"), 7);
assert.equal($("[data-invoice-payment]").value, "all");
assert.equal($("[data-invoice-from]").value, "");
s.access = { backoffice: false, dispatch: true };
s.me = { id: "worker" };
ctx.workspace = "warehouse";
s.outboundOrders.push({ ...s.outboundOrders[0], id: "foreign", sourceId: "other" });
render();
assert(!$("[data-invoice-summary]"));
assert(!$("[data-invoice-payment]"));
assert(!body.textContent.includes("Rp"));
assert(!$('[data-outbound-row="foreign"]'));
assert.equal(mutations, 0);
console.log(
  "PASS invoice grouping/model/handlers: three exclusive tables, inclusive WIB date boundaries, presets/leap year, partial payments, period totals independent of payment filter, delayed payment attribution, cancellations, decimal amounts, refresh persistence, scoped filters, escaping and warehouse privacy; no writes.",
);
