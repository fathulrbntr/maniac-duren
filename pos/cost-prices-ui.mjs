import { escape as e, money, num } from "./core.mjs";
import { field, table } from "./supply-session-ui.mjs";
import { fruitBatchCosts } from "./supplier-notes.mjs";
import { openSupplierNote } from "./supplier-notes-ui.mjs";

function costTable(s, store, query = "") {
  const lots = [...(s.lots || []), ...(s.unitLots || [])];
  const byId = new Map(lots.map((lot) => [lot.id, lot]));
  const notes = new Map(
    (s.receiptPlans || []).filter((p) => p.receivedId).map((p) => [p.receivedId, p]),
  );
  const products = new Map(s.products.map((p) => [p.id, p]));
  const suppliers = new Map((s.suppliers || []).map((p) => [p.id, p.name]));
  const rows = [];
  for (const lot of lots
    .filter((l) => l.storeId === store)
    .sort(
      (a, b) => String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id),
    )) {
    let root = lot;
    const seen = new Set([lot.id]);
    while (byId.has(root.sourceLotId) && !seen.has(root.sourceLotId)) {
      seen.add(root.sourceLotId);
      root = byId.get(root.sourceLotId);
    }
    const note = notes.get(root.shipmentId);
    const invoice = note?.invoiceNo || root.invoiceNo || lot.invoiceNo;
    const product = products.get(lot.productId);
    const supplier = suppliers.get(lot.supplierId) || suppliers.get(root.supplierId);
    if (
      ![product?.name, product?.sku, supplier, invoice, lot.id].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(query),
      )
    )
      continue;
    const fruit = lot.kg != null;
    const unit = fruit ? "kg" : lot.unit;
    const costs = fruit ? fruitBatchCosts(lot) : null;
    const price = fruit ? costs.perKg : lot.unitCost;
    const doc = note
      ? `<button type="button" data-cost-note="${e(note.id)}">${e(invoice)}</button>`
      : e(invoice || "—");
    rows.push(`<tr><td>${e(lot.date || "—")}<small>${e(lot.id.slice(0, 8))}</small></td>
      <td>${e(product?.name || "—")}<small>${e(product?.sku || "")}</small></td><td>${e(supplier || "—")}<small>${doc}</small></td>
      <td>${price == null ? "—" : money(price) + " /" + e(unit)}</td>
      <td>${costs?.perPiece == null ? "—" : money(costs.perPiece)}</td>
      <td>${fruit ? `${num(lot.kg)} kg · ${num(lot.pieces)} butir` : `${num(lot.qty)} ${e(unit)}`}</td></tr>`);
  }
  if (!rows.length)
    return `<p class="muted">${query ? "Tidak ada batch yang cocok dengan pencarian." : "Belum ada batch di lokasi ini. Modal tercatat setelah penerimaan selesai."}</p>`;
  return table(
    [
      "Tanggal / batch",
      "Barang / SKU",
      "Supplier / nota",
      "Harga modal",
      "Rata-rata per butir",
      "Sisa stok",
    ],
    rows,
  );
}
export function costPricesPage(s, store, workspace) {
  if (!s.access?.backoffice || workspace !== "backoffice") return "";
  const location = s.stores.find((l) => l.id === store);
  return `<section class="supply-workspace" data-cost-prices><section class="panel">
    <h2>Modal per batch · ${e(location?.name || "Pilih lokasi aktif")}</h2>
    <p class="muted">Modal pembelian mencakup alokasi ongkir sesuai nota dan jumlah yang diterima. Untuk koreksi, buka nota supplier terkait.</p>
    ${field("Cari batch", '<input type="search" data-cost-search placeholder="Nama barang, SKU, supplier, nota, atau batch">')}
    <div data-cost-rows>${costTable(s, store)}</div></section></section>`;
}
export function bindCostPrices(s, store, ctx) {
  const root = document.querySelector("[data-cost-prices]");
  if (!root || !s.access?.backoffice || ctx.workspace !== "backoffice") return;
  const search = root.querySelector("[data-cost-search]");
  root.querySelector("[data-cost-rows]").onclick = (ev) => {
    const id = ev.target.closest("[data-cost-note]")?.dataset.costNote;
    if (!id) return;
    const current = ctx.getState();
    const note = current.receiptPlans?.find((p) => p.id === id);
    if (current.access?.backoffice && note) openSupplierNote(current, note, ctx);
  };
  search.oninput = () => {
    root.querySelector("[data-cost-rows]").innerHTML = costTable(
      s,
      store,
      search.value.trim().toLowerCase(),
    );
  };
}
