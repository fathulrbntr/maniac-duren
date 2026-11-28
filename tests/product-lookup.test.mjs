import test from "node:test";
import assert from "node:assert/strict";
import { money } from "../pos/core.mjs";
import { lookupItem } from "../pos/product-lookup.mjs";
import { fixture } from "./stock-demo-fixture.mjs";

test("pencarian barcode/SKU juga mencakup bahan dan mengikuti stok serta harga cabang", () => {
  const { state } = fixture();
  const [a, b] = state.stores;
  const product = state.products.find((p) => p.itemType === "raw");
  Object.assign(product, { sku: "0007-A", barcode: "012345678905" });
  state.unitLots = [
    { productId: product.id, storeId: a.id, qty: 14 },
    { productId: product.id, storeId: b.id, qty: 2 },
  ];
  const old = structuredClone(state);
  for (const raw of [product.barcode, "0007-a"]) {
    const found = lookupItem(state, raw, a.id, "store");
    assert.equal(found.name, product.name);
    assert.equal(Object.fromEntries(found.rows)[`Stok · ${a.name}`], "14 ml");
  }
  assert.equal(
    lookupItem(state, "0" + product.barcode, a.id, "store", { camera: true }).name,
    product.name,
  );
  assert.deepEqual(old, state);
  state.branchPrices = [
    { productId: product.id, storeId: a.id, stockUnit: "ml", salePrice: 750 },
  ];
  assert.match(
    Object.fromEntries(lookupItem(state, product.barcode, a.id, "store").highlights)[
      "Harga jual / ml"
    ],
    /750/,
  );
  assert(
    !lookupItem(state, product.barcode, a.id, "warehouse").highlights.some(([k]) =>
      k.startsWith("Harga"),
    ),
  );
  state.products.push({ ...product, id: "duplicate" });
  assert.throws(
    () => lookupItem(state, product.barcode, a.id, "store"),
    /lebih dari satu/,
  );
});

test("label tracking mengikuti identitas dan lokasi buah, termasuk sesudah penjualan", () => {
  const { state } = fixture();
  const [a, b] = state.stores;
  const fruit = state.products.find((p) => p.stockUnit === "kg_butir");
  const barcode = "92011311260000010001002000";
  fruit.barcode = "0001";
  state.lots = [
    {
      id: "batch-1",
      productId: fruit.id,
      storeId: a.id,
      supplierId: state.suppliers[0].id,
      date: "2026-11-13",
      kg: 2,
      pieces: 1,
      cost: 40000,
    },
  ];
  state.fruitUnits = [
    {
      barcode,
      storeId: a.id,
      productId: fruit.id,
      lotId: "batch-1",
      grams: 2000,
      status: "sold",
    },
  ];
  const rows = Object.fromEntries(lookupItem(state, barcode, a.id, "store").rows);
  assert.equal(rows["Status buah"], "Terjual");
  assert.equal(
    Object.fromEntries(lookupItem(state, barcode, a.id, "store").highlights)[
      "Berat buah"
    ],
    "2 kg",
  );
  assert.equal(rows["Berat buah"], undefined);
  assert.equal(rows.Supplier, state.suppliers[0].name);
  assert.equal(rows["Lokasi buah"], a.name);
  assert.equal(rows.Batch, "batch-1");
  assert.throws(() => lookupItem(state, barcode, "", "store"), /belum tercatat/);
  assert.equal(lookupItem(state, barcode, null, "backoffice").name, fruit.name);
  assert(!Object.keys(rows).some((key) => /modal|biaya/i.test(key)));
  assert.throws(() => lookupItem(state, barcode, b.id, "store"), /belum tercatat/);
  assert.throws(
    () => lookupItem(state, "92011311260000020001002000", a.id, "store"),
    /belum tercatat/,
  );
  assert.match(
    Object.fromEntries(lookupItem(state, "2100010030320", a.id, "store").highlights)[
      "Berat label"
    ],
    /3[,.]032 kg/,
  );
  state.access = { kitchen: true };
  const kitchen = Object.fromEntries(lookupItem(state, barcode, a.id, "store").rows);
  assert.equal(kitchen.Supplier, undefined);
  assert.equal(kitchen.Batch, undefined);
});

test("harga label mengikuti berat dan tarif cabang, sedangkan SKU tanpa berat menampilkan tarif satuan", () => {
  const { state } = fixture();
  const [store] = state.stores;
  const fruit = state.products.find((p) => p.stockUnit === "kg_butir");
  const barcode = "92022311260000010002000160";
  state.fruitUnits = [{ barcode, storeId: store.id, productId: fruit.id, grams: 160 }];
  const rate = {
    storeId: store.id,
    productId: fruit.id,
    stockUnit: "kg_butir",
    priceKg: 150000,
    pricePiece: 300000,
  };
  state.branchPrices = [rate];
  const lookup = (code, workspace = "store") =>
    lookupItem(state, code, store.id, workspace);
  const { highlights, priceNotes, rows } = lookup(barcode);
  assert.deepEqual(highlights, [
    ["Berat buah", "0,16 kg"],
    ["Harga sesuai berat", money(24000)],
  ]);
  assert.deepEqual(priceNotes, [money(150000) + " / kg", money(300000) + " / butir"]);
  assert(!rows.some(([label]) => /Harga|Berat/.test(label)));
  assert.deepEqual(lookup(fruit.sku).highlights, [
    ["Harga jual / kg", money(150000)],
    ["Harga jual / butir", money(300000)],
  ]);
  assert.deepEqual(lookup(barcode, "warehouse").highlights, [["Berat buah", "0,16 kg"]]);
  assert.deepEqual(lookup(barcode, "warehouse").priceNotes, []);
  rate.priceKg = 0;
  assert.deepEqual(lookup(barcode).highlights, [
    ["Berat buah", "0,16 kg"],
    ["Harga jual / butir", money(300000)],
  ]);
  rate.pricePiece = 0;
  assert.deepEqual(lookup(barcode).highlights, [["Berat buah", "0,16 kg"]]);
  assert.deepEqual(lookup(barcode).priceNotes, ["Harga jual belum diatur."]);
});
