import { escape as e, money, id } from "./core.mjs";
import { categoryEligible } from "./pos-categories.mjs";
import { productWithRate } from "./branch-prices.mjs";
import { field, table } from "./supply-session-ui.mjs";

const branches = (s) =>
  (s.locations || s.stores || []).filter((st) => st.locationType === "store");
const displayPrice = (n, u) => (n == null ? "Belum diisi" : `${money(n)} /${e(u)}`);
function rows(s, branch, query) {
  if (!branch) return '<p class="muted">Pilih cabang toko untuk melihat harga jual.</p>';
  const rates = new Map(
    (s.branchPrices || [])
      .filter((r) => r.storeId === branch)
      .map((r) => [r.productId, r]),
  );
  const products = (s.products || [])
    .filter(
      (p) =>
        categoryEligible(p) &&
        [p.name, p.sku, p.variant].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  if (!products.length) return '<p class="muted">Produk jual tidak ditemukan.</p>';
  return table(
    ["Produk", "Harga jual", "Sumber harga", "Aksi"],
    products.map((p) => {
      const effective = productWithRate(p, rates.get(p.id));
      const price =
        p.stockUnit === "kg_butir"
          ? displayPrice(effective.priceKg, "kg") +
            "<small>" +
            displayPrice(effective.pricePiece, "butir") +
            "</small>"
          : displayPrice(effective.salePrice, p.stockUnit);
      return `<tr><td><b>${e(p.name)}</b><small>${e(p.sku)}</small></td><td>${price}</td><td>${effective === p ? "Master Barang" : "Khusus cabang"}</td><td><button type="button" data-edit-retail="${e(p.id)}">Atur harga</button></td></tr>`;
    }),
  );
}
export function branchPricingPage(state, activeStore) {
  if (state.stockDemo)
    return '<section class="panel"><p>Pengaturan harga cabang tersedia di Back Office operasional.</p></section>';
  if (!(state.branchPricingVersion >= 123))
    return '<section class="panel"><p>Pasang pembaruan database harga jual cabang 123, lalu muat ulang POS.</p></section>';
  const shops = branches(state);
  if (!shops.length)
    return '<section class="panel"><p>Belum ada cabang toko. Tambahkan cabang melalui pengaturan lokasi.</p></section>';
  const selected = shops.find((s) => s.id === activeStore)?.id || "";
  return `<section class="supply-workspace" data-branch-pricing><section class="panel"><div class="form-grid">${field("Cabang toko", `<select data-retail-store><option value="">Pilih cabang toko</option>${shops.map((st) => `<option value="${e(st.id)}" ${st.id === selected ? "selected" : ""}>${e(st.name)}</option>`).join("")}</select>`)}${field("Cari produk", '<input type="search" data-retail-search placeholder="Nama produk atau SKU">')}</div><button type="button" data-retail-refresh>Perbarui harga</button><div data-retail-rows>${rows(state, selected, "")}</div></section></section>`;
}
export function bindBranchPricing(ctx) {
  const root = document.querySelector("[data-branch-pricing]");
  if (!root) return;
  const select = root.querySelector("[data-retail-store]"),
    search = root.querySelector("[data-retail-search]"),
    list = root.querySelector("[data-retail-rows]");
  const draw = () => {
    list.innerHTML = rows(ctx.getState(), select.value, search.value);
  };
  root.querySelector("[data-retail-refresh]").addEventListener("click", async () => {
    try {
      await ctx.refresh();
      draw();
    } catch (error) {
      ctx.toast(error.message);
    }
  });
  select.addEventListener("change", draw);
  search.addEventListener("input", draw);
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-retail]");
    if (!button) return;
    const state = ctx.getState(),
      shop = branches(state).find((st) => st.id === select.value),
      p = state.products.find((item) => item.id === button.dataset.editRetail);
    if (!shop || !p || !categoryEligible(p)) return;
    const row = (state.branchPrices || []).find(
      (r) => r.storeId === shop.id && r.productId === p.id,
    );
    const current = productWithRate(p, row);
    const fields =
      p.stockUnit === "kg_butir"
        ? [
            ["priceKg", "kg"],
            ["pricePiece", "butir"],
          ]
        : [["salePrice", p.stockUnit]];
    const dialog = ctx.modal(
      "Harga jual · " + e(p.name),
      `<p><b>${e(shop.name)}</b></p>${field("Sumber harga", `<select name="source"><option value="branch">Harga khusus cabang</option><option value="master">Ikuti Master Barang</option></select>`)}<div data-retail-inputs class="form-grid">${fields.map(([key, u]) => field("Harga jual per " + u + " (Rp)", `<input name="${key}" type="number" min="0.01" max="1000000000000" step="0.01" value="${e(current[key] ?? "")}" required>`)).join("")}</div><p class="muted">Harga master · ${fields.map(([k, u]) => displayPrice(p[k], u)).join(" · ")}</p>`,
      "Simpan harga",
    );
    const form = dialog.querySelector("form"),
      source = form.elements.namedItem("source"),
      inputs = dialog.querySelector("[data-retail-inputs]");
    source.onchange = () => {
      const follow = source.value === "master";
      inputs.hidden = follow;
      inputs.querySelectorAll("input").forEach((i) => (i.disabled = follow));
    };
    const request = id();
    let saving = false;
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (saving || !form.reportValidity()) return;
      const inherit = source.value === "master";
      const payload = {
        id: request,
        storeId: shop.id,
        productId: p.id,
        stockUnit: p.stockUnit,
        expectedRevision: row?.revision || 0,
        inherit,
      };
      if (!inherit)
        for (const [key] of fields)
          payload[key] = Number(form.elements.namedItem(key).value);
      saving = true;
      try {
        await ctx.mutate("branch_price_save", payload, { throwOnError: true });
        dialog.dataset.dirty = "false";
        dialog.close();
        draw();
        ctx.toast("Harga jual tersimpan untuk " + shop.name + ".");
      } catch (error) {
        dialog.querySelector("#form-error").textContent = error.message;
      } finally {
        saving = false;
      }
    };
  });
}
