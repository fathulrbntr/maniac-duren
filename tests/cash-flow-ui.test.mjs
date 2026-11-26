import assert from "node:assert/strict";
import { Node } from "./variant-dom.mjs";
import { reportsPage, bindReports, selectReportTab } from "../pos/reports-ui.mjs";
import { cashFlowSheets } from "../pos/cash-flow.mjs";
import { commitMutation } from "../pos/data/mutations.mjs";

const s = {
  cashFlowVersion: 127,
  access: { finance: true, reports: true, backoffice: true },
  stores: [
    { id: "a", name: "Toko A", locationType: "store" },
    { id: "wh", name: "Gudang", locationType: "warehouse" },
  ],
};
selectReportTab("cashflow");
assert(!reportsPage(s, "warehouse").includes('data-report-tab="cashflow"'));
assert(
  !reportsPage({ ...s, stockDemo: {} }, "backoffice").includes(
    'data-report-tab="cashflow"',
  ),
);
selectReportTab("cashflow");
const root = new Node("main");
root.innerHTML = reportsPage(s, "backoffice");
globalThis.document = root;
assert.deepEqual(
  root.querySelector("#report-store").options.map((x) => x.value),
  ["", "a"],
);
const money = (kind, amount, is_cash = false, detail = "", opening = 0) => ({
  kind,
  detail,
  amount,
  opening,
  is_cash,
});
const report = {
  rows: [
    money("sale", 700, true, "Tunai", 1000),
    money("sale", 200, false, "QRIS"),
    money("refund", 100, true),
    money("store_expense", 50, true),
    money("deposit", 400, true),
    money("transfer_collection", 90),
    money("retail_expense", 150, false, "Listrik & air"),
    money("wholesale_collection", 50),
    money("supplier_invoice", 80),
    money("supplier_shipping", 5),
    money("transfer_invoice", 550),
    money("unassigned_expense", 25),
  ],
  receivables: { transfer: 460, wholesale: 30 },
  undatedRefunds: 0,
};
const sheets = cashFlowSheets(report, "", "2026-02-01", "2026-02-28");
assert.equal(sheets[0].rows.at(-1)[1], 1150);
assert.equal(sheets[1].rows.at(-1)[1], 160);
assert.equal(sheets[2].rows.at(-1)[1], 55);
assert.equal(sheets[4].rows[0][1], 25);
assert.equal(cashFlowSheets(report, "a", "2026-02-01", "2026-02-28")[2].rows.length, 2);
const result = root.querySelector("#report-result");
result.isConnected = true;
const pending = [];
bindReports(s, "a", {
  rpc: (name, args) =>
    new Promise((resolve, reject) => pending.push({ name, args, resolve, reject })),
});
assert.equal(pending[0].name, "pos_cash_flow_read");
assert(root.querySelector("#report-excel").disabled);
const filter = root.querySelector("#report-store");
filter.value = "a";
await filter.fire("change");
assert.equal(pending[1].args.filters.store, "a");
pending[1].resolve(report);
await new Promise((r) => setImmediate(r));
assert.match(result.textContent, /Penerimaan pembayaran nota toko/);
assert(!result.textContent.includes("Pembayaran ongkir supplier"));
assert(!root.querySelector("#report-excel").disabled);
pending[0].reject(Error("Permintaan lama"));
await new Promise((r) => setImmediate(r));
assert(!result.textContent.includes("Permintaan lama"));
filter.value = "";
await filter.fire("change");
pending[2].reject(Error("Koneksi terputus"));
await new Promise((r) => setImmediate(r));
assert.match(result.textContent, /Koneksi terputus/);
assert(root.querySelector("#report-excel").disabled);
assert(root.querySelector("#report-pdf").disabled);
let called;
await commitMutation(s, "expense_funding", { id: "fixed" }, async (...args) => {
  called = args;
  return s;
});
assert.deepEqual(called, [
  "/rest/v1/rpc/pos_warehouse_mutate",
  { action: "expense_funding", payload: { id: "fixed" } },
]);
console.log(
  "PASS cash flow report, filters, export scope, stale requests and retry routing.",
);
