import assert from "node:assert/strict";
import { barcodeProduct } from "../pos/barcode-scanner.mjs";
import { pricesForBranch } from "../pos/branch-prices.mjs";
import { fruitSaleDialog } from "../pos/fruit-sale-dialog.mjs";
import { fruitSaleLine } from "../pos/fruit-stock.mjs";
import { checkOrder } from "../pos/order-stock.mjs";
import { Node, makeModal } from "./variant-dom.mjs";
import { fixture, day } from "./stock-demo-fixture.mjs";

const f = fixture(),
  s = f.state,
  other = { ...f.fruit, id: "other-fruit", name: "Bawor", barcode: "0002" };
const a = "92010711260000680001000228",
  b = "92010711260000690001000228";
Object.assign(f.fruit, { barcode: "0001", priceKg: 90000 });
s.products.push(other);
const first = s.lots[0];
first.supplierId = "supplier-one";
const batch = { ...first, id: "second-lot", supplierId: "supplier-two" };
s.lots.push(batch);
s.fruitTrackingVersion = 101;
s.warehouseVersion = 107;
s.branchPrices = [
  {
    storeId: f.store,
    productId: f.fruit.id,
    stockUnit: "kg_butir",
    priceKg: 150000,
    pricePiece: 200000,
  },
];
s.fruitUnits = [a, b].map((barcode) => ({
  barcode,
  storeId: f.store,
  productId: f.fruit.id,
  lotId: batch.id,
  grams: 228,
  status: "available",
}));
const cart = [],
  m = makeModal();
const open = (products = [f.fruit]) =>
  fruitSaleDialog({
    name: products[0].name,
    products,
    modal: m.modal,
    scanProduct: (raw, settings) =>
      barcodeProduct(pricesForBranch(s, f.store), raw, settings),
    onScan: (scan) => {
      const line = fruitSaleLine(s, f.store, scan);
      const stock = checkOrder(s, f.store, [...cart, line], day);
      if (!stock.ok) throw Error(stock.reason);
      cart.push(line);
    },
  });
const field = (d) => d.querySelector('[name="barcode"]');
const submit = (d) => d.querySelector("form").fire("submit");
async function key(d, key, extra = {}) {
  for (const fn of field(d).listeners.keydown)
    await fn({ key, preventDefault() {}, ...extra });
}
async function rejects(d, code, message) {
  const before = cart.length;
  field(d).value = code;
  await submit(d);
  assert(d.hasAttribute("open"));
  assert.equal(Node.activeElement, field(d));
  assert.match(d.querySelector("#form-error").textContent, message);
  assert.equal(cart.length, before);
}

let d = open();
assert.deepEqual(
  d.querySelectorAll("input,select,textarea").map((x) => x.name),
  ["barcode"],
);
assert.equal(Node.activeElement, field(d));
await rejects(d, "", /kosong/);
await rejects(d, "0001", /label buah/);
await rejects(d, a.slice(0, -1), /26 digit/);
await rejects(d, "2100010030320", /26 digit/);
await rejects(d, a.replace("000068", "000999"), /belum tercatat/);
await rejects(d, a.replace("0001" + "000228", "0002" + "000228"), /Barcode milik Bawor/);
const unit = s.fruitUnits[0];
unit.storeId = f.otherStore;
await rejects(d, a, /outlet lain/);
unit.storeId = f.store;
for (const status of ["sold", "in_transit", "reject"]) {
  unit.status = status;
  await rejects(d, a, /berstatus/);
}
unit.status = "available";
unit.grams = 300;
await rejects(d, a, /berat/);
unit.grams = 228;
batch.quality = "reject";
await rejects(d, a, /Stok kurang/);
batch.quality = "ready";
s.orders.push({
  store_id: f.store,
  status: "queued",
  reserved: { ["lot:" + batch.id]: { qty: batch.kg, pieces: batch.pieces } },
});
await rejects(d, a, /Stok kurang/);
s.orders.pop();
s.branchPrices[0].priceKg = 0;
await rejects(d, a, /Harga jual per kg/);
s.branchPrices[0].priceKg = 160000;
const before = structuredClone(s);
field(d).value = a;
await key(d, "Enter", { repeat: true });
await key(d, "Enter", { isComposing: true });
assert.equal(cart.length, 0);
await key(d, "Enter");
await submit(d);
assert.equal(cart.length, 1);
assert.deepEqual(cart[0], {
  productId: f.fruit.id,
  lotId: batch.id,
  supplierId: batch.supplierId,
  unit: "KG",
  kg: 0.228,
  pieces: 1,
  qty: 0.228,
  price: 160000,
  barcode: a,
});
assert.deepEqual(s, before);
d = open();
await rejects(d, a, /sudah ada/);
field(d).value = b;
d.close();
await submit(d);
assert.equal(cart.length, 1);
d = open([other, f.fruit]);
field(d).value = b;
await submit(d);
assert.equal(cart[1].barcode, b);
s.warehouseVersion = null;
const legacy = barcodeProduct(s, "2100010030320");
assert.throws(
  () => fruitSaleLine(s, f.store, legacy),
  /Batch asal tidak dapat ditentukan/,
);

const settings = { scanner: { prefix: "MD:", suffix: "#", terminator: "Tab" } };
globalThis.localStorage = { getItem: () => JSON.stringify(settings) };
try {
  cart.length = 0;
  d = open();
  field(d).value = "MD:" + a + "#";
  await key(d, "Tab");
  assert.equal(cart[0].barcode, a);
  d = open();
  field(d).value = b;
  await key(d, "Enter");
  assert.equal(cart[1].barcode, b);
  settings.scanner.enabled = false;
  cart.length = 0;
  d = open();
  field(d).value = a;
  await submit(d);
  assert.equal(cart[0].barcode, a);
} finally {
  delete globalThis.localStorage;
}
console.log(
  "PASS barcode-only fruit sale, branch pricing, tracked origin and availability, manual/scanner input, one fruit per scan, cancel and duplicate protection.",
);
