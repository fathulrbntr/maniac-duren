import { confirmAction } from "../shared/confirmation.mjs";
import {
  bindBarcodeInput,
  normalizeBarcode,
  readyBarcodeInput,
} from "./barcode-scanner.mjs";
import { productLabel, findProduct } from "./branch-dispatch-ui.mjs";
import { escape as e, num, id } from "./core.mjs";
import { quantity, scalar } from "./production.mjs";
import { field, options, recordTable } from "./supply-session-ui.mjs";
import { outboundInventory } from "./warehouse-workflow.mjs";
import { transferStatus } from "./warehouse-flow.mjs";

const statuses = {
  packing: "Dalam penyiapan",
  ready: "Menunggu persetujuan",
  approved: "Siap dikirim",
  cancelled: "Dibatalkan",
};
const statusLabel = (n) =>
  transferStatus[n.transferStatus] || statuses[n.status] || "Terkirim";
const unitOf = (r) => (r.unit === "kg_butir" ? "kg" : r.unit);
const btn = (key, label) =>
  `<button type="button" data-note-action="${key}">${label}</button>`;

export function branchNoteList(s, store) {
  const priority = store ? ["approved", "packing"] : ["ready"];
  const notes = (s.branchNotes || [])
    .filter((n) => !store || n.sourceId === store)
    .sort(
      (a, b) => Number(priority.includes(b.status)) - Number(priority.includes(a.status)),
    );
  return `<section class="panel">${recordTable(
    ["Nota transfer", "Toko asal → tujuan", "Status", "Surat jalan", "Aksi"],
    notes.map((n) => [
      `<b>${e(n.number)}</b>`,
      `${e(n.origin.name)} → ${e(n.destination.name)}`,
      e(statusLabel(n)),
      e(n.deliveryNo || "—"),
      `<button type="button" data-branch-note="${e(n.id)}">${store && n.status === "packing" ? "Siapkan barang" : store && n.status === "approved" ? "Proses pengiriman" : "Buka nota"}</button>`,
    ]),
  )}</section>`;
}
export function branchPreparationPage(s, store) {
  return `<section class="supply-workspace"><div class="supply-hero"><div><h2>Nota dari Back Office</h2><p>Siapkan barang sesuai permintaan cabang tujuan.</p></div><button type="button" data-supply-refresh>Perbarui</button></div>${branchNoteList(s, store)}</section>`;
}
function noteDialog(ctx, title, body, submit) {
  const d = ctx.modal(e(title), body, submit);
  d.classList.add("supply-modal", "branch-dispatch");
  return d;
}
// Keep the same operation on an uncertain response. The normal mutation route reconciles retries.
function bindSubmit(d, ctx, task) {
  let working = false;
  d.querySelector("form").onsubmit = async (ev) => {
    ev.preventDefault();
    if (working) return;
    working = true;
    const error = d.querySelector("#form-error");
    error.textContent = "";
    try {
      const result = await task(ev);
      if (!result) return;
      await ctx.mutate(result.action, result.payload, { throwOnError: true });
      d.close();
      ctx.render();
      ctx.toast(result.message);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      working = false;
    }
  };
}
export function openBranchEstimate(s, ctx) {
  const stores = s.stores.filter((l) => l.locationType === "store");
  const senders = (s.people || s.employees || []).filter(
    (p) => p.id && p.name && p.active !== false,
  );
  const products = s.products.filter(
    (p) => p.itemType !== "recipe" && (p.stockUnit === "kg_butir" || scalar(p)),
  );
  const request = id(),
    listId = "branch-skus-" + request;
  const d = noteDialog(
    ctx,
    "Buat nota transfer",
    `<div class="form-grid">
    ${field("Toko asal", `<select name="fromStoreId" required><option value="">Pilih toko asal</option>${options(stores)}</select>`)}
    ${field("Toko tujuan", '<select name="toStoreId" required disabled><option value="">Pilih toko tujuan</option></select>')}
    ${field("Pengirim", `<select name="senderId" required><option value="">Pilih karyawan</option>${options(senders)}</select>`)}
    </div><datalist id="${listId}">${products.map((p) => `<option value="${e(productLabel(p))}"></option>`).join("")}</datalist>
    <div class="branch-dispatch-lines" data-lines></div><button type="button" data-add-line>+ Tambah barang</button>
    ${field("Catatan", '<textarea name="note" maxlength="500" rows="2"></textarea>')}`,
    "Terbitkan nota transfer",
  );
  const form = d.querySelector("form"),
    origin = form.elements.fromStoreId,
    target = form.elements.toStoreId;
  const rows = new Set();
  let stock = outboundInventory(s, "");
  function describe(r) {
    const p = findProduct(products, r.product.value);
    const fruit = p?.stockUnit === "kg_butir";
    r.label.textContent = p
      ? fruit
        ? "Estimasi berat (kg)"
        : "Jumlah diminta (" + p.stockUnit + ")"
      : "Jumlah diminta";
    r.qty.step = p && ["pcs", "porsi"].includes(p.stockUnit) ? "1" : "any";
    r.qty.min = r.qty.step === "1" ? "1" : "0.000001";
    const available = p
      ? stock.batches
          .filter((b) => b.productId === p.id)
          .reduce((n, b) => n + (fruit ? b.available.grams / 1000 : b.available.qty), 0)
      : 0;
    r.stock.textContent =
      p && origin.value
        ? `Stok tersedia ${num(available)} ${fruit ? "kg" : p.stockUnit}`
        : "";
  }
  function addRow() {
    const el = document.createElement("section");
    el.className = "branch-dispatch-line";
    el.innerHTML = `<div class="branch-dispatch-grid">${field("Nama barang / SKU", `<input data-product list="${listId}" required autocomplete="off" placeholder="Ketik nama atau SKU">`)}
    <label class="field"><span data-label>Jumlah diminta</span><input data-qty type="number" min="0.000001" step="any" required></label>
    <button type="button" data-remove>Hapus</button></div><small data-stock></small>`;
    form.querySelector("[data-lines]").append(el);
    const r = {
      product: el.querySelector("[data-product]"),
      qty: el.querySelector("[data-qty]"),
      label: el.querySelector("[data-label]"),
      stock: el.querySelector("[data-stock]"),
    };
    rows.add(r);
    r.product.oninput = () => describe(r);
    r.product.onchange = () => {
      const p = findProduct(products, r.product.value);
      if (p) r.product.value = productLabel(p);
      describe(r);
    };
    el.querySelector("[data-remove]").onclick = () => {
      el.remove();
      rows.delete(r);
      if (!rows.size) addRow();
    };
    return r;
  }
  origin.onchange = () => {
    target.innerHTML =
      '<option value="">Pilih toko tujuan</option>' +
      options(stores.filter((l) => l.id !== origin.value));
    target.disabled = !origin.value;
    stock = outboundInventory(ctx.getState(), origin.value);
    rows.forEach(describe);
  };
  form.querySelector("[data-add-line]").onclick = () => addRow().product.focus();
  addRow();
  bindSubmit(d, ctx, async () => {
    const lines = [...rows].map((r) => {
      const p = findProduct(products, r.product.value);
      if (!p) throw Error("Pilih barang dari daftar SKU.");
      return { productId: p.id, qty: quantity(r.qty.value, p.stockUnit) };
    });
    if (new Set(lines.map((l) => l.productId)).size !== lines.length)
      throw Error("Setiap SKU cukup diisi satu kali.");
    if (!(await confirmAction("Terbitkan nota agar toko asal mulai menyiapkan barang?")))
      return;
    return {
      action: "branch_note_create",
      payload: {
        id: request,
        storeId: origin.value,
        toStoreId: target.value,
        senderEmployeeId: form.elements.senderId.value,
        note: form.elements.note.value.trim(),
        lines,
      },
      message: "Nota transfer diterbitkan untuk toko asal.",
    };
  });
  return d;
}
function viewRows(n) {
  return n.requested.map((r) => {
    const lines = n.lines.filter((l) => l.productId === r.productId);
    const fruit = r.unit === "kg_butir",
      actual = lines.reduce((v, l) => v + (fruit ? l.kg : l.qty), 0);
    const delta = Number((actual - r.qty).toFixed(6)),
      unit = e(unitOf(r));
    const prepared = n.status !== "packing" || n.lines.length > 0;
    return [
      e(r.name),
      `${num(r.qty)} ${unit}`,
      `${prepared ? num(actual) + " " + unit : "—"}${fruit && prepared ? `<small>${num(lines.reduce((v, l) => v + l.pieces, 0))} butir</small>` : ""}`,
      prepared ? (delta > 0 ? "+" : "") + num(delta) + " " + unit : "—",
    ];
  });
}
function noteHeading(n) {
  return `<p><b>${e(n.origin.name)} → ${e(n.destination.name)}</b><br>Pengirim · ${e(n.carrier)}</p>${n.note ? `<p>${e(n.note)}</p>` : ""}`;
}
function openPacking(s, n, ctx) {
  const stock = outboundInventory(s, n.sourceId, n.id),
    codes = new Map(n.items.map((i) => [i.barcode, i]));
  const fruitRequested = new Set(
    n.requested.filter((r) => r.unit === "kg_butir").map((r) => r.productId),
  );
  const d = noteDialog(
    ctx,
    "Siapkan " + n.number,
    noteHeading(n) +
      (fruitRequested.size
        ? `<div class="supply-scan">${field("Scan barcode buah", '<input data-scan autocomplete="off" placeholder="Scan satu per satu">')}<button type="button" data-add-code>Tambah barcode</button></div><p data-scan-result role="status"></p>`
        : "") +
      recordTable(
        ["Barang", "Permintaan", "Aktual"],
        n.requested.map((r) => [
          e(r.name),
          `${num(r.qty)} ${e(unitOf(r))}`,
          r.unit === "kg_butir"
            ? `<b data-total="${e(r.productId)}"></b>`
            : `<input data-quantity="${e(r.productId)}" type="number" min="0" step="${["pcs", "porsi"].includes(r.unit) ? "1" : "any"}" aria-label="Jumlah aktual ${e(r.name)}" value="${n.lines.filter((l) => l.productId === r.productId).reduce((v, l) => v + l.qty, 0) || ""}">`,
        ]),
      ) +
      (fruitRequested.size
        ? '<details><summary>Barcode yang disiapkan</summary><div data-codes class="supply-scan-list"></div></details>'
        : ""),
    "Ajukan ke Back Office",
  );
  const form = d.querySelector("form"),
    scan = form.querySelector("[data-scan]");
  for (const input of form.querySelectorAll("[data-quantity]")) {
    const r = n.requested.find((line) => line.productId === input.dataset.quantity);
    const available = stock.batches
      .filter((b) => b.productId === r.productId && b.unit === r.unit)
      .reduce((sum, b) => sum + b.available.qty, 0);
    input.max = String(Number(available.toFixed(6)));
    const info = document.createElement("small");
    info.textContent = "Stok tersedia " + num(available) + " " + r.unit;
    input.after(info);
  }
  const draft = document.createElement("button");
  draft.type = "submit";
  draft.textContent = "Simpan";
  draft.dataset.draft = "true";
  form
    .querySelector(".modal-actions")
    .insertBefore(draft, form.querySelector('.modal-actions [type="submit"]'));
  function updateCodes() {
    for (const total of form.querySelectorAll("[data-total]")) {
      const items = [...codes.values()].filter(
        (i) => i.productId === total.dataset.total,
      );
      total.textContent = `${items.length} butir · ${num(items.reduce((v, i) => v + i.grams, 0) / 1000)} kg`;
    }
    const list = form.querySelector("[data-codes]");
    if (list)
      list.innerHTML = [...codes.values()]
        .reverse()
        .map(
          (i) =>
            `<div><code>${e(i.barcode)}</code><span>${num(i.grams / 1000)} kg</span><button type="button" data-remove-code="${e(i.barcode)}">Hapus</button></div>`,
        )
        .join("");
  }
  if (scan) {
    const feedback = form.querySelector("[data-scan-result]");
    const add = bindBarcodeInput(scan, {
      onScan(raw, settings) {
        const code = normalizeBarcode(raw, settings);
        if (codes.has(code)) throw Error("Barcode sudah disiapkan.");
        const item = stock.fruitByBarcode.get(code);
        if (!item) throw Error("Barcode tidak tersedia di toko asal.");
        if (!fruitRequested.has(item.productId))
          throw Error("SKU buah ini tidak diminta di nota.");
        codes.set(code, item);
        d.dataset.dirty = "true";
        scan.value = "";
        feedback.className = "positive";
        feedback.textContent = `Tercatat · ${code} · ${num(item.grams / 1000)} kg`;
        updateCodes();
      },
      onError(message) {
        feedback.className = "error";
        feedback.textContent = message;
      },
    });
    form.querySelector("[data-add-code]").onclick = add;
    form.querySelector("[data-codes]").onclick = (ev) => {
      const b = ev.target.closest("[data-remove-code]");
      if (!b) return;
      codes.delete(b.dataset.removeCode);
      d.dataset.dirty = "true";
      updateCodes();
    };
    readyBarcodeInput(scan);
  }
  updateCodes();
  bindSubmit(d, ctx, async (ev) => {
    if (scan?.value.trim())
      throw Error("Tambahkan atau kosongkan barcode yang masih ada di kolom scan.");
    const quantities = [...form.querySelectorAll("[data-quantity]")]
      .filter((input) => Number(input.value) !== 0)
      .map((input) => {
        const r = n.requested.find((x) => x.productId === input.dataset.quantity);
        return { productId: r.productId, qty: quantity(input.value, r.unit) };
      });
    const draftOnly = ev.submitter === draft;
    if (!draftOnly) {
      if (!codes.size && !quantities.length)
        throw Error("Siapkan setidaknya satu barang.");
      if (
        !(await confirmAction("Ajukan jumlah aktual ini ke Back Office untuk disetujui?"))
      )
        return;
    }
    return {
      action: draftOnly ? "branch_note_draft" : "branch_note_pack",
      payload: {
        id: id(),
        noteId: n.id,
        revision: n.revision,
        barcodes: [...codes.keys()],
        quantities,
      },
      message: draftOnly
        ? "Progres penyiapan tersimpan."
        : "Penyiapan diajukan ke Back Office.",
    };
  });
  return d;
}
function openReview(n, ctx, office) {
  const actions = [];
  if (office && n.status === "ready")
    actions.push(
      btn("return", "Kembalikan ke toko"),
      btn("approve", "Setujui dan terbitkan surat jalan"),
    );
  if (n.deliveryNo && n.status !== "cancelled" && n.transferStatus !== "cancelled")
    actions.push(btn("print", "Cetak surat jalan"));
  if (!office && n.status === "approved")
    actions.push(btn("ship", "Konfirmasi barang dikirim"));
  if (office && ["packing", "ready", "approved"].includes(n.status))
    actions.push(btn("cancel", "Batalkan nota"));
  const d = noteDialog(
    ctx,
    n.number,
    noteHeading(n) +
      `<p>${e(statusLabel(n))}${n.deliveryNo ? " · " + e(n.deliveryNo) : ""}</p>` +
      recordTable(
        ["Barang", "Diminta", "Aktual", "Selisih aktual − diminta"],
        viewRows(n),
      ) +
      `<div class="toolbar">${actions.join("")}</div>`,
    "Tutup",
  );
  const form = d.querySelector("form");
  form.querySelector(".modal-actions button.close").remove();
  form.onsubmit = (ev) => {
    ev.preventDefault();
    d.close();
  };
  let busy = false;
  const prompts = {
    approve: "Setujui jumlah aktual dan terbitkan surat jalan?",
    return: "Kembalikan nota ke toko asal untuk memperbaiki penyiapan?",
    ship: "Barang sudah berangkat? Stok aktual akan berpindah ke dalam perjalanan.",
    cancel: "Batalkan nota dan lepaskan stok yang disiapkan?",
  };
  form.querySelectorAll("[data-note-action]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (busy) return;
        const action = b.dataset.noteAction;
        if (action === "print")
          return ctx.printOutbound(
            {
              ...n,
              createdAt: n.issuedAt,
              status: n.transferStatus || n.status,
              invoiceNo: null,
            },
            "delivery",
          );
        busy = true;
        try {
          if (!(await confirmAction(prompts[action]))) return;
          await ctx.mutate(
            "branch_note_" + action,
            { id: id(), noteId: n.id, revision: n.revision },
            { throwOnError: true },
          );
          d.close();
          ctx.render();
          ctx.toast(
            {
              approve: "Surat jalan diterbitkan.",
              return: "Nota dikembalikan ke toko asal.",
              ship: "Kiriman dalam perjalanan.",
              cancel: "Nota transfer dibatalkan.",
            }[action],
          );
        } catch (err) {
          form.querySelector("#form-error").textContent = err.message;
        } finally {
          busy = false;
        }
      }),
  );
  return d;
}
export function bindBranchNotes(s, store, ctx) {
  const office = ctx.workspace === "backoffice" && s.access?.backoffice;
  for (const b of document.querySelectorAll("[data-branch-note]")) {
    b.onclick = () => {
      const fresh = ctx.getState(),
        n = fresh.branchNotes?.find((x) => x.id === b.dataset.branchNote);
      if (
        !n ||
        fresh.stockDemo ||
        (!office &&
          (ctx.workspace !== "store" || n.sourceId !== store || !fresh.access.stock))
      )
        return;
      if (!office && n.status === "packing") openPacking(fresh, n, ctx);
      else openReview(n, ctx, office);
    };
  }
}
