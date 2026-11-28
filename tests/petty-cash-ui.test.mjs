import assert from "node:assert/strict";
import { visibleSections } from "../pos/navigation.mjs";
import { emptyState, today } from "../pos/core.mjs";
import { crmPage } from "../pos/crm-ui.mjs";
import { documentsPage } from "../pos/documents-ui.mjs";
import { reportsPage } from "../pos/reports-ui.mjs";
import { supplyHome } from "../pos/warehouse-ui.mjs";
import { cashFlowSheets } from "../pos/cash-flow.mjs";
import { storeExpensesPage } from "../pos/store-expenses-ui.mjs";
import { pettyPanel } from "../pos/petty-cash-ui.mjs";
import { Node } from "./variant-dom.mjs";

const s = {
  ...emptyState(),
  warehouses: [],
  warehouseVersion: 107,
  cashierExpenseVersion: 128,
  pettyCashVersion: 130,
  reportsAdminVersion: 71,
  crmVersion: 85,
  me: { role: "admin" },
  stores: [{ id: "a", name: "Toko A", locationType: "store" }],
  access: {
    backoffice: true,
    employees: true,
    finance: true,
    master: true,
    reports: true,
    sell: true,
    attendance: true,
  },
  retailBalance: 700000,
  pettyBalances: { a: 0 },
  pettyRequests: [],
  sales: [{ id: "sale", date: today(), storeId: "a", total: 120000, lines: [] }],
};
const html = new Node("main");
const pages = (workspace) =>
  visibleSections({ ...s.access, crmAdmin: true, pettyCash: true, workspace }).flatMap(
    (x) => x.pages,
  );
for (const area of ["store", "warehouse", "backoffice"])
  assert.ok(pages(area).includes("attendance"));
for (const key of ["products", "employees", "crm", "retailFunds"]) {
  assert.ok(pages("backoffice").includes(key));
  assert.ok(!pages("store").includes(key));
}
assert.ok(!pages("backoffice").includes("documents"));
html.innerHTML = reportsPage(s, "backoffice");
assert.ok(html.querySelector('[data-view="documents"]'));
assert.ok(html.querySelector('[data-report-tab="cashflow"]'));
assert.doesNotMatch(
  reportsPage(s, "store"),
  /data-view="documents"|data-report-tab="cashflow"/,
);
assert.match(crmPage(s), /crm-new/);
const archive = documentsPage(s, "a");
assert.match(archive, /Arsip dokumen/);
assert.doesNotMatch(archive, /data-new-document|Buat contoh dokumen/);
html.innerHTML = supplyHome(s, "a", "backoffice");
assert.match(html.querySelector(".dash-summary-metrics").textContent, /Omzet.*120\.000/);
assert.doesNotMatch(
  html.querySelector(".dash-operations").textContent,
  /Saldo PT. Altara Rasa Nusantara/,
);
assert.equal(html.querySelector(".dash-pending"), null);
assert.doesNotMatch(supplyHome(s, "a", "store"), /Saldo PT. Altara Rasa Nusantara/);
const storeForm = storeExpensesPage(s, "a");
assert.match(storeForm, /data-petty-action="petty_request"/);
assert.doesNotMatch(storeForm, /<option>Gaji|<option>Sewa/);
html.innerHTML = storeForm;
assert.ok(html.querySelector('#store-expense-form button[type="submit"]').disabled);
s.pettyRequests = [
  {
    id: "1",
    store_id: "a",
    requested_at: new Date().toISOString(),
    amount: 300000,
    reason: "Pembukaan",
    status: "pending",
  },
];
assert.doesNotMatch(
  storeExpensesPage(s, "a"),
  /data-petty-action="petty_request"|data-petty-action="petty_pay"/,
);
assert.match(pettyPanel(s, "a", true), /data-petty-action="petty_pay"/);
const rows = [
  ["deposit", 1000000, 0],
  ["sale", 1200000, 0],
  ["retail_expense", 100000, 0],
  ["petty_disbursement", 200000, 50000],
  ["petty_expense", 30000, 10000],
].map(([kind, amount, opening]) => ({
  kind,
  amount,
  opening,
  is_cash: true,
  detail: "",
}));
const [shop, retail] = cashFlowSheets(
  { pettyCashVersion: 130, rows, receivables: {} },
  "",
  today(),
  today(),
);
assert.equal(Object.fromEntries(shop.rows)["Saldo akhir petty cash"], 210000);
assert.equal(
  Object.fromEntries(retail.rows)["Arus bersih PT. Altara Rasa Nusantara"],
  700000,
);
assert.equal(
  Object.fromEntries(retail.rows)["Saldo akhir PT. Altara Rasa Nusantara"],
  650000,
);
console.log(
  "PASS: dashboards, central administration, archive, store expenses and cash flow totals",
);
