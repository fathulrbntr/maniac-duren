import assert from "node:assert/strict";
import { emptyState, applyAction, today } from "../pos/core.mjs";
import { wastePage } from "../pos/waste-ui.mjs";
let s = emptyState();
s.stores = [
  { id: "a", name: "Store A" },
  { id: "b", name: "Store B" },
];
s.suppliers = [
  { id: "x", name: "Supplier X" },
  { id: "y", name: "Supplier Y" },
];
const add = (p) => {
  s = applyAction(s, "product_save", p);
};
add({
  id: "durian",
  name: "Durian",
  sku: "D",
  itemType: "direct",
  category: "Buah",
  stockUnit: "kg_butir",
  priceKg: 50000,
  pricePiece: 100000,
});
for (const [id, name, unit] of [
  ["half", "Durpas 500 gr", "pcs"],
  ["one", "Durpas 1 kg", "pcs"],
  ["coral", "Coral", "kg"],
])
  add({
    id,
    name,
    sku: id,
    itemType: "finished",
    category: "Olahan Duren",
    stockUnit: unit,
    salePrice: 100000,
  });
for (const [id, storeId, supplierId, date] of [
  ["lot1", "a", "x", "2026-01-01"],
  ["lot2", "a", "y", "2026-01-01"],
  ["other", "b", "x", "2026-01-01"],
  ["later", "a", "x", "2026-01-02"],
])
  s = applyAction(s, "receipt", {
    id,
    storeId,
    supplierId,
    productId: "durian",
    date,
    kg: 100,
    pieces: 40,
  });
const p = {
  id: "w1",
  storeId: "a",
  date: today(),
  receivedDate: "2026-01-01",
  sourceLotId: "lot1",
  kg: 10,
  pieces: 4,
  reason: "Sortasi",
  outputs: [
    { key: "durpas500", productId: "half", qty: 4, lotId: "h" },
    { key: "durpas1000", productId: "one", qty: 2, lotId: "o" },
    { key: "coral", productId: "coral", qty: 1.25, lotId: "c" },
  ],
};
const before = structuredClone(s);
s = applyAction(s, "waste_process", p);
const photo = "data:image/png;base64,iVBORw0KGgo=";
const withEvidence = applyAction(before, "waste_process", {
  ...p,
  evidence: { reject: photo, processed: photo },
});
assert.equal(withEvidence.wasteRuns[0].evidence.reject, photo);
assert.equal(
  applyAction(withEvidence, "waste_void", {
    id: "proof-void",
    wasteId: "w1",
    reason: "Koreksi",
  }).wasteRuns[0].evidence.processed,
  photo,
);
assert(wastePage(withEvidence, "a").includes("Lihat bukti"));
assert.throws(
  () =>
    applyAction(before, "waste_process", {
      ...p,
      evidence: {
        reject:
          "data:image/png;base64," + Buffer.alloc(2097153).toString("base64"),
      },
    }),
  /2 MB/,
);
assert.equal(before.lots[0].kg, 100);
assert.equal(s.lots[0].kg, 90);
assert.equal(s.lots[0].pieces, 36);
assert.deepEqual(s.lots.slice(1), before.lots.slice(1));
assert.deepEqual(
  s.unitLots.map((l) => [l.qty, l.unit, l.supplierId, l.kind]),
  [
    [4, "pcs", "x", "waste"],
    [2, "pcs", "x", "waste"],
    [1.25, "kg", "x", "waste"],
  ],
);
assert.equal(s.wasteRuns[0].lossKg, 4.75);
assert.equal(s.wasteRuns[0].outputKg, 5.25);
assert.deepEqual(applyAction(s, "waste_process", p), s);
for (const patch of [
  { receivedDate: "2026-01-02" },
  { storeId: "b" },
  { kg: 101 },
  { reason: "" },
])
  assert.throws(() => applyAction(before, "waste_process", { ...p, ...patch }));
assert.throws(
  () => applyAction(before, "waste_process", { ...p, kg: 5 }),
  /melebihi/,
);
assert.throws(
  () =>
    applyAction(before, "waste_process", {
      ...p,
      outputs: p.outputs.map((o, i) => (i === 0 ? { ...o, qty: 1.5 } : o)),
    }),
  /bulat/,
);
assert.throws(
  () =>
    applyAction(before, "waste_process", {
      ...p,
      outputs: p.outputs.map((o, i) =>
        i === 1 ? { ...o, productId: "half" } : o,
      ),
    }),
  /berbeda/,
);
assert.throws(
  () =>
    applyAction(before, "waste_process", {
      ...p,
      outputs: p.outputs.map((o, i) => (i === 1 ? { ...o, lotId: "h" } : o)),
    }),
  /ID batch/,
);
const used = structuredClone(s);
used.unitLots[0].qty = 3;
assert.throws(
  () =>
    applyAction(used, "waste_void", {
      id: "cancel",
      wasteId: "w1",
      reason: "Salah input",
    }),
  /sudah dipakai/,
);
assert.equal(used.lots[0].kg, 90);
const cancelled = applyAction(s, "waste_void", {
  id: "cancel",
  wasteId: "w1",
  reason: "Salah input",
});
assert.deepEqual(cancelled.lots, before.lots);
assert(cancelled.unitLots.every((x) => x.qty === 0));
assert(cancelled.wasteRuns[0].voided);
assert.equal(cancelled.wasteRuns[0].voidReason, "Salah input");
assert.deepEqual(
  applyAction(cancelled, "waste_void", {
    id: "cancel2",
    wasteId: "w1",
    reason: "Ulang",
  }),
  cancelled,
);
const total = applyAction(before, "waste_process", {
  ...p,
  outputs: p.outputs.map((o) => ({ ...o, qty: 0 })),
});
assert.equal(total.wasteRuns[0].lossKg, 10);
assert.equal(total.unitLots.length, 0);
assert.deepEqual(
  applyAction(total, "waste_void", {
    id: "cancel",
    wasteId: "w1",
    reason: "Koreksi",
  }).lots,
  before.lots,
);
assert(wastePage(cancelled, "a").includes("Dihapus / dibatalkan"));
assert(!wastePage(cancelled, "b").includes("Salah input"));
assert.equal(before.unitLots.length, 0);
assert.equal(before.lots[0].kg, 100);
console.log(
  "PASS: exact date/batch/store/supplier, three output units, weight balance, rollback, duplicate save, invalid outputs, total waste, guarded reversal, history and store isolation.",
);
