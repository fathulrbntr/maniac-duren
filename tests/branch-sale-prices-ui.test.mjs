import assert from "node:assert/strict";
import { Node, makeModal } from "./variant-dom.mjs";
import { branchPricingPage, bindBranchPricing } from "../pos/branch-prices-ui.mjs";
import { pricesForBranch } from "../pos/branch-prices.mjs";
import { cashierQuote } from "../pos/cashier.mjs";
const a = "hi",
  b = "jb";
const products = [
  {
    id: "fruit",
    name: "Monthong",
    stockUnit: "kg_butir",
    itemType: "direct",
    priceKg: 80000,
    pricePiece: 150000,
  },
  {
    id: "pack",
    name: "Durpas 500 g",
    sku: "DP500",
    stockUnit: "pcs",
    itemType: "finished",
    salePrice: 70000,
  },
  { id: "raw", name: "Gula", stockUnit: "g", itemType: "raw" },
];
const state = {
  branchPricingVersion: 123,
  locations: [
    { id: a, name: "Harapan Indah", locationType: "store" },
    { id: b, name: "Jababeka", locationType: "store" },
    { id: "wh", name: "Gudang pusat", locationType: "warehouse" },
  ],
  products,
  branchPrices: [
    { storeId: b, productId: "pack", stockUnit: "pcs", salePrice: 75000, revision: 1 },
  ],
};
const root = new Node("main"),
  modal = makeModal(),
  calls = [];
globalThis.document = { querySelector: (q) => root.querySelector(q) };
root.innerHTML = branchPricingPage(state, a);
const ctx = {
  getState: () => state,
  modal: modal.modal,
  toast: () => {},
  mutate: async (action, p) => {
    calls.push([action, p]);
    state.branchPrices = state.branchPrices
      .filter((r) => r.storeId !== p.storeId || r.productId !== p.productId)
      .concat({ ...p, revision: p.expectedRevision + 1 });
  },
};
bindBranchPricing(ctx);
const select = root.querySelector("[data-retail-store]"),
  list = root.querySelector("[data-retail-rows]");
assert.equal(select.value, a);
assert.equal(select.options.length, 3);
assert(!list.textContent.includes("Gula"));
assert(!select.textContent.includes("Gudang pusat"));
select.value = b;
await select.fire("change");
assert.match(list.textContent, /75.000/);
const search = root.querySelector("[data-retail-search]");
search.value = "DP500";
await search.fire("input");
assert(!list.textContent.includes("Monthong"));
const open = (product) =>
  list.listeners.click[0]({
    target: list.querySelector('[data-edit-retail="' + product + '"]'),
  });
open("pack");
let form = modal.latest.querySelector("form");
assert(modal.latest.textContent.includes("Jababeka"));
assert.equal(form.elements.namedItem("salePrice").value, "75000");
form.elements.namedItem("salePrice").value = "77000";
await form.fire("submit");
assert.equal(calls[0][0], "branch_price_save");
assert.equal(calls[0][1].storeId, b);
assert.equal(calls[0][1].expectedRevision, 1);
assert.match(list.textContent, /77.000/);
assert.equal(select.value, b);
assert.equal(pricesForBranch(state, a).products[1].salePrice, 70000);
assert.equal(pricesForBranch(state, b).products[1].salePrice, 77000);
assert.equal(state.products[1].salePrice, 70000);
const checkout = { storeId: b, lines: [{ productId: "pack", qty: 2, price: 77000 }] };
assert.equal(cashierQuote(state, checkout).subtotal, 154000);
assert.throws(
  () => cashierQuote(state, { ...checkout, storeId: a }),
  /Harga jual cabang/,
);
search.value = "";
await search.fire("input");
open("fruit");
form = modal.latest.querySelector("form");
assert(form.elements.namedItem("priceKg"));
assert(form.elements.namedItem("pricePiece"));
assert(!form.elements.namedItem("salePrice"));
assert.equal(
  pricesForBranch({ ...state, stockDemo: { sessionId: "demo" } }, b).products[1]
    .salePrice,
  70000,
);
