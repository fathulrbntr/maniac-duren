import assert from "node:assert/strict";
import { Node } from "./variant-dom.mjs";
import { navigation, visibleSections } from "../pos/navigation.mjs";
import { storePageTitles } from "../pos/workspaces.mjs";
import { opsPage, bindOps } from "../pos/operations-ui.mjs";

const access = {
  workspace: "store",
  receive: true,
  stock: true,
  waste: true,
  sell: true,
  cashierExpenses: true,
  cut: true,
  kitchen: true,
  produce: true,
  serve: true,
  reports: true,
  attendance: true,
};
const groups = visibleSections(access);
assert.deepEqual(
  groups.map((g) => [g.label, g.pages]),
  [
    ["Toko", ["home", "storehome"]],
    ["Stok & Penerimaan", ["receiving", "stock", "waste"]],
    ["Kasir", ["orders", "salesreport", "storeExpenses", "shifts"]],
    ["Kitchen", ["kitchen", "production"]],
    ["Waiters", ["service"]],
    ["Tukang Potong", ["cutting"]],
    ["Manajemen Toko", ["reports"]],
    ["Akun & perangkat", ["attendance", "devices", "guide"]],
  ],
);
const all = groups.flatMap((g) => g.pages);
assert.equal(all.length, new Set(all).size);
for (const [flags, expected] of [
  [
    { sell: true, cashierExpenses: true },
    ["storehome", "orders", "salesreport", "storeExpenses", "shifts", "devices", "guide"],
  ],
  [
    { kitchen: true, produce: true },
    ["storehome", "stock", "kitchen", "production", "guide"],
  ],
  [{ cut: true, waste: true }, ["storehome", "waste", "cutting", "guide"]],
  [{ serve: true }, ["storehome", "service", "guide"]],
  [{ receive: true }, ["storehome", "receiving", "stock", "guide"]],
  [{ reports: true }, ["storehome", "salesreport", "reports", "guide"]],
])
  assert.deepEqual(
    visibleSections({ workspace: "store", ...flags }).flatMap((g) => g.pages),
    ["home", ...expected],
  );
for (const workspace of ["backoffice", "warehouse"])
  assert(
    !visibleSections({ ...access, workspace, backoffice: true }).some((g) =>
      g.pages.includes("salesreport"),
    ),
  );
const titles = { ...Object.fromEntries(all.map((v) => [v, v])), ...storePageTitles };
const root = new Node("main");
root.innerHTML = navigation(titles, "salesreport", () => "", access, {
  cashier: true,
  store_stock: true,
});
const button = (k) => root.querySelector(`[data-view="${k}"]`);
assert(!button("storehome").closest("details"));
assert.equal(button("stock").attrs["aria-label"], "Inventory");
assert.equal(button("orders").attrs["aria-label"], "POS");
assert.equal(button("salesreport").attrs["aria-current"], "page");
assert(button("salesreport").closest("details").hasAttribute("open"));
assert(!button("receiving").closest("details").hasAttribute("open"));

const order = (id, store_id, cashierId, payment_status = "paid") => ({
  id,
  store_id,
  cashierId,
  payment_status,
  status: "paid",
  business_date: "2026-11-26",
  total: 100,
  payment: "Tunai",
  lines: [{ name: id, unit: "pcs", qty: 1, price: 100 }],
});
const sale = (id, storeId, cashierId) => ({
  id,
  storeId,
  cashierId,
  date: "2026-11-26",
  total: 100,
  payment: "Tunai",
  lines: [{ productId: "durian", kg: 2, unit: "KG", total: 100 }],
});
const state = {
  access: { sell: true },
  me: { id: "me" },
  products: [{ id: "durian", name: "Durian Bawor" }],
  orders: [
    order("own-order", "A", "me"),
    order("colleague", "A", "other"),
    order("other-branch", "B", "me"),
    order("refunded", "A", "me", "refunded"),
  ],
  sales: [
    sale("own-order", "A", "me"),
    sale("own-sale", "A", "me"),
    sale("refunded", "A", "me"),
    sale("historic", "A", null),
  ],
};
function draw(state) {
  globalThis.document = root;
  root.innerHTML = opsPage("salesreport", state, "A");
  root.querySelector("#sales-from").value = "2026-11-01";
  root.querySelector("#sales-to").value = "2026-11-30";
  bindOps("salesreport", state, "A", {});
  return root.querySelector("#sales-result");
}
let rows = draw(state);
assert.equal(rows.querySelectorAll("tbody tr").length, 2);
assert.match(rows.textContent, /Durian Bawor/);
assert(!rows.textContent.includes("colleague"));
rows = draw({ ...state, access: { reports: true } });
assert.equal(rows.querySelectorAll("tbody tr").length, 4);
assert.match(rows.textContent, /colleague/);
assert(
  !rows.textContent.includes("other-branch") && !rows.textContent.includes("refunded"),
);
root.querySelector("#sales-from").value = "2026-11-27";
await root.querySelector("#sales-from").fire("change");
assert.match(rows.textContent, /Belum ada data/);
console.log(
  "PASS store sidebar division order, role visibility, active menu and branch sales history.",
);
