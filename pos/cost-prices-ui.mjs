import { escape as e, money, num } from "./core.mjs";
import { costCatalog } from "./cost-prices.mjs";
import { field, options, sessionDialog, table } from "./supply-session-ui.mjs";
import { openSupplierNote } from "./supplier-notes-ui.mjs";

function range(batches, key, unit) {
  const values = batches
    .map((b) => b[key])
    .filter((v) => v != null)
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return "Belum tersedia";
  const low = Math.min(...values),
    high = Math.max(...values);
  return `${money(low)}${high === low ? "" : " – " + money(high)} /${e(unit)}`;
}
function rows(catalog, query = "") {
  const matches = (value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(query);
  const products = catalog.filter(
    ({ product, batches }) =>
      !query ||
      [product.name, product.sku, product.variant].some(matches) ||
      batches.some((b) => [b.supplier, b.invoice, b.lot.id].some(matches)),
  );
  if (!products.length) return '<p class="muted">Produk tidak ditemukan.</p>';
  return table(
    ["Produk", "Harga modal", "Sumber modal", "Aksi"],
    products.map(({ product, batches }) => {
      const stocked = batches.filter((b) => b.remaining > 0);
      const basis = stocked.length ? stocked : batches.slice(0, 1);
      let price = "Belum tersedia",
        source = "Belum ada batch";
      if (basis.length) {
        const first = basis[0];
        price = range(basis, "price", first.unit);
        if (first.lot.kg != null)
          price += `<small>Rata-rata per butir · ${range(basis, "perPiece", "butir")}</small>`;
        if (basis.some((b) => b.price == null) && basis.some((b) => b.price != null))
          price += "<small>Sebagian batch belum memiliki modal</small>";
        source = stocked.length
          ? basis.length === 1
            ? e(first.source)
            : `${num(basis.length)} batch stok`
          : "Batch terakhir · Stok habis";
      }
      return `<tr data-cost-product="${e(product.id)}"><td><b>${e(product.name)}</b><small>${e(product.sku)}</small></td>
       <td>${price}</td><td>${source}</td><td><button type="button" data-cost-detail="${e(product.id)}" ${batches.length ? "" : "disabled"}>Lihat batch</button></td></tr>`;
    }),
  );
}
function openBatches(product, batches, shop, ctx) {
  const html = table(
    [
      "Tanggal / batch",
      "Supplier / nota",
      "Harga modal",
      "Rata-rata per butir",
      "Sisa stok",
    ],
    batches.map((b) => {
      const { lot, invoice } = b;
      const doc = b.noteId
        ? `<button type="button" data-cost-note="${e(b.noteId)}">${e(invoice)}</button>`
        : e(invoice || b.source);
      return `<tr><td>${e(lot.date || "—")}<small>${e(lot.id.slice(0, 8))}</small></td><td>${e(b.supplier || "—")}<small>${doc}</small></td>
      <td>${b.price == null ? "—" : money(b.price) + " /" + e(b.unit)}</td><td>${b.perPiece == null ? "—" : money(b.perPiece)}</td>
      <td>${num(b.remaining)} ${e(b.unit)}${lot.kg == null ? "" : " · " + num(lot.pieces) + " butir"}</td></tr>`;
    }),
  );
  const dialog = sessionDialog(
    ctx,
    "Modal per batch · " + product.name,
    `<p>${e(shop.name)} · ${e(product.sku)}</p>${html}`,
  );
  dialog.querySelector(".modal-actions .close")?.remove();
  dialog.querySelectorAll("[data-cost-note]").forEach((button) => {
    button.onclick = () => {
      const s = ctx.getState();
      const note = s.receiptPlans?.find((p) => p.id === button.dataset.costNote);
      if (s.access?.backoffice && note) {
        dialog.close();
        openSupplierNote(s, note, ctx);
      }
    };
  });
}
const locations = (s) => s.stores || s.locations || [];
export function costPricesPage(s, activeStore, workspace) {
  if (!s.access?.backoffice || workspace !== "backoffice" || s.stockDemo) return "";
  const shops = locations(s);
  if (!shops.length)
    return '<section class="panel"><p>Belum ada lokasi stok.</p></section>';
  const selected = shops.find((l) => l.id === activeStore)?.id || shops[0].id;
  return `<section class="supply-workspace" data-cost-prices><section class="panel"><div class="form-grid">
    ${field("Cabang toko", `<select data-cost-store>${options(shops, selected)}</select>`)}
    ${field("Cari produk", '<input type="search" data-cost-search placeholder="Nama produk atau SKU">')}</div>
    <button type="button" data-cost-refresh>Perbarui harga</button>
    <div data-cost-rows>${rows(costCatalog(s, selected))}</div></section></section>`;
}
export function bindCostPrices(s, store, ctx) {
  const root = document.querySelector("[data-cost-prices]");
  if (!root || !s.access?.backoffice || ctx.workspace !== "backoffice") return;
  const select = root.querySelector("[data-cost-store]"),
    search = root.querySelector("[data-cost-search]"),
    list = root.querySelector("[data-cost-rows]"),
    refresh = root.querySelector("[data-cost-refresh]");
  let catalog = costCatalog(s, select.value || store);
  const draw = () => {
    list.innerHTML = rows(catalog, search.value.trim().toLowerCase());
  };
  const reload = () => {
    const current = ctx.getState();
    if (!current.access?.backoffice || current.stockDemo) {
      root.innerHTML = "";
      return;
    }
    const shops = locations(current);
    const selected = shops.find((l) => l.id === select.value)?.id || shops[0]?.id;
    select.innerHTML = options(shops, selected);
    select.value = selected || "";
    catalog = costCatalog(current, selected);
    draw();
  };
  select.onchange = reload;
  search.oninput = draw;
  refresh.onclick = async () => {
    if (refresh.disabled) return;
    refresh.disabled = true;
    try {
      await ctx.refresh();
      reload();
    } catch (err) {
      ctx.toast(err.message);
    } finally {
      refresh.disabled = false;
    }
  };
  list.onclick = (ev) => {
    const id = ev.target.closest("[data-cost-detail]")?.dataset.costDetail;
    const current = ctx.getState();
    if (!id || !current.access?.backoffice || current.stockDemo) return;
    const shop = locations(current).find((x) => x.id === select.value);
    if (!shop) return;
    const row = costCatalog(current, shop.id).find((r) => r.product.id === id);
    if (row?.batches.length) openBatches(row.product, row.batches, shop, ctx);
  };
}
