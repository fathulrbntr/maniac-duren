import { confirmAction } from "../shared/confirmation.mjs";
import { prepareBarcodeInput, readyBarcodeInput } from "./barcode-scanner.mjs";
import { escape as e, id, num, money } from "./core.mjs";
import { noteBalance, supplierNoteSummary } from "./supplier-notes.mjs";
import { pageIcon } from "./navigation.mjs";
import {
  backOffice,
  receiptProgress,
  receiptTotals,
  receiptVariance,
  saveWorkflow,
} from "./warehouse-workflow.mjs";
import {
  field,
  recordTable,
  table,
  name,
  submitSession,
  bindRecovery,
} from "./supply-session-ui.mjs";
import { paymentStage, progressBadge, progressButton } from "./progress-ui.mjs";

function receiptBadge(p) {
  const detail = { paused: "Dijeda", reopened: "Dibuka kembali" }[p.receiving?.status];
  return progressBadge(receiptProgress(p), detail);
}

function receivedSummary(p) {
  const units = p.lines.filter((l) => p.expected?.[l.productId]?.unit);
  const result = [];
  if (units.length < p.lines.length) {
    const t = receiptTotals(p);
    result.push(`${num(t.kg)} kg / ${num(t.pieces)} butir`);
  }
  if (units.length)
    result.push(
      `${units.filter((l) => p.receiving?.quantities?.[l.productId]?.qty > 0).length} dari ${units.length} jenis barang satuan diterima`,
    );
  return result.join(" · ");
}
function quantityInput(attr, unit, value) {
  const whole = ["pcs", "porsi"].includes(unit);
  const step = whole ? 1 : 0.000001;
  return `<input ${attr} type="number" inputmode="${whole ? "numeric" : "decimal"}" min="${step}" step="${step}" value="${e(value ?? "")}" required>`;
}
function quantityEntry(productId, productName, actual, unit) {
  const saved = actual != null;
  const label = saved ? "Ubah jumlah" : "Isi jumlah diterima";
  return `<div class="receipt-quantity-entry">${saved ? `<strong>${num(actual)} ${e(unit)}</strong>` : ""}<button type="button" class="receipt-quantity-button${saved ? "" : " primary"}" data-session-quantity="${e(productId)}" aria-label="${e(label + " untuk " + productName)}" aria-haspopup="dialog">${pageIcon("edit")}${label}</button></div>`;
}
export function varianceTable(s, p, { enterQuantities = false } = {}) {
  const rows = recordTable(
    [
      "Produk",
      "Nota supplier",
      "Hasil penerimaan",
      ...(enterQuantities ? [] : ["Selisih nota − aktual", "Penyusutan berat"]),
    ],
    p.lines.map((l) => {
      const expected = p.expected?.[l.productId];
      const productName = name(s, "products", l.productId);
      if (expected?.unit) {
        const actual = p.receiving?.quantities?.[l.productId]?.qty;
        const unit = e(expected.unit);
        const diff =
          p.receiving?.status === "completed" && actual != null
            ? `${num(expected.qty - actual)} ${unit}`
            : "Belum final";
        return [
          e(productName),
          `${num(expected.qty)} ${unit}`,
          enterQuantities
            ? quantityEntry(l.productId, productName, actual, expected.unit)
            : actual == null
              ? "Belum dicatat"
              : `${num(actual)} ${unit}`,
          ...(enterQuantities ? [] : [diff, "—"]),
        ];
      }
      const v = receiptVariance(p, l.productId);
      const diff =
        v.kg === null ? "Menunggu selesai" : `${num(v.kg)} kg / ${num(v.pieces)} butir`;
      const pct =
        v.percent === null
          ? v.expected
            ? "Belum final"
            : "Data nota belum diisi"
          : v.percent < 0
            ? `Kelebihan ${num(-v.percent)}%`
            : `${num(v.percent)}%`;
      return [
        e(productName),
        v.expected
          ? `${num(v.expected.kg)} kg / ${num(v.expected.pieces)} butir`
          : "Belum dicatat",
        `${num(v.actual.kg)} kg / ${num(v.actual.pieces)} butir`,
        ...(enterQuantities ? [] : [diff, pct]),
      ];
    }),
  );
  return enterQuantities ? `<div class="receipt-entry-table">${rows}</div>` : rows;
}
function cancelledNotes(s) {
  const notes = s.cancelledReceiptPlans || [];
  if (!notes.length) return "";
  return `<details class="panel"><summary>Nota dibatalkan (${num(notes.length)})</summary>${table(
    ["Nomor nota / supplier", "Cabang", "Tanggal pembatalan", "Alasan", ""],
    notes.map(
      (p) =>
        `<tr data-progress="cancelled"><td><b>${e(p.invoiceNo)}</b><small>${e(name(s, "suppliers", p.supplierId))}</small></td><td>${e(name(s, "locations", p.storeId))}</td><td>${e(new Date(p.cancelled.at).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" }))}</td><td>${e(p.cancelled.reason)}</td><td>${progressButton("cancelled", "note-open", p.id, `nota ${p.invoiceNo}`)}</td></tr>`,
    ),
  )}</details>`;
}
let selectedBalance = "payable";
export function bindNoteSummary() {
  document.querySelectorAll('input[name="note-summary-balance"]').forEach((input) => {
    input.onchange = () => {
      if (input.checked) selectedBalance = input.value;
    };
  });
}
export function supplierNoteSummaryPanel(plans) {
  const { total, inTransit, payable, settled, unclassified } = supplierNoteSummary(plans);
  const amount = (metric) =>
    metric.amount == null ? "Nilai belum tersedia" : money(metric.amount);
  const count = (metric) => `${num(metric.count)} nota`;
  const option = (key, label) =>
    `<label><input class="sr-only" type="radio" name="note-summary-balance" value="${key}" ${key === selectedBalance ? "checked" : ""}><span>${label}</span></label>`;
  return `<section class="note-summary" aria-label="Ringkasan nota">
    <div class="note-segments" role="radiogroup" aria-label="Pilih nominal pembayaran barang">
      ${option("payable", "Tagihan")}${option("settled", "Lunas")}
    </div>
    <div class="note-balances" aria-live="polite">
      <div data-balance="payable"><strong>${amount(payable)}</strong><small>${count(payable)} dengan sisa tagihan</small></div>
      <div data-balance="settled"><strong>${amount(settled)}</strong><small>${count(settled)} lunas</small></div>
    </div>
    <div class="note-totals">
      <div><span>Total nota</span><strong>${count(total)}</strong><small>${amount(total)}</small></div>
      <div><span>Dalam perjalanan</span><strong>${count(inTransit)}</strong><small>${amount(inTransit)}</small></div>
    </div>
    <small class="note-scope">Nilai barang di luar ongkir</small>
    ${unclassified ? `<p class="notice">Tagihan dan Lunas hanya mencakup nota dengan data pembayaran lengkap. Periksa ${num(unclassified)} nota lainnya.</p>` : ""}
  </section>`;
}
function officeNoteList(s, plans) {
  const rows = plans.map((p) => {
    const invoice = noteBalance(p, "invoice");
    const freight = noteBalance(p, "shipping");
    const supplier = name(s, "suppliers", p.supplierId);
    const branch = name(s, "locations", p.storeId);
    return `<tr>
      <td class="note-who"><button class="note-row-open" type="button" data-note-open="${e(p.id)}" aria-label="Buka nota ${e(p.invoiceNo)} dari ${e(supplier)}"><strong>${e(supplier)}</strong><small>${e(p.invoiceNo)}</small></button></td>
      <td class="note-where">${e(branch)}<small>${e(p.date)}</small></td>
      <td class="note-invoice"><b>${money(invoice.total)}</b><small>${progressBadge(paymentStage(invoice.status), invoice.label)}</small></td>
      <td class="note-freight">${money(freight.total)}<small>${progressBadge(paymentStage(freight.status), freight.label)}</small></td>
      <td class="note-arrival">${receiptBadge(p)}<small>${receivedSummary(p)}</small></td>
    </tr>`;
  });
  return `<section class="panel note-list-panel"><h3>Daftar nota</h3>${table(["Supplier / nota", "Lokasi penerima / tanggal", "Pembayaran nota", "Pembayaran ongkir", "Penerimaan"], rows)}</section>`;
}
export function receivingPage(s, store, space) {
  if (backOffice(s, space)) {
    const plans = s.receiptPlans || [];
    return `<section class="supply-workspace note-office">
      <header class="note-heading"><h2>${s.branchStockVersion >= 132 ? "Nota supplier" : "Nota barang masuk gudang"}</h2>
        <div class="note-actions"><button type="button" class="primary" data-note-new><span aria-hidden="true">+</span> Buat nota</button>
          <details class="note-tools"><summary aria-label="Tindakan nota lainnya">•••</summary><div><button type="button" data-supply-refresh>Perbarui</button><button type="button" data-legacy-labels>Registrasi barcode stok lama</button></div></details>
        </div></header>
      ${supplierNoteSummaryPanel(plans)}${officeNoteList(s, plans)}${cancelledNotes(s)}
    </section>`;
  }
  const plans = (s.receiptPlans || []).filter((p) => p.storeId === store);
  return `<section class="supply-workspace"><div class="supply-hero"><div><span class="supply-eyebrow">PENERIMAAN SUPPLIER</span><h2>Penerimaan & penimbangan</h2><p>Pilih nota untuk mencatat jumlah barang dan memindai label buah.</p></div><div class="toolbar"><button type="button" data-supply-refresh>Perbarui</button></div></div><section class="panel">${recordTable(
    ["Nota / supplier", "Tanggal", "Hasil penerimaan", "Penerimaan", "Aksi"],
    plans.map((p) => {
      const progress = receiptProgress(p);
      return {
        progress,
        cells: [
          `<b>${e(p.invoiceNo)}</b><small>${e(name(s, "suppliers", p.supplierId))}</small>`,
          e(p.date),
          receivedSummary(p),
          receiptBadge(p),
          progressButton(progress, "session-open", p.id, `penerimaan ${p.invoiceNo}`),
        ],
      };
    }),
  )}</section></section>`;
}
export function receiptOfficeControls(s, p, d, ctx) {
  if (!backOffice(s, ctx.workspace)) return;
  const section = document.createElement("section");
  section.className = "receipt-comparison";
  section.innerHTML = `<h3>Nota supplier & hasil penerimaan</h3><p>${receiptBadge(p)}</p>${varianceTable(s, p)}<p class="muted">Penyusutan = (kg nota − kg aktual) ÷ kg nota × 100%. Selisih positif berarti kekurangan; negatif berarti kelebihan. Hasil final setelah penerimaan selesai.</p><div class="toolbar"><button type="button" data-expected-edit>Koreksi jumlah pada nota</button>${p.receiving?.status === "completed" ? '<button type="button" data-receipt-reopen>Buka ulang penerimaan</button>' : ""}<button type="button" data-receiving-view>Lihat detail penerimaan</button></div>`;
  d.querySelector(".note-detail").prepend(section);
  const change = (action, title, body, payload) => {
    d.close();
    const next = ctx.modal(title, body, "Simpan");
    next.classList.add("supply-modal");
    submitSession(next, ctx, p.id, action, (f) => ({
      planId: p.id,
      expectedSessionRevision: p.receiving.revision,
      expectedRevision: p.revision,
      reason: f.elements.reason.value.trim(),
      ...payload(f),
    }));
    bindRecovery(next, ctx, p.id, () => ctx.render());
  };
  section.querySelector("[data-expected-edit]").onclick = () =>
    change(
      "receipt_expected_edit",
      "Koreksi jumlah pada nota",
      p.lines
        .map(
          (l) =>
            `<fieldset data-expected-product="${e(l.productId)}"><legend>${e(name(s, "products", l.productId))}</legend><div class="form-grid">${p.expected?.[l.productId]?.unit ? field(`Jumlah nota (${p.expected[l.productId].unit})`, quantityInput("data-expected-qty", p.expected[l.productId].unit, p.expected[l.productId].qty)) : field("Berat nota (kg)", `<input data-expected-kg type="number" min="0.001" step="0.001" value="${p.expected?.[l.productId]?.kg || ""}" required>`) + field("Jumlah nota (butir)", `<input data-expected-pieces type="number" min="1" step="1" value="${p.expected?.[l.productId]?.pieces || ""}" required>`)}</div></fieldset>`,
        )
        .join("") +
        field(
          "Alasan koreksi",
          '<textarea name="reason" minlength="5" maxlength="500" required></textarea>',
        ),
      (f) => ({
        lines: [...f.querySelectorAll("[data-expected-product]")].map((el) => ({
          productId: el.dataset.expectedProduct,
          ...(el.querySelector("[data-expected-qty]")
            ? { expectedQty: Number(el.querySelector("[data-expected-qty]").value) }
            : {
                expectedKg: Number(el.querySelector("[data-expected-kg]").value),
                expectedPieces: Number(el.querySelector("[data-expected-pieces]").value),
              }),
        })),
      }),
    );
  section
    .querySelector("[data-receipt-reopen]")
    ?.addEventListener("click", () =>
      change(
        "receipt_reopen",
        "Buka ulang penerimaan",
        field(
          "Alasan pembukaan",
          '<textarea name="reason" minlength="5" maxlength="500" required></textarea>',
        ) +
          "<p>Petugas penerimaan dapat membetulkan scan. Barang yang sudah berpindah atau terjual tidak dapat dihapus. Batch dibekukan untuk transaksi baru sampai penerimaan diselesaikan kembali.</p>",
        () => ({}),
      ),
    );
  section.querySelector("[data-receiving-view]").onclick = () => {
    d.close();
    openReceivingSession(ctx.getState(), p.id, ctx, true);
  };
}
export function openReceivingSession(s, pid, ctx, readOnly = false) {
  let p = s.receiptPlans.find((x) => x.id === pid);
  if (!p) return;
  const bo = backOffice(s, ctx.workspace);
  readOnly ||= bo;
  const d = ctx.modal(
    `Penerimaan · ${e(p.invoiceNo)}`,
    "<div data-receiving-session><div data-session-header></div><div data-session-detail></div></div>",
  );
  d.classList.add("supply-modal");
  d.querySelector("form").onsubmit = (event) => event.preventDefault();
  const actions = d.querySelector(".modal-actions");
  const body = d.querySelector("[data-receiving-session]");
  const header = body.querySelector("[data-session-header]");
  const detail = body.querySelector("[data-session-detail]");
  const feedback = d.querySelector("#form-error");
  feedback.setAttribute("role", "status");
  body.insertBefore(feedback, detail);
  let working = false;
  const reopen = () => openReceivingSession(ctx.getState(), pid, ctx, readOnly);
  const recovery = bindRecovery(d, ctx, pid, reopen);
  const perform = async (action, extra = {}) => {
    if (working) return;
    working = true;
    const scanning = action === "receipt_scan";
    feedback.className = scanning ? "muted" : "error";
    feedback.textContent = scanning ? "Menyimpan scan…" : "";
    try {
      await saveWorkflow(ctx.getState(), pid, ctx, action, {
        id: id(),
        planId: pid,
        expectedSessionRevision: p.receiving.revision,
        ...extra,
      });
      p = ctx.getState().receiptPlans.find((x) => x.id === pid);
      if (!p) {
        d.close();
        ctx.render();
        return;
      }
      d.dataset.dirty = "false";
      draw();
      feedback.className = scanning ? "positive" : "error";
      feedback.textContent = scanning ? `Barcode ${extra.barcode} sudah tersimpan.` : "";
    } catch (err) {
      feedback.className = "error";
      feedback.textContent = err.message;
      recovery();
    } finally {
      working = false;
      readyBarcodeInput(body.querySelector("[data-session-code]"));
    }
  };
  const draw = () => {
    const status = p.receiving.status,
      editable = !readOnly && ["open", "reopened"].includes(status),
      totals = receiptTotals(p),
      unitLines = p.lines.filter((l) => p.expected?.[l.productId]?.unit),
      fruit = unitLines.length < p.lines.length;
    header.innerHTML = `<p>${e(name(s, "suppliers", p.supplierId))} · ${e(p.date)}</p><p class="notice">${receiptBadge(p)} · ${receivedSummary(p)}${unitLines.length ? "" : " tersimpan"}</p>${varianceTable(ctx.getState(), p, { enterQuantities: editable && unitLines.length > 0 })}${editable && fruit ? '<div class="supply-scan"><input data-session-code autocomplete="off" maxlength="26" inputmode="numeric" placeholder="Scan barcode buah" aria-label="Scan barcode buah" aria-describedby="form-error"><button type="button" data-session-scan>Simpan</button></div>' : ""}`;
    detail.innerHTML = `${editable && fruit ? '<p class="muted">Tunggu konfirmasi tersimpan sebelum scan buah berikutnya. Barcode menentukan produk dan berat; satu label untuk satu buah.</p>' : ""}${!readOnly && status === "completed" ? "<p>Penerimaan terkunci. Koreksi harus dibuka dari Back Office.</p>" : ""}<section ${fruit ? "" : "hidden"} data-receiving-barcodes aria-label="Barcode tersimpan"><h3>Barcode tersimpan (${totals.pieces})</h3>${recordTable(
      ["Barcode", "Produk", "Berat", ...(editable ? ["Aksi"] : [])],
      p.receiving.scans
        .slice()
        .reverse()
        .map((x) => [
          `<code>${e(x.barcode)}</code>`,
          e(name(ctx.getState(), "products", x.productId)),
          `${num(x.grams / 1000)} kg`,
          ...(editable
            ? [
                `<button type="button" data-session-remove="${e(x.barcode)}">Hapus scan</button>`,
              ]
            : []),
        ]),
    )}</section>`;
    body.querySelectorAll("[data-session-quantity]").forEach((button) => {
      button.onclick = () => {
        if (working) return;
        const productId = button.dataset.sessionQuantity;
        const expected = p.expected[productId];
        const unit = expected.unit;
        const saved = p.receiving.quantities?.[productId];
        d.close();
        const next = ctx.modal(
          `Penerimaan · ${e(name(s, "products", productId))}`,
          `<p class="muted">Jumlah pada nota <strong>${num(expected.qty)} ${e(unit)}</strong></p>` +
            field(
              `Jumlah diterima (${unit})`,
              quantityInput('name="qty" autofocus', unit, saved?.qty),
            ) +
            field(
              "Kedaluwarsa (opsional)",
              `<input type="date" name="expiry" min="${e(p.date)}" value="${e(saved?.expiry || "")}">`,
            ),
        );
        next.classList.add("supply-modal");
        const refreshRecovery = bindRecovery(next, ctx, pid, reopen);
        submitSession(
          next,
          ctx,
          pid,
          "receipt_quantity",
          (f) => ({
            planId: pid,
            expectedSessionRevision: p.receiving.revision,
            productId,
            qty: Number(f.elements.qty.value),
            expiry: f.elements.expiry.value || null,
          }),
          reopen,
          refreshRecovery,
        );
      };
    });
    const input = body.querySelector("[data-session-code]");
    prepareBarcodeInput(input);
    const scan = () => {
      if (input.value.trim())
        return perform("receipt_scan", { barcode: input.value.trim() });
    };
    input?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        scan();
      }
    });
    body.querySelector("[data-session-scan]")?.addEventListener("click", scan);
    if (editable) {
      actions.innerHTML =
        '<button type="button" data-session-pause>Jeda</button><button type="button" class="primary" data-session-finish>Selesai</button>';
      actions.querySelector("[data-session-pause]").onclick = () =>
        perform("receipt_pause");
      const finish = actions.querySelector("[data-session-finish]");
      const scannedProducts = new Set(p.receiving.scans.map((scan) => scan.productId));
      finish.disabled = p.lines.some(({ productId }) =>
        p.expected?.[productId]?.unit
          ? !(p.receiving.quantities?.[productId]?.qty > 0)
          : !scannedProducts.has(productId),
      );
      finish.onclick = async () => {
        if (
          !working &&
          (await confirmAction(
            "Semua barang pada nota sudah diperiksa dan jumlah aktualnya sesuai? Selesaikan penerimaan untuk membukukan stok.",
          ))
        ) {
          return perform("receipt_finish", { confirmed: true });
        }
      };
    } else if (!readOnly && status === "paused") {
      actions.innerHTML =
        '<button type="button" class="primary" data-session-resume>Lanjutkan</button>';
      actions.querySelector("[data-session-resume]").onclick = () =>
        perform("receipt_resume");
    } else {
      actions.remove();
    }
    body.querySelectorAll("[data-session-remove]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (await confirmAction("Hapus scan ini dari daftar penerimaan?"))
            perform("receipt_scan_remove", { barcode: b.dataset.sessionRemove });
        }),
    );
  };
  draw();
  d.addEventListener("close", () => ctx.render());
  readyBarcodeInput(body.querySelector("[data-session-code]"));
  return d;
}
