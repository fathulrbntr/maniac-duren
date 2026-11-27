import { productDefaults } from "./catalog.mjs";
import { stockReport } from "./reports.mjs";
import { inTransitLots } from "./warehouse-flow.mjs";

const index = (rows = []) => new Map(rows.map((r) => [r.id, r]));
const empty = () => ({ onHand: 0, pieces: 0, transit: 0, transitPieces: 0 });

function add(target, delta) {
  for (const key of Object.keys(target)) target[key] += delta[key];
}

export function inventorySnapshot(s) {
  const products = index(s.products);
  const rows = new Map();
  const rowFor = (productId, unit) => {
    const key = productId + "|" + unit;
    if (!rows.has(key)) {
      const product = products.get(productId) || { id: productId, name: productId };
      rows.set(key, { product, unit, places: new Map(), balance: empty() });
    }
    return rows.get(key);
  };
  for (const p of products.values())
    if (p.itemType !== "recipe") rowFor(p.id, productDefaults(p).stockUnit);
  for (const lot of [...(s.lots || []), ...(s.unitLots || []), ...inTransitLots(s)]) {
    const fruit = lot.kg != null;
    const row = rowFor(lot.productId, fruit ? "kg_butir" : lot.unit);
    const place = lot.transit ? lot.targetStoreId : lot.storeId;
    if (!row.places.has(place)) row.places.set(place, empty());
    const delta = empty();
    delta[lot.transit ? "transit" : "onHand"] = Number(fruit ? lot.kg : lot.qty);
    delta[lot.transit ? "transitPieces" : "pieces"] = Number(lot.pieces || 0);
    add(row.places.get(place), delta);
    add(row.balance, delta);
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.product.name.localeCompare(b.product.name, "id") || a.unit.localeCompare(b.unit),
  );
}

export function balanceAt(row, storeId) {
  return storeId ? row.places.get(storeId) || empty() : row.balance;
}

export function inventoryTotals(rows, storeId) {
  const totals = new Map();
  for (const row of rows) {
    if (!totals.has(row.unit)) totals.set(row.unit, empty());
    add(totals.get(row.unit), balanceAt(row, storeId));
  }
  return totals;
}

export function inventoryHistory(s, productId, storeId) {
  const selected = (l) => l.productId === productId;
  const scoped = {
    ...s,
    lots: (s.lots || []).filter(selected),
    unitLots: (s.unitLots || []).filter(selected),
    journal: (s.journal || []).filter((j) => j.product_id === productId),
  };
  const { details } = stockReport(scoped, {
    store: storeId,
    from: "0001-01-01",
    to: "9999-12-31",
  });
  const lots = index([...scoped.lots, ...scoped.unitLots]);
  const events = index(s.events),
    supply = index(s.supplyEvents),
    transfers = index(s.transfers);
  const notes = new Map(
    (s.receiptPlans || [])
      .filter((n) => n.receivedId)
      .map((n) => [n.receivedId, n.invoiceNo]),
  );
  return details
    .filter((j) => Number(j.qty) || Number(j.pieces))
    .map((j) => {
      const lot = lots.get(j.lot_id),
        event = events.get(j.event_id),
        operation = supply.get(j.event_id);
      const transfer = transfers.get(
        operation?.transferId || event?.payload?.transferId || j.event_id,
      );
      const reference =
        transfer?.deliveryNo || notes.get(lot?.shipmentId) || lot?.invoiceNo || "";
      return {
        ...j,
        reference,
        route: transfer
          ? [transfer.origin?.name, transfer.destination?.name]
              .filter(Boolean)
              .join(" → ")
          : "",
        at: event?.at || operation?.at || "",
        label:
          {
            transfer_dispatch: "Transfer keluar",
            transfer_receive: "Transfer diterima",
            receipt_batch: "Penerimaan supplier",
            receipt_intake: "Penerimaan supplier",
            opening: "Stok awal",
            sort: "Sortir buah",
            stock_adjust: "Penyesuaian stok",
            order_cancel: "Pembatalan pesanan",
            waste_void: "Pembatalan olahan",
          }[j.action] || j.label,
      };
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.at.localeCompare(a.at) ||
        Number(b.id || 0) - Number(a.id || 0),
    );
}
