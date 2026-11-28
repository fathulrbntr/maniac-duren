// Integration against app.js: loaded data, active outlet and demo isolation.
import assert from "node:assert/strict";
import { Node } from "./variant-dom.mjs";
import { emptyState, today } from "../pos/core.mjs";
import { createSessionManager } from "../pos/session.mjs";
const root = new Node("body"),
  app = new Node("div", { id: "app" });
app.parent = root;
root.children.push(app);
root.classList.remove = () => {};
const disk = new Map(),
  listeners = {};
const storage = {
  getItem: (k) => disk.get(k) ?? null,
  setItem: (k, v) => disk.set(k, v),
  removeItem: (k) => disk.delete(k),
};
globalThis.localStorage = storage;
globalThis.HTMLInputElement = class {
  get value() {
    return this.raw || "";
  }
  set value(v) {
    this.raw = v;
  }
};
globalThis.MutationObserver = class {
  observe() {}
};
globalThis.document = {
  body: root,
  documentElement: { dataset: { theme: "dark" } },
  addEventListener: (key, fn) => (listeners[key] ??= []).push(fn),
  querySelector: (q) =>
    q === "#toast" ? { textContent: "", style: {} } : root.querySelector(q),
  querySelectorAll: (q) => root.querySelectorAll(q),
};
globalThis.window = {
  localStorage: storage,
  addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
};
globalThis.confirm = () => true;
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
const url = "https://fixture.invalid",
  manager = createSessionManager({ url, key: "test", storage, locks: null });
const session = manager.save({
  access_token: "test",
  refresh_token: "test",
  expires_in: 3600,
  user: { id: "owner" },
});
manager.location(session.sessionId, "a", "dashboard");
const s = {
  ...emptyState(),
  me: { id: "owner", name: "Owner Test", role: "owner" },
  access: {
    reports: true,
    sell: true,
    finance: true,
    master: true,
    stock: true,
    waste: true,
  },
  stores: [
    { id: "a", name: "Outlet A" },
    { id: "b", name: "Outlet B" },
  ],
  employees: [],
  orders: [],
  events: [],
  journal: [],
  documents: [],
  rejectRecords: [],
};
s.products = [
  {
    id: "water",
    name: "Air mineral",
    itemType: "direct",
    stockUnit: "pcs",
    salePrice: 5000,
    category: "Minuman",
  },
];
s.orders = [
  {
    id: "sale-a",
    store_id: "a",
    business_date: today(),
    paid_date: today(),
    created_at: today() + "T03:00:00Z",
    status: "paid",
    payment_status: "paid",
    payment: "Tunai",
    total: 5000,
    lines: [{ productId: "water", qty: 1, price: 5000, unit: "pcs" }],
  },
];
let reads = 0;
globalThis.fetch = async (endpoint) => {
  if (endpoint === "/api/pos-config")
    return new Response(JSON.stringify({ configured: true, url, key: "test" }));
  if (endpoint === url + "/rest/v1/rpc/pos_read") {
    reads++;
    return new Response(JSON.stringify(s));
  }
  throw Error("Unexpected network request: " + endpoint);
};
await import("../pos/app.js?dashboard-integration");
assert(root.querySelector(".home-page"));
assert.equal(root.querySelector('#pos-navigation [data-view="dashboard"]'), null);
assert(root.querySelector(".dashboard-shell"));
assert(root.querySelector(".system-dock"));
assert.equal(reads, 1);
assert(root.querySelector(".dash-metric").textContent.includes("5.000"));
const select = async (selector, value) => {
  const el = root.querySelector(selector);
  el.value = value;
  await el.fire("change");
};
await select("#dash-store", "b");
assert.equal(root.querySelector("#active-store").value, "b");
assert.equal(manager.read().store, "b");
assert.equal(reads, 1);
await select("#dash-store", "");
assert(root.querySelector(".dash-metric").textContent.includes("5.000"));
assert.equal(root.querySelector("#active-store").value, "b");
await select("#active-store", "a");
assert.equal(root.querySelector("#dash-store").value, "a");
assert.equal(reads, 1);
await select("#dash-period", "month");
await root.querySelector('[data-dash-tab="stock"]').fire("click");
assert(root.querySelector("#dash-period").disabled);
assert.equal(reads, 1);
await root.querySelector('[data-dash-tab="transactions"]').fire("click");
await root.querySelector("#dash-refresh").fire("click");
assert.equal(reads, 2);
await root.querySelector("#stock-demo-toggle").fire("click");
assert(root.textContent.includes("MODE DEMO"));
assert.equal(reads, 2);
assert(root.querySelector(".dash-chart-empty"));
await root.querySelector("#dash-refresh").fire("click");
await root.querySelector('[data-dash-tab="suppliers"]').fire("click");
assert.equal(reads, 2, "Dashboard demo must not read the real database");
await root.querySelector("#stock-demo-toggle").fire("click");
assert.equal(reads, 3);
await root.querySelector('[data-dash-tab="transactions"]').fire("click");
assert(root.querySelector(".dash-metric").textContent.includes("5.000"));
console.log(
  "PASS dashboard app integration: session restore, shared outlet selector, all-store scope, local navigation, refresh, demo and live restoration.",
);

// A saved operating branch must not scope the modern Back Office.
Object.assign(s, {
  warehouseVersion: 107,
  branchStockVersion: 132,
  retailBalance: 7500,
  cashDepositToday: today(),
  supplierNotesVersion: 112,
  cashDepositVersion: 92,
  cashDepositSummary: [
    {
      storeId: "a",
      netCash: 8000,
      netSales: 18000,
      salesToday: 12000,
      deposited: 8000,
      pending: 10000,
    },
    {
      storeId: "b",
      netCash: 4000,
      netSales: 27000,
      salesToday: 6000,
      deposited: 4000,
      pending: 23000,
    },
  ],
  branchPricingVersion: 123,
  pettyCashVersion: 130,
  warehouseWorkflowVersion: 114,
  branchNoteVersion: 135,
  receiptPlans: [
    {
      storeId: "a",
      receiving: { status: "completed" },
      invoiceTracked: true,
      lines: [{ purchaseCost: 9000 }],
      payments: [{ component: "invoice", amount: 3000 }],
    },
    {
      storeId: "b",
      receiving: { status: "paused" },
      invoiceTracked: true,
      lines: [{ purchaseCost: 1000 }],
      payments: [],
    },
  ],
  branchNotes: [
    {
      id: "n-1",
      number: "NT-1",
      sourceId: "b",
      targetId: "a",
      origin: { name: "Outlet B" },
      destination: { name: "Outlet A" },
      status: "ready",
    },
  ],
  pettyRequests: [{ store_id: "b", status: "pending" }],
  transfers: [],
});
Object.assign(s.access, { backoffice: true, attendance: true, receive: true });
s.stores.forEach((st) => (st.locationType = "store"));
s.locations = s.stores;
s.unitLots = s.stores.map((st, i) => ({
  id: "lot-" + i,
  storeId: st.id,
  productId: "water",
  unit: "pcs",
  date: today(),
  qty: i ? 7 : 2,
}));
await root.querySelector("#dash-refresh").fire("click");
const space = async (key) =>
  root.querySelector(`[data-workspace="${key}"]`).fire("click");
const go = async (key) =>
  root.querySelector(`#pos-navigation [data-view="${key}"]`).fire("click");
await space("store");
await select("#active-store", "b");
await space("backoffice");
assert(root.querySelector(".home-page"));
assert.match(
  root.querySelector(".home-financials").textContent,
  /Belum disetor.*33\.000.*Tagihan supplier.*7\.000.*Omzet hari ini.*18\.000/s,
);
assert.equal(
  root.querySelector(".home-hero .account-profile strong").textContent,
  "Owner Test",
);
assert.equal(root.querySelector(".home-hero .account-avatar").textContent, "OT");
assert(!root.querySelector(".dash-workspace .account-profile"));
assert.match(root.querySelector("#home-headline").textContent, /Saldo perusahaan/);
assert.match(root.querySelector(".home-value").textContent, /7\.500/);
assert.match(
  root.querySelector(".home-work .home-deposits").textContent,
  /Outlet A.*10\.000.*Outlet B.*23\.000/s,
);
await select("#dash-store", "b");
assert.match(root.querySelector(".home-value").textContent, /7\.500/);
await select("#dash-store", "");
await root.querySelector("[data-home-sales]").fire("click");
assert.match(root.querySelector(".dash-metric").textContent, /Omzet.*5\.000/s);
assert.equal(root.querySelector("#dash-store").value, "");
assert.equal(root.querySelectorAll('#pos-navigation [data-view="dashboard"]').length, 0);
const pending = () => root.querySelector(".home-work").textContent;
assert.match(
  pending(),
  /1Nota menunggu penerimaan.*1Transfer menunggu persetujuan.*1Pengajuan petty cash/,
);
await select("#dash-store", "a");
assert.match(
  pending(),
  /0Nota menunggu penerimaan.*1Transfer menunggu persetujuan.*0Pengajuan petty cash/,
);
await root.querySelector('[data-dash-tab="stock"]').fire("click");
assert.equal(
  root.querySelector(".dash-stock-panel .dash-link").dataset.view,
  "officeInventory",
);
await root.querySelector(".dash-stock-panel .dash-link").fire("click");
assert.equal(root.querySelector("[data-inv-place]").value, "a");
await go("home");
await select("#dash-store", "");
assert.match(pending(), /1Nota menunggu penerimaan/);
await root.querySelector(".dash-stock-panel .dash-link").fire("click");
assert(root.querySelector("[data-office-inventory]"));
assert.equal(root.querySelector("#active-store"), null);
assert.match(root.querySelector(".workspace-outlet").textContent, /Semua cabang/);
await go("products");
assert.match(root.querySelector(".inv-results").textContent, /9 pcs/);
await go("costPrices");
assert.equal(root.querySelector("[data-cost-store]").value, "");
await go("pricing");
assert.equal(root.querySelector("[data-retail-store]").value, "");
assert.match(root.querySelector("[data-retail-rows]").textContent, /Outlet A/);
assert.match(root.querySelector("[data-retail-rows]").textContent, /Outlet B/);
await select("[data-retail-store]", "a");
await go("transfers");
assert(root.querySelector("[data-transfer-new]"));
assert.doesNotMatch(root.querySelector(".supply-hero").textContent, /Outlet [AB]/);
await go("payments");
assert.equal(root.querySelector("#office-branch").value, "");
await select("#office-branch", "a");
assert(root.querySelector("#payment-settings-form"));
await space("store");
assert(root.querySelector(".home-page"));
assert.equal(root.querySelector('#pos-navigation [data-view="storehome"]'), null);
assert.match(root.querySelector(".home-value").textContent, /23\.000/);
assert.doesNotMatch(root.querySelector(".home-page").textContent, /7\.500/);
assert.equal(root.querySelector("#active-store").value, "b");

assert.equal(root.querySelector("#dash-store").value, "b");
assert.doesNotMatch(root.querySelector("#dash-store").textContent, /Semua toko/);
assert.doesNotMatch(
  root.querySelector(".dash-operations").textContent,
  /Saldo PT. Altara Rasa Nusantara/,
);
