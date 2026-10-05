import assert from "node:assert/strict";
import { applyAction, demoState, saleRows, summarize } from "../pos/core.mjs";
import { stockQty, quantity } from "../pos/production.mjs";
import {
  recipesPage,
  productionPage,
  unitStockPanel,
} from "../pos/production-ui.mjs";
let s = demoState();
const original = structuredClone(s);
const run = (action, p) => {
  s = applyAction(s, action, p);
};
for (const p of [
  {
    id: "flour",
    sku: "RAW-1",
    name: "Tepung",
    itemType: "raw",
    stockUnit: "g",
  },
  { id: "milk", sku: "RAW-2", name: "Susu", itemType: "raw", stockUnit: "ml" },
  {
    id: "cendol",
    sku: "PREP-1",
    name: "Cendol",
    itemType: "prep",
    stockUnit: "g",
  },
  {
    id: "cream",
    sku: "PREP-2",
    name: "Creamer",
    itemType: "prep",
    stockUnit: "ml",
  },
  {
    id: "dessert",
    sku: "DESSERT-1",
    name: "Es cendol",
    itemType: "recipe",
    stockUnit: "porsi",
    category: "Dessert",
    salePrice: 28000,
  },
])
  run("master", { kind: "products", ...p });
function receipt(id, productId, qty, extra = {}) {
  run("unit_receipt", {
    id,
    productId,
    qty,
    kind: "purchase",
    supplierId: "a",
    date: "2026-10-01",
    storeId: "depok",
    ...extra,
  });
}
receipt("flour-1", "flour", 600);
receipt("flour-2", "flour", 500, { date: "2026-10-02" });
receipt("milk-1", "milk", 1000);
receipt("flour-expired", "flour", 800, { expiry: "2026-10-02" });
receipt("flour-future", "flour", 800, { date: "2026-10-05" });
receipt("flour-other-store", "flour", 5000, { storeId: "jakarta" });
const cendol = {
  id: "recipe-cendol",
  name: "Resep cendol",
  outputId: "cendol",
  yieldQty: 1000,
  version: 0,
  ingredients: [{ productId: "flour", qty: 500 }],
};
run("recipe_save", cendol);
run("recipe_save", {
  id: "recipe-cream",
  name: "Resep creamer",
  outputId: "cream",
  yieldQty: 1000,
  version: 0,
  ingredients: [{ productId: "milk", qty: 1000 }],
});
run("recipe_save", {
  id: "recipe-dessert",
  name: "Es cendol",
  outputId: "dessert",
  yieldQty: 10,
  version: 0,
  ingredients: [
    { productId: "cendol", qty: 1000 },
    { productId: "cream", qty: 800 },
  ],
});
const produce = {
  id: "prod-cendol",
  recipeId: "recipe-cendol",
  recipeVersion: 1,
  storeId: "depok",
  date: "2026-10-03",
  batches: 2,
  actualQty: 1900,
};
run("produce", produce);
assert.equal(s.unitLots.find((x) => x.id === "flour-1").qty, 0);
assert.equal(s.unitLots.find((x) => x.id === "flour-2").qty, 100);
assert.equal(s.unitLots.find((x) => x.id === "flour-expired").qty, 800);
assert.equal(s.unitLots.find((x) => x.id === "flour-future").qty, 800);
assert.equal(s.unitLots.find((x) => x.id === "flour-other-store").qty, 5000);
assert.equal(s.productions[0].expectedQty, 2000);
assert.equal(stockQty(s, "cendol", "depok", "2026-10-03"), 1900);
let before = structuredClone(s);
run("produce", produce);
assert.deepEqual(s, before, "retry must not consume twice");
const dessert = {
  id: "prod-dessert",
  recipeId: "recipe-dessert",
  recipeVersion: 1,
  storeId: "depok",
  date: "2026-10-03",
  batches: 1,
  actualQty: 10,
};
assert.throws(() => run("produce", dessert), /Stok tidak cukup/);
assert.deepEqual(
  s,
  before,
  "no partial input deduction on later ingredient shortage",
);
run("produce", {
  id: "prod-cream",
  recipeId: "recipe-cream",
  recipeVersion: 1,
  storeId: "depok",
  date: "2026-10-03",
  batches: 1,
  actualQty: 1000,
});
run("produce", dessert);
assert.equal(stockQty(s, "cendol", "depok", "2026-10-03"), 900);
assert.equal(stockQty(s, "cream", "depok", "2026-10-03"), 200);
assert.equal(stockQty(s, "dessert", "depok", "2026-10-03"), 10);
assert.equal(
  s.unitLots.find((x) => x.id === "flour-2").qty,
  100,
  "dessert must not deduct raw flour again",
);
assert.throws(
  () =>
    run("production_void", {
      id: "v",
      productionId: "prod-cendol",
      reason: "Test",
    }),
  /sudah digunakan/,
);
run("production_void", {
  id: "v",
  productionId: "prod-dessert",
  reason: "Salah input",
});
assert.equal(stockQty(s, "dessert", "depok", "2026-10-03"), 0);
assert.equal(stockQty(s, "cendol", "depok", "2026-10-03"), 1900);
before = structuredClone(s);
run("production_void", {
  id: "v",
  productionId: "prod-dessert",
  reason: "Test",
});
assert.deepEqual(s, before);
run("production_void", {
  id: "v",
  productionId: "prod-cendol",
  reason: "Salah input",
});
assert.equal(s.unitLots.find((x) => x.id === "flour-1").qty, 600);
assert.equal(s.unitLots.find((x) => x.id === "flour-2").qty, 500);
assert.throws(
  () =>
    run("product_update", {
      ...s.products.find((x) => x.id === "flour"),
      stockUnit: "ml",
    }),
  /terkunci/,
);
run("recipe_save", { ...cendol, version: 1, yieldQty: 900 });
assert.equal(
  s.productions[0].expectedQty,
  2000,
  "history uses original recipe snapshot",
);
assert.throws(
  () => run("produce", { ...produce, id: "stale" }),
  /Resep berubah/,
);
assert.throws(() =>
  run("recipe_save", {
    ...cendol,
    id: "bad",
    ingredients: [{ productId: "cendol", qty: 1 }],
  }),
);
assert.throws(() =>
  run("recipe_save", {
    ...cendol,
    id: "bad",
    ingredients: [
      { productId: "flour", qty: 1 },
      { productId: "flour", qty: 2 },
    ],
  }),
);
assert.throws(() =>
  run("produce", { ...produce, id: "bad", recipeVersion: 2, actualQty: -1 }),
);
assert.throws(() => quantity(1.5, "porsi"));
assert.throws(() => quantity(0.0000001, "g"));
receipt("opening", "dessert", 12, {
  kind: "opening",
  note: "Hasil hitung awal",
});
assert.equal(stockQty(s, "dessert", "depok", "2026-10-03"), 12);
for (const key of ["lots", "sales", "movements", "suppliers", "stores"])
  assert.deepEqual(s[key], original[key]);
assert.equal(summarize(saleRows(s)).total, 784500);
assert.match(recipesPage(s), /Resep cendol/);
assert.match(productionPage(s, "depok"), /prod-cen/);
assert.doesNotMatch(unitStockPanel(s, "depok"), /flour-other-store/);
assert.doesNotMatch(
  recipesPage({
    ...s,
    recipes: [{ ...s.recipes[0], name: "<script>alert(1)</script>" }],
  }),
  /<script>/,
);
console.log(
  "PASS: FIFO, store/date/expiry isolation, insufficient-stock rollback, double-submit idempotence, multi-stage prep, actual yield, cancellation guards/restoration, recipe versions/snapshots, unit locks, HTML output, old durian regression.",
);
