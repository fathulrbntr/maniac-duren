import assert from "node:assert/strict";
import { applyAction, emptyState, demoState } from "../pos/core.mjs";
import { productStock } from "../pos/product-stock.mjs";
import { photoValue, MAX_PHOTO_BYTES } from "../pos/product-details.mjs";
import { catalogPanel } from "../pos/catalog-ui.mjs";
let s = emptyState();
s.stores = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
];
s.suppliers = [{ id: "sup", name: "Supplier" }];
const raw = {
  id: "flour",
  name: "Tepung",
  sku: "FLR",
  itemType: "raw",
  stockUnit: "g",
  variant: "Putih",
  barcode: "00123",
  buyPrice: 50,
  photo: "",
};
const stock = (id, expected, target, storeId = "a") => ({
  id,
  storeId,
  expected: { qty: expected },
  target: { qty: target },
  reason: "Hitung fisik",
});
s = applyAction(s, "product_save", { ...raw, stock: stock("open", 0, 1000) });
assert.equal(s.products[0].barcode, "00123");
assert.equal(s.products[0].buyPrice, 50);
assert.equal(productStock(s, "flour", "a", false).qty, 1000);
const first = structuredClone(s);
s = applyAction(s, "product_save", { ...raw, stock: stock("open", 0, 1000) });
assert.deepEqual(s, first);
s = applyAction(s, "product_save", {
  ...raw,
  editing: true,
  stock: stock("other", 0, 500, "b"),
});
s = applyAction(s, "product_save", {
  ...raw,
  editing: true,
  stock: stock("reduce", 1000, 300),
});
assert.equal(productStock(s, "flour", "a", false).qty, 300);
assert.equal(productStock(s, "flour", "b", false).qty, 500);
const previous = structuredClone(s);
assert.throws(
  () =>
    applyAction(s, "product_save", {
      ...raw,
      name: "Wrong",
      editing: true,
      stock: stock("stale", 1000, 400),
    }),
  /Stok berubah/,
);
assert.deepEqual(s, previous);
assert.throws(
  () => applyAction(s, "product_delete", { id: "flour", confirmed: true }),
  /sudah digunakan/,
);
assert.throws(
  () => applyAction(s, "product_delete", { id: "flour" }),
  /Konfirmasi/,
);
s = applyAction(s, "product_save", { ...raw, id: "unused", sku: "UNUSED" });
s = applyAction(s, "product_delete", { id: "unused", confirmed: true });
assert(!s.products.some((p) => p.id === "unused"));
s = applyAction(s, "product_delete", { id: "unused", confirmed: true });
s = applyAction(s, "product_save", {
  ...raw,
  editing: true,
  photo: "",
  buyPrice: 0,
  variant: "<img onerror=x>",
  barcode: "0009",
});
assert.equal(s.products[0].buyPrice, 0);
assert(catalogPanel(s.products, {}, s, "a").includes("&lt;img onerror=x&gt;"));
assert(catalogPanel(s.products, { query: "0009" }, s, "a").includes("Tepung"));
const jpg = "data:image/jpeg;base64,";
assert.doesNotThrow(() =>
  photoValue(jpg + Buffer.alloc(MAX_PHOTO_BYTES).toString("base64")),
);
assert.throws(
  () => photoValue(jpg + Buffer.alloc(MAX_PHOTO_BYTES + 1).toString("base64")),
  /2 MB/,
);
assert.throws(() => photoValue("data:image/svg+xml;base64,AAAA"), /JPG/);
assert.throws(
  () =>
    applyAction(s, "product_save", {
      ...raw,
      id: "bad",
      sku: "BAD",
      buyPrice: -1,
    }),
  /Harga beli/,
);
let d = demoState();
const p = d.products[0],
  before = productStock(d, p.id, "depok", true);
const adjustment = {
  id: "dual",
  storeId: "depok",
  expected: before,
  target: { kg: before.kg + 2, pieces: before.pieces - 1 },
  reason: "Timbang ulang",
  supplierId: "a",
};
d = applyAction(d, "product_save", { ...p, editing: true, stock: adjustment });
assert.deepEqual(productStock(d, p.id, "depok", true), adjustment.target);
assert.equal(d.lots.at(-1).pieces, 0);
assert.throws(
  () =>
    applyAction(d, "product_save", {
      ...p,
      editing: true,
      stock: {
        ...adjustment,
        id: "missing",
        expected: adjustment.target,
        target: {
          kg: adjustment.target.kg + 1,
          pieces: adjustment.target.pieces,
        },
        supplierId: null,
      },
    }),
  /Supplier wajib/,
);
const portions = {
  id: "menu",
  name: "Menu",
  sku: "MENU",
  itemType: "recipe",
  stockUnit: "porsi",
  category: "Dessert",
  salePrice: 20000,
};
assert.throws(
  () =>
    applyAction(s, "product_save", {
      ...portions,
      stock: stock("fraction", 0, 1.5),
    }),
  /bulat/,
);
assert.throws(
  () =>
    applyAction(s, "product_save", { ...raw, editing: true, stockUnit: "ml" }),
  /terkunci/,
);
console.log(
  "PASS: metadata, initial stock, per-store adjustment, idempotence, stale rejection/rollback, delete guards, photo limits, escaping, dual-unit adjustment and integer quantities.",
);
