import {dummyProductPhoto} from './product-photos.mjs?v=65';
import {posCategoryName, posCategories, categoryPayload} from './pos-categories.mjs?v=52';
import { variantEditorMarkup, bindVariantEditor } from "./variant-editor.mjs?v=77";
import {
  categories,
  itemTypes,
  stockUnits,
  productDefaults,
  isLegacyStock,
  normalizeProduct,
} from "./catalog.mjs?v=77";
import { escape as e, id, num, money } from "./core.mjs?v=9";
import { preparePhoto } from "./product-details.mjs?v=77";
import { productStock, productUsed } from "./product-stock.mjs?v=60";
const options = (values, selected) =>
  Object.entries(values)
    .map(
      ([key, text]) =>
        `<option value="${e(key)}" ${key === selected ? "selected" : ""}>${e(text)}</option>`,
    )
    .join("");
const field = (name, input, className = '') => `<label class="field ${className}"><span>${name}</span>${input}</label>`;
export function productDialog({
  product,
  state,
  getState,
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
    saving = false,
    savedProducts = null,
    pendingCategory = null;
  const d = modal(
    editing ? "Edit Product" : "Add Product",
    `
 <fieldset class="product-entry-fields">
 <div class="product-entry-top">
 ${field("Nama Barang", `<input name="name" value="${e(p.name || "")}" required maxlength="100" autocomplete="off" ${p.variantGroupId?'readonly':''}>`, 'product-name-field')}
 <div class="field product-category-field"><span id="product-category-label">Kategori</span>${editing?`<details class="product-category-info"><summary data-product-category-names>${e(posCategoryName(state,p))}</summary><p>Kategori mengikuti Master Barang, Stok, dan POS. Gunakan Kelola kategori untuk mengubah pilihan.</p></details>`:`<select name="posCategory" aria-labelledby="product-category-label"><option value="">Semua</option>${options(Object.fromEntries(posCategories(state).map(c=>[c.id,c.name])), '')}</select><span data-product-category-names hidden>Semua</span>`}</div>
 <div class="product-photo-editor"><div class="product-photo-frame"><img id="photo-preview" alt="Pratinjau foto produk" ${photo ? `src="${e(photo)}"` : "hidden"}></div><div class="product-photo-controls"><b>Foto Product</b><label class="product-upload"><span>Choose file</span><input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Pilih foto produk" aria-describedby="product-photo-help"></label><button type="button" id="remove-photo" ${photo?'':'hidden'}>Hapus foto</button></div><small id="photo-dummy-note" hidden></small><p id="photo-status" role="status" hidden></p></div>
 ${field("Jenis Barang", `<select name="itemType" ${locked ? "disabled" : ""}>${options(itemTypes, p.itemType)}</select>`, 'product-type-field')}<input type="hidden" name="category" value="${e(p.category||'')}">
 ${field("Satuan stock", `<select name="stockUnit" ${locked ? "disabled" : ""}>${options(stockUnits, p.stockUnit)}</select>`, 'product-unit-field')}
 </div>
 ${editing && p.variantGroupId?`<p class="variant-notice">Varian dari <b>${e(p.variantGroupName)}</b>. Nama lengkap tetap digunakan dalam stok dan Olah Reject.</p>`:''}
 <fieldset id="single-product-fields"><div class="product-price-grid">
 ${field("Harga Beli /kg", `<input name="buyPrice" type="number" min="0" max="1000000000000" step="any" inputmode="decimal" value="${e(p.buyPrice ?? "")}">`, 'product-buy-field')}
 <div id="catalog-prices"></div>
 ${field("SKU", `<input name="sku" value="${e(p.sku || "")}" required maxlength="40" autocomplete="off">`, 'product-sku-field')}
 ${field("Harga Beli /butir", `<input name="buyPricePiece" type="number" min="0" max="1000000000000" step="any" inputmode="decimal" value="${e(p.buyPricePiece ?? "")}">`, 'product-piece-buy-field')}
 ${field("Barcode", `<input name="barcode" value="${e(p.barcode || "")}" maxlength="80" autocomplete="off" title="Opsional. Ketik atau scan barcode.">`, 'product-barcode-field')}
 </div>${editing?field("Keterangan varian", `<input name="variant" value="${e(p.variant || "")}" maxlength="100" ${p.variantGroupId?'readonly':''}>`, 'product-variant-note'):''}</fieldset>
 ${editing?'':`<div class="product-variant-action"><input type="checkbox" name="hasVariants" hidden><button type="button" data-toggle-product-variants aria-expanded="false" aria-controls="variant-product-fields">+ Add Variant</button></div><fieldset id="variant-product-fields" hidden disabled>${variantEditorMarkup()}</fieldset>`}
 <details class="product-extra"><summary>Stok & informasi tambahan</summary>
 <p class="muted">${locked ? "Jenis dan satuan mengikuti barang yang sudah terdaftar." : "Gunakan gram untuk berat bahan dan ml untuk cairan."}</p>
 <p id="product-photo-help" class="muted">Foto JPG, PNG, atau WebP otomatis diperkecil hingga maksimal 2 MB.</p>
 <p data-product-category-help class="muted"></p>
 <p id="scale-barcode-help" class="muted" hidden>Untuk label timbangan CAS POS KG, isi Barcode dengan Item Code 4 digit, misalnya 0001 untuk Monthong. Pertahankan nol di depan; jangan masukkan seluruh barcode label. Setiap buah/varian memakai kode berbeda. Samakan harga jual per kg dengan timbangan.</p><p class="muted">Harga beli adalah referensi; harga jual berlaku di semua outlet.</p>
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
 }</details></fieldset>${editing?'':'<button type="button" data-finish-product hidden>Selesai — periksa kategori nanti</button>'}`,
  );
  d.classList.add("product-modal", "product-entry-modal");
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
    const button = d.querySelector('[data-toggle-product-variants]');
    if(button){button.textContent=enabled?'− Tanpa Variant':'+ Add Variant';button.setAttribute('aria-expanded',String(enabled));}
    d.classList.toggle('has-product-variants',enabled);
    d.querySelector('[type="submit"]').textContent=enabled?'Simpan semua varian':'Simpan';
  }
  if(editor){
    c("hasVariants").onchange=toggleVariants;
    c("name").addEventListener('input',()=>editor.markDirty());
    d.querySelector('[data-toggle-product-variants]').onclick=()=>{
      c('hasVariants').checked=!c('hasVariants').checked;
      d.dataset.dirty='true';toggleVariants();
      if(c('hasVariants').checked)d.querySelector('[data-axis-values]')?.focus();
    };
  }
  c('posCategory')?.addEventListener('change',()=>{
    const selected=posCategories(state).find(category=>category.id===c('posCategory').value);
    d.querySelector('[data-product-category-names]').textContent=selected?.name||'Semua';
  });
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
      : 'Kategori mengikuti Master Barang, Stok, dan POS. Pilih Semua bila belum ingin menentukan kategori. Kategori tambahan dapat diatur melalui Kelola kategori.';
    if(c('posCategory'))c('posCategory').disabled=material;
    const unitLabel={kg_butir:'kg',kg:'kg',g:'g',ml:'ml',pcs:'pcs',porsi:'porsi'}[unit.value];
    d.querySelector('.product-buy-field span').textContent=`Harga Beli /${unitLabel}`;
    d.querySelector('#single-product-fields').classList.toggle('is-material',material);
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
            priceKg: "Harga Jual /kg",
            pricePiece: "Harga Jual /butir",
            salePrice: `Harga Jual /${unitLabel}`,
          }[key],
          `<input name="${key}" type="number" min="0.01" step="any" inputmode="decimal" ${type === "finished" && key === "salePrice" ? 'placeholder="Belum diisi"' : "required"} value="${e(prices[key])}">`,
          key==='pricePiece'?'product-piece-sale-field':'product-sale-field',
        ),
      )
      .join("");
    const pieceBuy = c("buyPricePiece");
    const pieceBuyVisible = unit.value === "kg_butir" && state.access?.finance !== false;
    pieceBuy.closest('label').hidden = !pieceBuyVisible;
    pieceBuy.disabled = !pieceBuyVisible;
    d.querySelector("#scale-barcode-help").hidden = unit.value !== "kg_butir";
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
    const placeholder=c('name').value.trim()?dummyProductPhoto({...p,name:c("name").value,itemType:c("itemType").value,stockUnit:c("stockUnit").value}):'',shown=photo||placeholder;
    img.hidden = !shown;
    if (shown) img.src = shown;
    else img.removeAttribute("src");
    const note=d.querySelector("#photo-dummy-note");
    note.textContent=!photo&&placeholder?"Foto dummy otomatis. Unggah foto untuk menggantinya.":"";
    note.hidden=!note.textContent;
    d.querySelector('#remove-photo').hidden=!photo;
  };
  c("name").addEventListener("input",preview);
  c("itemType").addEventListener("change",preview);
  c("stockUnit").addEventListener("change",preview);
  preview();
  d.querySelector("#photo-file").onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const seq = ++photoSequence;
    photoBusy = true;
    error("");
    d.querySelector("#photo-status").hidden = false;
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
    d.querySelector("#photo-status").hidden = false;
    d.querySelector("#photo-status").textContent =
      "Foto asli akan dihapus saat Simpan. Foto dummy tampil jika tersedia.";
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
  const finish = (message) => {d.close();render();toast(message);};
  async function finishCategory() {
    try {
      if(!pendingCategory){
        const latest=getState?.()||state;
        const category=posCategories(latest).find(x=>x.id===savedProducts.categoryId);
        if(!category)throw Error('Kategori sudah tidak tersedia. Gunakan Kelola kategori setelah menutup form.');
        // A confirmed product write may replace app state. Include the confirmed
        // rows locally for callers without getState; never create a second product.
        const products=[...latest.products,...savedProducts.rows.filter(row=>!latest.products.some(p=>p.id===row.id))];
        pendingCategory=categoryPayload({...latest,products},{id:id(),categoryId:category.id,name:category.name,productIds:savedProducts.rows.map(p=>p.id),mode:'add'});
      }
      if(!await mutate('pos_category_save',pendingCategory,{throwOnError:true}))throw Error('Penambahan kategori belum terkonfirmasi.');
      finish(savedProducts.message);
    } catch(err) {
      error(`Barang sudah tersimpan. Kategori belum terkonfirmasi: ${err.message} Klik Coba lagi kategori untuk melanjutkan.`);
      d.querySelector('[type="submit"]').textContent='Coba lagi kategori';
    }
  }
  async function afterSave(rows,message,categoryId) {
    if(!categoryId){finish(message);return;}
    savedProducts={rows,message,categoryId};
    d.querySelector('.product-entry-fields').disabled=true;
    d.querySelector('[data-finish-product]').hidden=false;
    await finishCategory();
  }
  d.querySelector('[data-finish-product]')?.addEventListener('click',()=>finish('Barang tersimpan. Periksa kategorinya melalui Kelola kategori.'));
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    if (photoBusy && !c("hasVariants")?.checked) return error("Tunggu sampai foto selesai diproses.");
    error("");
    try {
      if(savedProducts){saving=true;await finishCategory();return;}
      const categoryId=c('posCategory')&&!c('posCategory').disabled?c('posCategory').value:'';
      if(categoryId&&!posCategories(getState?.()||state).some(x=>x.id===categoryId))throw Error('Kategori sudah tidak tersedia. Pilih kategori lain atau Semua.');
      if(c("hasVariants")?.checked) {
        const payload=editor.payload();
        saving=true;
        if(await mutate("product_variants_save",payload))await afterSave(payload.variants,`${payload.variants.length} varian tersimpan`,categoryId);
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
      if (Object.hasOwn(payload,'buyPricePiece') && payload.buyPricePiece !== null && !state.stockDemo && state.opsVersion && state.productCostVersion !== 77)
        throw Error('Jalankan SQL product-buy-piece-077.sql, lalu muat ulang POS sebelum menyimpan harga beli per butir.');
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
        await afterSave([payload],"Barang tersimpan",categoryId);
      }
    } catch (err) {
      error(err.message);
    } finally {
      saving = false;
    }
  };
}
