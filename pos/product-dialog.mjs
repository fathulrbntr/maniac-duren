import {posCategoryName} from './pos-categories.mjs?v=52';
import { variantEditorMarkup, bindVariantEditor } from "./variant-editor.mjs?v=45";
import {
  categories,
  itemTypes,
  stockUnits,
  productDefaults,
  isLegacyStock,
  normalizeProduct,
} from "./catalog.mjs?v=59";
import { escape as e, id, num, money } from "./core.mjs?v=9";
import { preparePhoto } from "./product-details.mjs?v=9";
import { productStock, productUsed } from "./product-stock.mjs?v=60";
const options = (values, selected) =>
  Object.entries(values)
    .map(
      ([key, text]) =>
        `<option value="${e(key)}" ${key === selected ? "selected" : ""}>${e(text)}</option>`,
    )
    .join("");
const field = (name, input) => `<label class="field">${name}${input}</label>`;
export function productDialog({
  product,
  state,
  store,
  modal,
  mutate,
  render,
  toast,
}) {
  const editing = !!product,
    p = productDefaults(product || {}),
    productId = p.id || id(),
    locked = editing && (productUsed(state, p.id) || !!p.variantGroupId),
    adjustmentId = id();
  let photo = p.photo || "",
    photoBusy = false,
    photoSequence = 0,
    saving = false;
  const d = modal(
    editing ? "Edit produk / bahan" : "Tambah produk / bahan",
    `
 <div class="product-photo-editor"><img id="photo-preview" alt="Pratinjau foto produk" ${photo ? `src="${e(photo)}"` : "hidden"}><div>${field("Foto produk", '<input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp">')}<small>JPG, PNG, WebP. Otomatis diperkecil; hasil maksimal 2 MB.</small><p id="photo-status" role="status"></p><button type="button" id="remove-photo">Hapus foto</button></div></div>
 <div class="form-grid">${field("Nama barang", `<input name="name" value="${e(p.name || "")}" required maxlength="100" placeholder="Contoh: Durian Musang King" ${p.variantGroupId?'readonly':''}>`)}${field("Jenis barang", `<select name="itemType" ${locked ? "disabled" : ""}>${options(itemTypes, p.itemType)}</select>`)}<input type="hidden" name="category" value="${e(p.category||'')}">${field("Satuan stok", `<select name="stockUnit" ${locked ? "disabled" : ""}>${options(stockUnits, p.stockUnit)}</select>`)}</div>
 <p class="muted">${locked ? "Jenis dan satuan mengikuti barang yang sudah terdaftar." : "Gunakan gram untuk berat bahan dan ml untuk cairan."}</p>
 <section class="product-shared-categories" aria-label="Kategori produk"><span>Kategori</span><strong data-product-category-names>${e(editing?posCategoryName(state,p):'Semua')}</strong><p data-product-category-help>Kategori mengikuti Master Barang, Stok, dan POS. Setelah menyimpan barang, gunakan Kelola kategori → pilih kategori → Tambah produk dari master.</p></section>
 ${editing ? (p.variantGroupId?`<p class="variant-notice">Varian dari <b>${e(p.variantGroupName)}</b>. Nama lengkap tetap digunakan dalam stok dan Olah Reject.</p>`:'') : '<label class="variant-toggle"><input type="checkbox" name="hasVariants"><span><b>Memiliki varian</b><small>Aktifkan jika barang memiliki pilihan ukuran, rasa, atau kondisi.</small></span></label>'}
 <fieldset id="single-product-fields"><div class="form-grid">${editing?field("Keterangan varian", `<input name="variant" value="${e(p.variant || "")}" maxlength="100" ${p.variantGroupId?'readonly':''}>`):''}${field("SKU", `<input name="sku" value="${e(p.sku || "")}" required maxlength="40" placeholder="Kode unik barang">`)}${field("Barcode (opsional)", `<input name="barcode" value="${e(p.barcode || "")}" maxlength="80" placeholder="Ketik atau scan barcode">`)}${field("Harga beli referensi (Rp / satuan; durian per kg)", `<input name="buyPrice" type="number" min="0" max="1000000000000" step="any" value="${e(p.buyPrice ?? "")}" placeholder="Opsional">`)}</div><p class="muted">Harga beli adalah referensi; harga jual berlaku di semua outlet.</p><div id="catalog-prices" class="form-grid"></div></fieldset>
 ${editing?'':`<fieldset id="variant-product-fields" hidden disabled>${variantEditorMarkup()}</fieldset>`}
 <fieldset class="product-stock-editor"><legend>Qty Stok · ${e(state.stores.find((x) => x.id === store)?.name || "Pilih store dahulu")}</legend><div id="current-stock"></div><label><input type="checkbox" name="adjustStock" ${store ? "" : "disabled"}> ${editing ? "Sesuaikan stok fisik" : "Isi stok awal"}</label><div id="stock-fields" hidden></div></fieldset>
 ${
   editing
     ? `<details><summary>Riwayat penyesuaian stok</summary>${
         (state.stockAdjustments || [])
           .filter((a) => a.productId === p.id && a.storeId === store)
           .slice()
           .reverse()
           .map(
             (a) =>
               `<p>${e(a.date)} · ${e(a.reason)}<br><small>${e(JSON.stringify(a.before))} → ${e(JSON.stringify(a.after))}</small></p>`,
           )
           .join("") || '<p class="muted">Belum ada penyesuaian.</p>'
       }</details><button type="button" class="danger" id="delete-product">Hapus produk</button>`
     : ""
 }`,
  );
  d.classList.add("product-modal");
  const f = d.querySelector("form"),
    c = (n) => f.elements.namedItem(n),
    error = (message) => {
      d.querySelector("#form-error").textContent = message;
    };
  const groupId = id(), operationId = id();
  const getCommon = () => ({name:c("name").value,itemType:c("itemType").value,category:c("category").value,stockUnit:c("stockUnit").value});
  const editor = !editing ? bindVariantEditor(d.querySelector("#variant-product-fields"),{getCommon,state,groupId,operationId,error}) : null;
  function toggleVariants() {
    const enabled = !!c("hasVariants")?.checked;
    const single = d.querySelector("#single-product-fields"), variants = d.querySelector("#variant-product-fields");
    single.hidden = enabled; single.disabled = enabled;
    if(variants){variants.hidden = !enabled;variants.disabled = !enabled;}
    d.querySelector(".product-photo-editor").hidden = enabled;
    d.querySelector(".product-stock-editor").hidden = enabled;
    if(enabled){c("adjustStock").checked=false;toggleStock();}
    d.querySelector('[type="submit"]').textContent=enabled?'Simpan semua varian':'Simpan';
  }
  if(editor){c("hasVariants").onchange=toggleVariants;c("name").addEventListener('input',()=>editor.markDirty());}
  const prices = {
    priceKg: p.priceKg ?? "",
    pricePiece: p.pricePiece ?? "",
    salePrice: p.salePrice ?? "",
  };
  let baseline = {},
    stockDual = false;
  function drawStock() {
    stockDual = c("stockUnit").value === "kg_butir";
    baseline = productStock(state, productId, store, stockDual);
    d.querySelector("#current-stock").textContent = stockDual
      ? `${num(baseline.kg)} kg / ${num(baseline.pieces)} butir`
      : `${num(baseline.qty)} ${stockUnits[c("stockUnit").value]}`;
    d.querySelector("#stock-fields").innerHTML =
      `<div class="form-grid">${(stockDual ? ["kg", "pieces"] : ["qty"]).map((key) => field(key === "kg" ? "Stok akhir (kg)" : key === "pieces" ? "Stok akhir (butir)" : "Stok akhir (" + stockUnits[c("stockUnit").value] + ")", `<input name="target_${key}" type="number" min="0" max="1000000000" step="${key === "pieces" || (!stockDual && ["pcs", "porsi"].includes(c("stockUnit").value)) ? "1" : "0.000001"}" value="${baseline[key]}">`)).join("")}${stockDual ? field("Supplier untuk tambahan stok", `<select name="stockSupplier"><option value="">Pilih supplier</option>${options(Object.fromEntries(state.suppliers.map((x) => [x.id, x.name])), null)}</select>`) : ""}</div>${field("Alasan penyesuaian / stok awal", '<input name="stockReason" maxlength="300" placeholder="Contoh: hasil hitung fisik">')}<p class="muted">Isi jumlah akhir setelah dihitung. Pengurangan dialokasikan dari batch tertua; penambahan menjadi batch baru tanggal hari ini.</p>`;
    toggleStock();
  }
  function toggleStock() {
    const enabled = c("adjustStock").checked;
    d.querySelector("#stock-fields").hidden = !enabled;
    d.querySelectorAll("#stock-fields input,#stock-fields select").forEach(
      (el) => (el.disabled = !enabled),
    );
    d.querySelectorAll("#stock-fields input").forEach(
      (el) => (el.required = enabled),
    );
  }
  function update() {
    for (const key of Object.keys(prices)) {
      if (c(key)) prices[key] = c(key).value;
    }
    const type = c("itemType").value,
      unit = c("stockUnit"),
      material = ["raw", "prep"].includes(type);
    c("category").disabled = material || !!p.variantGroupId;
    const allowed =
      type === "recipe"
        ? ["porsi"]
        : [
            "kg",
            "g",
            "ml",
            "pcs",
            ...(type === "direct"
              ? ["kg_butir"]
              : []),
          ];
    for (const option of unit.options)
      option.disabled = !allowed.includes(option.value);
    if (!allowed.includes(unit.value)) unit.value = allowed[0];
    // Keep the operational category required by stock/recipe validation internal.
    // Visible category membership is managed only through the shared POS flow.
    c("category").value = material ? "" :
      (editing && type === p.itemType && unit.value === p.stockUnit && categories.includes(p.category)) ? p.category :
      unit.value === "kg_butir" ? "Buah" : type === "finished" ? "Olahan Duren" : type === "recipe" ? "Dessert" : "Minuman";
    d.querySelector('[data-product-category-help]').textContent = material
      ? 'Bahan internal tersedia di Master Barang dan Stok. Gunakan filter Jenis item untuk Bahan Baku atau Bahan Produksi.'
      : 'Kategori mengikuti Master Barang, Stok, dan POS. Setelah menyimpan barang, gunakan Kelola kategori → pilih kategori → Tambah produk dari master.';
    d.querySelector("#catalog-prices").innerHTML = (
      material
        ? []
        : unit.value === "kg_butir"
          ? ["priceKg", "pricePiece"]
          : ["salePrice"]
    )
      .map((key) =>
        field(
          {
            priceKg: "Harga jual / kg (Rp)",
            pricePiece: "Harga jual / butir (Rp)",
            salePrice: "Harga jual / satuan (Rp)",
          }[key],
          `<input name="${key}" type="number" min="0.01" step="any" ${type === "finished" && key === "salePrice" ? 'placeholder="Belum diisi"' : "required"} value="${e(prices[key])}">`,
        ),
      )
      .join("");
    drawStock();
    editor?.markDirty();
  }
  c("itemType").onchange = update;
  c("stockUnit").onchange = update;
  c("adjustStock").onchange = toggleStock;
  if(state.opsVersion){c("adjustStock").disabled=true;c("adjustStock").closest("label")?.setAttribute("title","Gunakan Barang masuk atau Waste & penyusutan untuk jejak per penerimaan.");}
  update();
  toggleVariants();
  const preview = () => {
    const img = d.querySelector("#photo-preview");
    img.hidden = !photo;
    if (photo) img.src = photo;
    else img.removeAttribute("src");
  };
  d.querySelector("#photo-file").onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const seq = ++photoSequence;
    photoBusy = true;
    error("");
    d.querySelector("#photo-status").textContent = "Memproses foto…";
    try {
      const result = await preparePhoto(file);
      if (seq !== photoSequence) return;
      photo = result.photo;
      preview();
      d.querySelector("#photo-status").textContent =
        `Siap disimpan · ${(result.bytes / 1024).toFixed(0)} KB`;
    } catch (err) {
      if (seq === photoSequence) {
        error(err.message);
        d.querySelector("#photo-status").textContent =
          "Foto baru gagal diproses; foto sebelumnya tetap digunakan.";
      }
    } finally {
      if (seq === photoSequence) photoBusy = false;
    }
  };
  d.querySelector("#remove-photo").onclick = () => {
    photoSequence++;
    photoBusy = false;
    photo = "";
    d.querySelector("#photo-file").value = "";
    d.querySelector("#photo-status").textContent =
      "Foto akan dihapus saat Simpan.";
    preview();
  };
  d.querySelector("#delete-product")?.addEventListener("click", () => {
    if (saving) return;
    const siblings = p.variantGroupId ? state.products.filter(x => x.variantGroupId === p.variantGroupId && x.id !== p.id) : [];
    const confirm = modal(
      "Hapus produk",
      `<p>Hapus produk berikut?</p><p><b>${e(p.name)}</b></p>${siblings.length===1?`<p>Setelah dihapus, <b>${e(siblings[0].name)}</b> kembali menjadi produk tanpa varian. Stok dan riwayat produk tersebut tetap tersimpan.</p>`:''}`,
      "Ya",
    );
    confirm.querySelector(".modal-actions .close").textContent = "Tidak";
    confirm.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      if (await mutate("product_delete", { id: p.id, confirmed: true })) {
        confirm.close();
        d.close();
        render();
        toast("Produk dihapus");
      }
    };
  });
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    if (photoBusy && !c("hasVariants")?.checked) return error("Tunggu sampai foto selesai diproses.");
    error("");
    try {
      if(c("hasVariants")?.checked) {
        const payload=editor.payload();
        saving=true;
        if(await mutate("product_variants_save",payload)){d.close();render();toast(`${payload.variants.length} varian tersimpan`);}
        return;
      }
      const values = Object.fromEntries(new FormData(f));
      if (locked) {
        values.itemType = p.itemType;
        values.stockUnit = p.stockUnit;
        if(p.variantGroupId)values.category=p.category;
      }
      const payload = {
        ...normalizeProduct({ ...values, photo }),
        id: productId,
        kind: "products",
        editing,
      };
      if (c("adjustStock").checked) {
        const keys = stockDual ? ["kg", "pieces"] : ["qty"];
        payload.stock = {
          id: adjustmentId,
          storeId: store,
          expected: baseline,
          target: Object.fromEntries(
            keys.map((k) => [k, Number(c("target_" + k).value)]),
          ),
          reason: c("stockReason").value,
          supplierId: c("stockSupplier")?.value || null,
        };
      }
      saving = true;
      if (await mutate("product_save", payload)) {
        d.close();
        render();
        toast("Barang tersimpan");
      }
    } catch (err) {
      error(err.message);
    } finally {
      saving = false;
    }
  };
}
