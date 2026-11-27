import { fruitBatchCosts } from "./supplier-notes.mjs";

const byId = (rows) => new Map(rows.map((row) => [row.id, row]));
export function costCatalog(state, storeId) {
  const lots = [...(state.lots || []), ...(state.unitLots || [])];
  const allLots = byId(lots);
  const suppliers = byId(state.suppliers || []);
  const notes = new Map(
    (state.receiptPlans || []).filter((p) => p.receivedId).map((p) => [p.receivedId, p]),
  );
  const catalog = (state.products || [])
    .map((product) => ({ product, batches: [] }))
    .sort(
      (a, b) =>
        a.product.name.localeCompare(b.product.name, "id") ||
        String(a.product.sku).localeCompare(String(b.product.sku)),
    );
  const byProduct = new Map(catalog.map((row) => [row.product.id, row]));
  for (const lot of lots) {
    const row = byProduct.get(lot.productId);
    if (!row || (storeId && lot.storeId !== storeId)) continue;
    let root = lot;
    const seen = new Set([lot.id]);
    while (allLots.has(root.sourceLotId) && !seen.has(root.sourceLotId)) {
      seen.add(root.sourceLotId);
      root = allLots.get(root.sourceLotId);
    }
    const note = notes.get(root.shipmentId);
    const fruit = lot.kg != null;
    const costs = fruit ? fruitBatchCosts(lot) : null;
    row.batches.push({
      lot,
      noteId: note?.id,
      invoice: note?.invoiceNo || root.invoiceNo || lot.invoiceNo,
      supplier: (suppliers.get(lot.supplierId) || suppliers.get(root.supplierId))?.name,
      source: note
        ? "Nota supplier"
        : {
            production: "Produksi",
            waste: "Olahan reject",
            purchase: "Pembelian",
            opening: "Stok awal",
          }[root.kind] || "Batch stok",
      price: fruit ? costs.perKg : lot.unitCost,
      perPiece: costs?.perPiece,
      unit: fruit ? "kg" : lot.unit,
      remaining: fruit ? lot.kg : lot.qty,
    });
  }
  for (const row of catalog)
    row.batches.sort(
      (a, b) =>
        String(b.lot.date || "").localeCompare(String(a.lot.date || "")) ||
        a.lot.id.localeCompare(b.lot.id),
    );
  return catalog;
}
