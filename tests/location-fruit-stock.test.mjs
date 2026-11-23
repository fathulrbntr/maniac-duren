import assert from "node:assert/strict";
import { test } from "node:test";
import { locationFruitStock } from "../pos/dashboard-data.mjs";
import { supplyHome } from "../pos/warehouse-ui.mjs";
import { Node } from "./variant-dom.mjs";

const locations = [
  { id: "wh", name: "Altara", locationType: "warehouse" },
  { id: "shop", name: "Altara", locationType: "store" },
  { id: "empty", name: "Depok", locationType: "store" },
];
const processRun = {
  id: "p1",
  storeId: "shop",
  kind: "process",
  kg: 8.5,
  outputKg: 4.25,
  lossKg: 4.25,
  outputs: [
    { key: "durpas500", qty: 3 },
    { key: "durpas1000", qty: 2 },
    { key: "coral", qty: 0.75 },
  ],
};
const fruitLine = {
  itemType: "fruit",
  unit: "BUTIR",
  kg: 3.15,
  pieces: 2,
  productId: "fruit",
  qty: 2,
  price: 100,
};
const order = {
  id: "order",
  store_id: "shop",
  status: "ready",
  payment_status: "paid",
  total: 200,
  lines: [
    fruitLine,
    { itemType: "direct", unit: "kg", productId: "coral", qty: 2, price: 25 },
  ],
};
const sale = {
  id: "sale",
  storeId: "shop",
  lines: [{ kg: 1.5, pieces: 1, unit: "KG", total: 20, productId: "fruit" }],
  total: 20,
};
const fixture = {
  warehouseVersion: 107,
  products: [],
  stores: locations,
  locations,
  lots: [
    { storeId: "shop", quality: "ready", kg: 7.5, pieces: 4 },
    { storeId: "shop", quality: "reject", kg: 4.1, pieces: 2 },
    { storeId: "shop", quality: "unripe", kg: 10, pieces: 5 },
    { storeId: "wh", quality: "ready", kg: 62.5, pieces: 30 },
  ],
  orders: [
    order,
    { ...order, id: "unpaid", payment_status: "pending" },
    { ...order, id: "cancel", status: "cancelled" },
  ],
  sales: [
    sale,
    { ...sale, id: "order" },
    { ...sale, id: "void", voided: true },
    { ...sale, storeId: "wh", id: "wholesale", sourceType: "wholesale", paid: 0 },
  ],
  rejectRecords: [
    processRun,
    { ...processRun, id: "mark", kind: "mark" },
    { ...processRun, id: "seeds", kind: "coral" },
    { ...processRun, id: "waste", kind: "loss" },
    { ...processRun, id: "discard-all", outputKg: 0, outputs: [], lossKg: 8.5 },
    { ...processRun, id: "voided", voided: true },
    { ...processRun, id: "instant", kind: "direct", storeId: "wh" },
  ],
  wasteRuns: [
    processRun,
    { ...processRun, id: "voided" },
    { ...processRun, id: "old", storeId: "wh" },
  ],
  transfers: [
    {
      sourceId: "wh",
      targetId: "shop",
      status: "received",
      total: 500,
      paid: 500,
      lines: [{ kind: "fruit", kg: 9, pieces: 3 }],
    },
  ],
};

test("location stock keeps balances, net whole-fruit sales and first-stage processing separate", () => {
  const [wh, shop, empty] = locationFruitStock(fixture);
  assert.deepEqual(shop, {
    location: locations[1],
    readyKg: 7.5,
    readyPieces: 4,
    rejectKg: 4.1,
    rejectPieces: 2,
    soldKg: 4.65,
    soldPieces: 3,
    durpas500: 3,
    durpas1000: 2,
    coral: 0.75,
    skinKg: 4.25,
  });
  assert.deepEqual(wh, {
    location: locations[0],
    readyKg: 62.5,
    readyPieces: 30,
    rejectKg: 0,
    rejectPieces: 0,
    soldKg: 1.5,
    soldPieces: 1,
    durpas500: 6,
    durpas1000: 4,
    coral: 1.5,
    skinKg: 8.5,
  });
  assert.equal(empty.location.id, "empty");
  assert(Object.entries(empty).every(([key, v]) => key === "location" || v === 0));
  assert.equal(locationFruitStock({ stores: locations })[0].soldKg, 0);
});

test("Back Office renders each location with its own packaging and weight units", () => {
  const root = new Node();
  root.innerHTML = supplyHome(fixture, "shop", "backoffice");
  const table = root.querySelector(".location-stock table");
  assert(table);
  assert.deepEqual(
    table.querySelectorAll("thead th").map((el) => el.textContent),
    [
      "Lokasi",
      "Siap",
      "Terjual",
      "Reject belum diolah",
      "Hasil pengolahan reject",
      "Durpas 500 g",
      "Durpas 1 kg",
      "Coral",
      "Kulit terbuang (est.)",
    ],
  );
  const rows = table.querySelectorAll("tbody tr");
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows[1].querySelectorAll("td").map((el) => el.textContent),
    [
      "7,5 kg4 butir",
      "4,65 kg3 butir",
      "4,1 kg2 butir",
      "3 pcs",
      "2 pcs",
      "0,75 kg",
      "4,25 kg",
    ],
  );
  assert(!supplyHome(fixture, "shop", "store").includes("location-stock-heading"));
});
