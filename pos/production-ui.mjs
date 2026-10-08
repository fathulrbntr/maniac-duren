import { itemTypes } from "./catalog.mjs?v=59";
import { mayLeave } from "./navigation.mjs?v=9";
import { escape as e, num, today, id } from "./core.mjs?v=9";
import {
  scalar,
  inputTypes,
  outputTypes,
  unitLabel,
  recipeValues,
  productionPreview,
  stockQty,
} from "./production.mjs?v=59";
const inputCost = () => '<input name="totalCost" type="number" min="0" step="any" required placeholder="Harga beli + ongkos masuk">';
const field = (label, body) => `<label class="field">${label}${body}</label>`;
const opts = (items, selected) =>
  items
    .map(
      (p) =>
        `<option value="${e(p.id)}" ${p.id === selected ? "selected" : ""}>${e(p.name)}</option>`,
    )
    .join("");
const item = (s, key) => s.products.find((p) => p.id === key);
function setQuantityUnit(input, unit) {
  const whole = ["pcs", "porsi"].includes(unit);
  input.min = whole ? "1" : "0.000001";
  input.step = whole ? "1" : "any";
}
const ingredientsText = (lines) =>
  lines
    .map((l) => `${e(l.name)}: ${num(l.qty)} ${e(unitLabel[l.unit] || l.unit)}`)
    .join("<br>");
const recipeState = (s, r) => {
  const needs = r.ingredients.map((l) => {
    const p = item(s, l.productId);
    return { name: p?.name || "Item dihapus", qty: Number(l.qty), unit: p?.stockUnit };
  });
  return { needs };
};
export function recipesPage(s, store) {
  const recipes = s.recipes || [];
  return `<div class="intro recipe-workspace"><div><div class="eyebrow">MASTER DATA GLOBAL</div><h2>Master Resep</h2><p class="muted">Resep berlaku untuk semua store. Stok baru diperiksa saat produksi di store tujuan.</p></div><div class="intro-actions"><button data-view="stock">Lihat stok</button><button data-view="production">Produksi bahan</button><button class="primary" id="new-recipe">Tambah resep</button></div></div><div class="summary-grid"><div class="summary-card"><span>Total resep global</span><b>${recipes.length}</b></div><div class="summary-card"><span>Cakupan</span><b class="positive">Semua store</b></div><div class="summary-card"><span>Status</span><b>Aktif</b></div></div><section class="panel"><div class="toolbar"><input id="recipe-search" placeholder="Cari nama resep atau hasil..." autocomplete="off"><select id="recipe-status"><option value="all">Semua resep</option></select></div><div class="recipe-grid" id="recipe-cards">${recipes.map((r) => { const out = item(s, r.outputId), state = recipeState(s, r); return `<article class="recipe-card" data-recipe-card data-recipe-search="${e(`${r.name} ${out?.name || ""}`.toLowerCase())}" data-recipe-status="global"><div class="card-heading"><div><h3>${e(r.name)}</h3><small>Versi ${e(r.version)} · Berlaku semua store</small></div><span class="status-pill status-success">Global</span></div><div class="recipe-output"><span>Hasil per batch</span><b>${num(r.yieldQty)} ${e(unitLabel[out?.stockUnit] || out?.stockUnit || "")}</b><small>${e(out?.name || "Item tidak ditemukan")}</small></div><div class="recipe-ingredients">${ingredientsText(state.needs)}</div><p class="muted">Ketersediaan bahan ditentukan di halaman Produksi berdasarkan store aktif.</p><button class="small" data-edit-recipe="${e(r.id)}">Edit resep</button></article>`; }).join("") || '<div class="empty">Belum ada resep. Daftarkan bahan dan hasil produksi di Master data.</div>'}</div></section>`;
}
export function productionPage(s, store) {
  const rows = (s.productions || []).filter((r) => r.storeId === store).slice().reverse();
  return `<div class="intro production-workspace"><div><div class="eyebrow">STOK BAHAN</div><h2>Produksi dari resep</h2><p class="muted">Potong bahan dan masukkan hasil produksi ke stok dalam satu transaksi.</p></div><div class="intro-actions"><button data-view="recipes">Master resep</button><button data-view="stock">Lihat stok</button><button id="refresh-production">Perbarui stok</button></div></div><div class="summary-grid"><div class="summary-card"><span>Total produksi</span><b>${rows.length}</b></div><div class="summary-card"><span>Produksi aktif</span><b class="positive">${rows.filter((r) => !r.voided).length}</b></div><div class="summary-card"><span>Dibatalkan</span><b>${rows.filter((r) => r.voided).length}</b></div></div><section class="production-layout"><section class="panel"><div class="section-heading"><div><h3>Catat produksi</h3><p class="muted">Stok bahan diperiksa otomatis sebelum disimpan.</p></div></div><form id="production-form"><div class="form-grid">${field("Resep", `<select name="recipeId" required><option value="">Pilih resep</option>${opts(s.recipes || [])}</select>`)}${field("Tanggal produksi", `<input name="date" type="date" value="${today()}" required>`)}${field("Berapa kali resep dibuat?", '<input name="batches" type="number" min="1" max="10000" step="1" value="1" required>')}${field("Hasil aktual (sesuai satuan resep)", '<input name="actualQty" type="number" min="0.000001" step="any" required>')}${field("Kedaluwarsa hasil (opsional)", '<input name="expiry" type="date">')}${field("Catatan", '<input name="note" maxlength="300" placeholder="Contoh: produksi pagi">')}</div><div id="production-preview" aria-live="polite"><p class="muted">Pilih resep untuk melihat kebutuhan bahan.</p></div><p class="error" id="production-error"></p><button type="submit" class="primary" ${store ? "" : "disabled"}>Simpan produksi & potong bahan</button></form></section><aside class="panel production-guide"><h3>Alur stok</h3><div class="flow-step"><b>1</b><span>Pilih resep dan jumlah batch.</span></div><div class="flow-step"><b>2</b><span>Sistem cek stok bahan layak pakai.</span></div><div class="flow-step"><b>3</b><span>Simpan: bahan berkurang, hasil masuk stok.</span></div><button data-view="stock">Tambah stok bahan</button></aside></section><section class="panel"><div class="section-heading"><div><h3>Riwayat produksi store ini</h3><p class="muted">Klik batal hanya untuk salah pencatatan sebelum hasil dipakai.</p></div><div class="toolbar compact"><input id="production-search" placeholder="Cari resep atau tanggal..." autocomplete="off"><select id="production-status"><option value="all">Semua status</option><option value="active">Aktif</option><option value="voided">Dibatalkan</option></select></div></div><div class="production-history" id="production-history">${rows.map((r) => `<article class="production-card" data-production-card data-production-search="${e(`${r.date} ${r.recipeName} ${r.outputName}`.toLowerCase())}" data-production-status="${r.voided ? "voided" : "active"}"><div class="card-heading"><div><h3>${e(r.recipeName)}</h3><small>${e(r.date)} · ${e(r.id.slice(0, 8))} · v${e(r.recipeVersion)} · ${num(r.batches)} batch</small></div><span class="status-pill ${r.voided ? "status-danger" : "status-success"}">${r.voided ? "Dibatalkan" : "Aktif"}</span></div><div class="production-result"><b>${num(r.actualQty)} ${e(unitLabel[r.unit])}</b><span>${e(r.outputName)}</span><small>Target ${num(r.expectedQty)}</small></div><div class="recipe-ingredients">${ingredientsText(r.ingredients)}</div>${r.voided ? `<p class="muted">${e(r.voidReason || "Tanpa alasan")}</p>` : `<button class="small danger" data-void-production="${e(r.id)}">Batalkan pencatatan</button>`}</article>`).join("") || '<div class="empty">Belum ada produksi di store ini.</div>'}</div></section>`;
}
export function unitStockPanel(s, store) {
  const lots = (s.unitLots || []).filter((l) => l.storeId === store);
  return `<section class="panel"><div class="header-row"><h3>Stok bahan & hasil produksi</h3></div><p class="muted">Bahan siap dipakai produksi. ${e(itemTypes.direct)}, ${e(itemTypes.finished)}, dan ${e(itemTypes.recipe)} dijual melalui Kasir & pesanan.</p><div class="table-wrap"><table><thead><tr><th>ITEM</th><th>STOK FISIK TERCATAT</th><th>LAYAK PAKAI HARI INI</th></tr></thead><tbody>${
    s.products
      .filter(scalar)
      .map(
        (p) =>
          `<tr><td>${e(p.name)}</td><td>${num(lots.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0))} ${e(unitLabel[p.stockUnit])}</td><td>${num(stockQty(s, p.id, store, today()))} ${e(unitLabel[p.stockUnit])}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="3" class="empty">Daftarkan bahan dan hasil produksi di Master data.</td></tr>'
  }</tbody></table></div><details><summary>Rincian penerimaan dan batch hasil</summary><div class="table-wrap"><table><thead><tr><th>TANGGAL / BATCH</th><th>ITEM / ASAL</th><th>AWAL → SISA</th><th>KEDALUWARSA / CATATAN</th></tr></thead><tbody>${lots
    .slice()
    .reverse()
    .map(
      (l) =>
        `<tr><td>${e(l.date)}<br><small>${e(l.id.slice(0, 8))}</small></td><td>${e(item(s, l.productId)?.name)}<br><small>${e({ opening: "Stok awal", purchase: "Pembelian", production: "Hasil produksi", waste: "Hasil waste / olahan" }[l.kind])}${l.supplierId ? " · " + e(s.suppliers.find((x) => x.id === l.supplierId)?.name) : ""}</small></td><td>${num(l.receivedQty)} → ${num(l.qty)} ${e(unitLabel[l.unit])}</td><td>${e(l.expiry || "—")}<br><small>${e(l.note)}</small></td></tr>`,
    )
    .join("")}</tbody></table></div></details></section>`;
}
export function recipeDialog(s, ctx, existing) {
  const outputs = s.products.filter(
      (p) => scalar(p) && outputTypes.includes(p.itemType),
    ),
    inputs = s.products.filter(
      (p) => scalar(p) && inputTypes.includes(p.itemType),
    );
  if (!outputs.length || !inputs.length)
    return ctx.toast(
      "Daftarkan bahan dan item hasil produksi di Master data terlebih dahulu",
    );
  const r = existing || {
    id: id(),
    name: "",
    outputId: outputs[0].id,
    yieldQty: 1,
    version: 0,
    ingredients: [{ productId: inputs[0].id, qty: 1 }],
  };
  const d = ctx.modal(
    existing ? "Edit resep" : "Tambah resep",
    `${field("Nama resep", `<input name="name" value="${e(r.name)}" required maxlength="100">`)}${field("Item hasil produksi", `<select name="outputId">${opts(outputs, r.outputId)}</select>`)}${field("Jumlah hasil untuk satu kali resep", `<input name="yieldQty" type="number" min="0.000001" step="any" value="${r.yieldQty}" required>`)}<p class="muted" id="yield-unit"></p><div id="recipe-lines"></div><button type="button" id="add-ingredient">Tambah bahan</button><p class="muted">Gunakan satuan master bahan. Contoh: 1 kg tepung diisi 1000 gram. Resep cendol mengonsumsi tepung; resep dessert mengonsumsi stok cendol yang sudah jadi.</p>`,
  );
  const f = d.querySelector("form"),
    control = (n) => f.elements.namedItem(n);
  let rows = r.ingredients.map((x) => ({ ...x }));
  const capture = () => {
    rows = [...d.querySelectorAll("[data-ingredient-row]")].map((row) => ({
      productId: row.querySelector("select").value,
      qty: row.querySelector("input").value,
    }));
  };
  function draw() {
    d.querySelector("#recipe-lines").innerHTML = rows
      .map(
        (l, i) =>
          `<div class="recipe-line" data-ingredient-row>${field("Bahan", `<select>${opts(inputs, l.productId)}</select>`)}${field("Jumlah (" + e(unitLabel[item(s, l.productId)?.stockUnit]) + ")", `<input type="number" min="0.000001" step="any" value="${e(l.qty)}" required>`)}<button type="button" data-remove-ingredient="${i}" aria-label="Hapus bahan ${i + 1}">×</button></div>`,
      )
      .join("");
    d.querySelectorAll("[data-remove-ingredient]").forEach(
      (b) =>
        (b.onclick = () => {
          capture();
          rows.splice(Number(b.dataset.removeIngredient), 1);
          draw();
        }),
    );
    d.querySelectorAll("[data-ingredient-row] select").forEach(
      (el) =>
        (el.onchange = () => {
          capture();
          draw();
        }),
    );
  }
  d.querySelector("#add-ingredient").onclick = () => {
    capture();
    if (rows.length >= 50) return ctx.toast("Maksimal 50 bahan");
    rows.push({ productId: inputs[0].id, qty: 1 });
    draw();
  };
  const outputChanged = () => {
    const p = item(s, control("outputId").value);
    d.querySelector("#yield-unit").textContent =
      "Satuan hasil: " + unitLabel[p.stockUnit];
    setQuantityUnit(control("yieldQty"), p.stockUnit);
  };
  control("outputId").onchange = outputChanged;
  outputChanged();
  draw();
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    capture();
    try {
      const values = recipeValues(s, {
        ...Object.fromEntries(new FormData(f)),
        ingredients: rows,
      });
      if (
        await ctx.mutate("recipe_save", {
          id: r.id,
          version: r.version,
          ...values,
        })
      ) {
        d.close();
        ctx.render();
        ctx.toast("Resep tersimpan");
      }
    } catch (err) {
      d.querySelector("#form-error").textContent = err.message;
    }
  };
}
export function receiptDialog(s, store, ctx) {
  const products = s.products.filter(scalar);
  if (!store || !products.length)
    return ctx.toast("Pilih store dan daftarkan item terlebih dahulu");
  const requestId = id();
  const d = ctx.modal(
    "Stok bahan / stok awal",
    `${field("Jenis penerimaan", '<select name="kind"><option value="purchase">Pembelian</option><option value="opening">Stok awal yang sudah tersedia</option></select>')}${field("Item", '<select name="productId" required></select>')}<p class="muted" id="receipt-unit"></p>${field("Total modal penerimaan (Rp)", inputCost())}${field("Jumlah", '<input name="qty" type="number" min="0.000001" step="any" required>')}${field("Tanggal masuk", `<input name="date" type="date" value="${today()}" required>`)}<div id="supplier-field">${field("Supplier", `<select name="supplierId"><option value="">Pilih supplier</option>${opts(s.suppliers)}</select>`)}</div>${field("Kedaluwarsa (opsional)", '<input name="expiry" type="date">')}${field("Catatan", '<input name="note" maxlength="300" placeholder="Wajib untuk stok awal">')}`,
  );
  const f = d.querySelector("form"),
    c = (n) => f.elements.namedItem(n);
  const unit = () => {
    const p = item(s, c("productId").value);
    d.querySelector("#receipt-unit").textContent = p
      ? "Satuan: " + unitLabel[p.stockUnit]
      : "Belum ada item untuk jenis penerimaan ini";
    setQuantityUnit(c("qty"), p?.stockUnit);
  };
  const refresh = () => {
    const purchase = c("kind").value === "purchase";
    c("productId").innerHTML = opts(
      products.filter(
        (p) => !purchase || ["raw", "direct"].includes(p.itemType),
      ),
    );
    c("supplierId").required = purchase;
    c("supplierId").disabled = !purchase;
    d.querySelector("#supplier-field").hidden = !purchase;
    c("note").required = !purchase;
    unit();
  };
  c("kind").onchange = refresh;
  c("productId").onchange = unit;
  refresh();
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if (
      await ctx.mutate("unit_receipt", {
        ...Object.fromEntries(new FormData(f)),
        id: requestId,
        storeId: store,
      })
    ) {
      d.close();
      ctx.render();
      ctx.toast("Stok tersimpan");
    }
  };
}
export function bindProduction(view, s, store, ctx) {
  document
    .querySelector("#unit-receipt")
    ?.addEventListener("click", () => receiptDialog(s, store, ctx));
  if (view === "recipes") {
    const filterRecipes = () => {
      const q = (document.querySelector("#recipe-search")?.value || "").toLowerCase().trim();
      const status = document.querySelector("#recipe-status")?.value || "all";
      document.querySelectorAll("[data-recipe-card]").forEach((card) => {
        card.hidden = (q && !card.dataset.recipeSearch.includes(q)) || (status !== "all" && card.dataset.recipeStatus !== status);
      });
    };
    document.querySelector("#recipe-search")?.addEventListener("input", filterRecipes);
    document.querySelector("#recipe-status")?.addEventListener("change", filterRecipes);
    document.querySelector("#new-recipe").onclick = () => recipeDialog(s, ctx);
    document.querySelectorAll("[data-edit-recipe]").forEach(
      (b) =>
        (b.onclick = () =>
          recipeDialog(
            s,
            ctx,
            s.recipes.find((r) => r.id === b.dataset.editRecipe),
          )),
    );
  }
  if (view !== "production") return;
  const filterProduction = () => {
    const q = (document.querySelector("#production-search")?.value || "").toLowerCase().trim();
    const status = document.querySelector("#production-status")?.value || "all";
    document.querySelectorAll("[data-production-card]").forEach((card) => {
      card.hidden = (q && !card.dataset.productionSearch.includes(q)) || (status !== "all" && card.dataset.productionStatus !== status);
    });
  };
  document.querySelector("#production-search")?.addEventListener("input", filterProduction);
  document.querySelector("#production-status")?.addEventListener("change", filterProduction);
  document.querySelector("#refresh-production").onclick = async () => {
    if (!mayLeave(false)) return;
    try {
      await ctx.refresh();
      ctx.render();
    } catch (err) {
      ctx.toast(err.message);
    }
  };
  const f = document.querySelector("#production-form"),
    c = (n) => f.elements.namedItem(n),
    submit = f.querySelector('button[type="submit"]'),
    requestId = id();
  function preview(resetActual = false) {
    try {
      const recipe = (s.recipes || []).find(
        (r) => r.id === c("recipeId").value,
      );
      if (!recipe) throw Error("Pilih resep terlebih dahulu");
      const plan = productionPreview(
        s,
        recipe,
        store,
        c("batches").value,
        c("date").value,
      );
      if (resetActual) c("actualQty").value = plan.expectedQty;
      setQuantityUnit(c("actualQty"), plan.outputUnit);
      document.querySelector("#production-preview").innerHTML =
        `<div class="callout">Hasil standar: <b>${num(plan.expectedQty)} ${e(unitLabel[plan.outputUnit])} ${e(plan.outputName)}</b>. Isi hasil aktual sesuai produksi nyata; kebutuhan bahan mengikuti jumlah resep.</div><div class="table-wrap"><table><thead><tr><th>BAHAN</th><th>DIBUTUHKAN</th><th>TERSEDIA PADA TANGGAL PRODUKSI</th></tr></thead><tbody>${plan.ingredients.map((l) => `<tr><td>${e(l.name)}</td><td>${num(l.qty)} ${e(unitLabel[l.unit])}</td><td class="${l.available < l.qty ? "error" : ""}">${num(l.available)} ${e(unitLabel[l.unit])}${l.available < l.qty ? " · Kurang" : ""}</td></tr>`).join("")}</tbody></table></div>`;
      const unavailable = plan.ingredients.some((l) => l.available < l.qty);
      document.querySelector("#production-error").textContent = unavailable
        ? "STOK HABIS: satu atau lebih ingredients belum tersedia. Produksi tidak dapat dibuat."
        : "";
      submit.disabled = unavailable || !store;
      return { recipe, plan };
    } catch (err) {
      document.querySelector("#production-error").textContent = err.message;
      submit.disabled = true;
      return null;
    }
  }
  c("recipeId").onchange = () => preview(true);
  c("batches").oninput = () => preview(true);
  c("date").onchange = () => preview(false);
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const result = preview();
    if (!result) return;
    const { recipe, plan } = result;
    if (plan.ingredients.some((l) => l.available < l.qty)) return;
    if (
      await ctx.mutate("produce", {
        ...Object.fromEntries(new FormData(f)),
        id: requestId,
        storeId: store,
        recipeVersion: recipe.version,
      })
    ) {
      ctx.render();
      ctx.toast("Produksi tersimpan: bahan berkurang dan hasil masuk stok");
    }
  };
  document.querySelectorAll("[data-void-production]").forEach(
    (b) =>
      (b.onclick = () => {
        const d = ctx.modal(
          "Batalkan pencatatan produksi",
          `${field("Alasan", '<input name="reason" required maxlength="300">')}<p class="muted">Hanya untuk salah pencatatan dan hasil yang belum digunakan. Seluruh bahan dikembalikan ke batch asal.</p>`,
          "Batalkan produksi",
        );
        d.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          if (
            await ctx.mutate("production_void", {
              id: id(),
              productionId: b.dataset.voidProduction,
              reason: new FormData(ev.currentTarget).get("reason"),
            })
          ) {
            d.close();
            ctx.render();
            ctx.toast("Produksi dibatalkan; bahan dikembalikan");
          }
        };
      }),
  );
}
