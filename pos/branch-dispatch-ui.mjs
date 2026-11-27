import { confirmAction } from "../shared/confirmation.mjs";
import {
  bindBarcodeInput,
  normalizeBarcode,
  readyBarcodeInput,
} from "./barcode-scanner.mjs";
import { escape as e, id, num } from "./core.mjs";
import { scalar } from "./production.mjs";
import { field, options } from "./supply-session-ui.mjs";
import { allocateBranchUnits, branchFruit } from "./warehouse-flow.mjs";
import { outboundInventory } from "./warehouse-workflow.mjs";

const productLabel = (p) => [p.sku, p.name].filter(Boolean).join(" · ");
function findProduct(products, input) {
  const key = input.trim().toLowerCase();
  if (!key) return;
  const exact = products.find((p) =>
    [p.sku, productLabel(p)].some((label) => label?.toLowerCase() === key),
  );
  if (exact) return exact;
  const matches = products.filter((p) => p.name.toLowerCase() === key);
  if (matches.length === 1) return matches[0];
}
const destinations = (s, origin) =>
  (s.locations || s.stores || []).filter(
    (l) => l.locationType === "store" && l.id !== origin,
  );
const employees = (s) => (s.people || s.employees || []).filter((p) => p.id && p.name);

export function openBranchDispatch(s, ctx) {
  const origins = (s.stores || []).filter((l) =>
    ["store", "warehouse"].includes(l.locationType),
  );
  const request = id();
  const products = s.products.filter((p) => p.stockUnit === "kg_butir" || scalar(p));
  const listId = "dispatch-products-" + request;
  const senders = employees(s).sort((a, b) => a.name.localeCompare(b.name, "id"));
  const dialog = ctx.modal(
    "Buat pengiriman toko",
    `
    <div class="form-grid">
      ${field("Lokasi asal", `<select name="fromStoreId" required><option value="">Pilih lokasi asal</option>${options(origins)}</select>`)}
      ${field("Toko tujuan", `<select name="toStoreId" aria-label="Toko tujuan" disabled required><option value="">Pilih toko</option></select>`)}
      ${field("Pengirim", `<select name="senderId" aria-label="Pengirim" required><option value="">Pilih karyawan</option>${options(senders)}</select>`)}
    </div>
    <datalist id="${listId}">${products.map((p) => `<option value="${e(productLabel(p))}"></option>`).join("")}</datalist>
    <div class="branch-dispatch-lines" data-lines></div>
    <button type="button" data-add-line>+ Tambah barang</button>
    ${field("Catatan", '<textarea name="note" maxlength="500" rows="2"></textarea>')}
    <p class="notice">Stok asal berkurang saat dikirim. Stok tujuan bertambah setelah cabang mengonfirmasi penerimaan.</p>`,
    "Terbitkan surat jalan dan kirim",
  );
  dialog.classList.add("supply-modal", "branch-dispatch");
  const form = dialog.querySelector("form");
  const source = form.elements.namedItem("fromStoreId");
  const target = form.elements.namedItem("toStoreId");
  const sender = form.elements.namedItem("senderId");
  const submit = form.querySelector('[type="submit"]');
  const errorBox = form.querySelector("#form-error");
  const rows = new Set();
  let origin = "";
  let stock = outboundInventory(s, origin);
  let working = false;

  function duplicate(row) {
    return [...rows].some(
      (other) => other !== row && other.product?.id === row.product?.id,
    );
  }
  function validate(row) {
    const { product, codes, qty, scan } = row;
    if (!product) throw Error("Pilih barang dari master SKU.");
    if (duplicate(row)) throw Error("SKU ini sudah ada di daftar kiriman.");
    if (product.stockUnit !== "kg_butir")
      return allocateBranchUnits(stock.batches, product, qty.value);
    if (scan.value.trim()) throw Error("Tambahkan barcode yang masih ada di kolom scan.");
    if (!codes.size) throw Error("Scan buah yang akan dikirim.");
    return [];
  }
  function refresh() {
    let valid = Boolean(origin && rows.size && target.value && sender.value);
    for (const row of rows) {
      try {
        validate(row);
        row.error.textContent = "";
      } catch (err) {
        valid = false;
        row.error.textContent =
          row.productInput.value.trim() &&
          (!row.product || row.qty.value || row.codes.size || duplicate(row))
            ? err.message
            : "";
      }
    }
    source.disabled = working || [...rows].some((row) => row.codes.size || row.qty.value);
    submit.disabled = working || !valid;
  }
  function updateStock(row) {
    const p = row.product;
    if (!p) {
      row.stock.textContent = "";
      return;
    }
    const fruit = p.stockUnit === "kg_butir";
    const total = stock.batches
      .filter((lot) => lot.productId === p.id && (fruit || lot.unit === p.stockUnit))
      .reduce((n, lot) => n + (fruit ? lot.available.pieces : lot.available.qty), 0);
    row.stock.textContent = `Stok tersedia ${num(total)} ${fruit ? "butir" : p.stockUnit}`;
  }
  function drawCodes(row) {
    row.productInput.readOnly = row.codes.size > 0;
    const grams = [...row.codes.values()].reduce((sum, g) => sum + g, 0);
    row.count.textContent = `${row.codes.size} butir · ${num(grams / 1000)} kg`;
    row.details.hidden = !row.codes.size;
  }
  function addRow(focus) {
    const el = document.createElement("section");
    el.className = "branch-dispatch-line";
    el.innerHTML = `<div class="branch-dispatch-grid">
      ${field("Nama barang / SKU", `<input data-product list="${listId}" autocomplete="off" placeholder="Ketik nama atau SKU" required>`)}
      <div data-quantity hidden>${field("Jumlah kirim", '<input data-qty type="number" min="0.000001" step="any" inputmode="decimal">')}</div>
      <div data-fruit-count hidden><span>Jumlah kirim</span><strong data-count></strong></div>
      <button type="button" data-remove-line aria-label="Hapus baris barang">Hapus</button>
    </div>
    <small data-stock></small>
    <div data-fruit hidden>
      <div class="supply-scan">${field("Scan barcode buah", '<input data-scan autocomplete="off" spellcheck="false" placeholder="Scan satu per satu">')}<button type="button" data-add-code>Tambah barcode</button></div>
      <p data-scan-result role="status"></p>
      <details hidden><summary>Daftar barcode</summary><div class="supply-scan-list" data-codes></div></details>
    </div>
    <p class="error" data-line-error aria-live="polite"></p>`;
    form.querySelector("[data-lines]").append(el);
    const get = (selector) => el.querySelector(selector);
    const row = {
      product: null,
      productInput: get("[data-product]"),
      qty: get("[data-qty]"),
      codes: new Map(),
      count: get("[data-count]"),
      details: get("details"),
      scan: get("[data-scan]"),
      stock: get("[data-stock]"),
      error: get("[data-line-error]"),
    };
    rows.add(row);
    const result = get("[data-scan-result]");
    row.productInput.oninput = () => {
      const product = findProduct(products, row.productInput.value);
      if (row.product !== product) {
        row.product = product;
        row.qty.value = "";
        row.scan.value = "";
        result.textContent = "";
        const fruit = product?.stockUnit === "kg_butir";
        get("[data-quantity]").hidden = !product || fruit;
        get("[data-fruit]").hidden = get("[data-fruit-count]").hidden = !fruit;
        row.qty.step = ["pcs", "porsi"].includes(product?.stockUnit) ? "1" : "any";
        row.qty.min = row.qty.step === "1" ? "1" : "0.000001";
        updateStock(row);
        drawCodes(row);
      }
      refresh();
    };
    row.productInput.onchange = () => {
      row.productInput.oninput();
      if (row.product) row.productInput.value = productLabel(row.product);
    };
    row.qty.oninput = refresh;
    row.scan.oninput = refresh;
    const addCode = bindBarcodeInput(row.scan, {
      onScan(raw, settings) {
        const code = normalizeBarcode(raw, settings);
        const fruit = branchFruit(stock.fruitByBarcode, row.product.id, code);
        if (row.codes.has(code)) throw Error("Barcode sudah masuk daftar kirim.");
        row.codes.set(code, Number(fruit.grams));
        const entry = document.createElement("div");
        entry.innerHTML = `<code>${e(code)}</code><button type="button" aria-label="Hapus barcode ${e(code)}">Hapus</button>`;
        const list = get("[data-codes]");
        list.insertBefore(entry, list.firstChild);
        entry.querySelector("button").onclick = () => {
          row.codes.delete(code);
          entry.remove();
          result.textContent = "";
          drawCodes(row);
          refresh();
        };
        row.scan.value = "";
        result.className = "positive";
        result.textContent = `Barcode tercatat · ${num(fruit.grams / 1000)} kg`;
        drawCodes(row);
        refresh();
      },
      onError(message) {
        result.className = "error";
        result.textContent = message;
        refresh();
      },
    });
    get("[data-add-code]").onclick = addCode;
    row.productInput.onkeydown = (ev) => {
      if (ev.key === "Enter" && row.product) {
        ev.preventDefault();
        row.productInput.onchange();
        if (row.product?.stockUnit === "kg_butir") readyBarcodeInput(row.scan);
        else if (row.product) row.qty.focus();
      }
    };
    get("[data-remove-line]").onclick = () => {
      rows.delete(row);
      el.remove();
      if (!rows.size) addRow(true);
      else refresh();
    };
    row.productInput.disabled = !origin;
    if (focus) row.productInput.focus();
    refresh();
  }

  form.querySelector("[data-add-line]").onclick = () => addRow(true);
  source.onchange = () => {
    if (source.disabled) return;
    const current = ctx.getState();
    origin = source.value;
    target.innerHTML =
      '<option value="">Pilih toko</option>' + options(destinations(current, origin));
    target.value = "";
    target.disabled = !origin;
    stock = outboundInventory(current, origin);
    for (const row of rows) {
      row.productInput.disabled = !origin;
      updateStock(row);
    }
    refresh();
  };
  target.onchange = sender.onchange = refresh;
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (working || submit.disabled || !form.reportValidity()) return;
    working = true;
    submit.disabled = true;
    errorBox.textContent = "";
    try {
      if (!(await confirmAction("Kirim barang pada daftar ini ke cabang tujuan?")))
        return;
      const current = ctx.getState();
      if (
        !current.access?.backoffice ||
        !(current.stores || []).some((l) => l.id === origin)
      )
        throw Error("Lokasi asal tidak tersedia untuk transfer ini.");
      const employee = employees(current).find((p) => p.id === sender.value);
      if (!employee) throw Error("Pilih karyawan pengirim yang terdaftar.");
      if (!destinations(current, origin).some((l) => l.id === target.value))
        throw Error("Pilih cabang tujuan yang berbeda dari cabang asal.");
      stock = outboundInventory(current, origin);
      const units = [],
        barcodes = [];
      for (const row of rows) {
        updateStock(row);
        units.push(...validate(row));
        for (const code of row.codes.keys()) {
          branchFruit(stock.fruitByBarcode, row.product.id, code);
          barcodes.push(code);
        }
      }
      await ctx.mutate(
        "transfer_dispatch",
        {
          id: request,
          storeId: origin,
          toStoreId: target.value,
          senderEmployeeId: employee.id,
          carrier: employee.name,
          note: form.elements.namedItem("note").value.trim(),
          units,
          barcodes,
        },
        { throwOnError: true },
      );
      dialog.close();
      ctx.render();
      ctx.toast("Mutasi tercatat. Surat jalan siap dicetak.");
    } catch (err) {
      errorBox.textContent = err.message;
    } finally {
      working = false;
      refresh();
    }
  };
  addRow(false);
  return dialog;
}
