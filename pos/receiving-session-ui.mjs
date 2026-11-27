import { prepareBarcodeInput, readyBarcodeInput } from "./barcode-scanner.mjs";
import { escape as e, id, num, money } from "./core.mjs";
import { noteBalance } from "./supplier-notes.mjs";
import {
  backOffice,
  receiptStatuses,
  receiptTotals,
  receiptVariance,
  saveWorkflow,
} from "./warehouse-workflow.mjs";
import {
  field,
  table,
  name,
  sessionDialog,
  submitSession,
  bindRecovery,
} from "./supply-session-ui.mjs";
function receivedSummary(p) {
  const units = p.lines.filter((l) => p.expected?.[l.productId]?.unit);
  const result = [];
  if (units.length < p.lines.length) {
    const t = receiptTotals(p);
    result.push(`${num(t.kg)} kg / ${num(t.pieces)} butir`);
  }
  if (units.length)
    result.push(
      `${units.filter((l) => p.receiving?.quantities?.[l.productId]).length} dari ${units.length} jenis barang satuan diterima`,
    );
  return result.join(" · ");
}
function quantityInput(attr, unit, value) {
  const step = ["pcs", "porsi"].includes(unit) ? 1 : 0.000001;
  return `<input ${attr} type="number" min="${step}" step="${step}" value="${e(value ?? "")}" required>`;
}
export function varianceTable(s, p) {
  return table(
    [
      "Produk",
      "Nota supplier",
      "Hasil penerimaan",
      "Selisih nota − aktual",
      "Penyusutan berat",
    ],
    p.lines.map((l) => {
      const expected = p.expected?.[l.productId];
      if (expected?.unit) {
        const actual = p.receiving?.quantities?.[l.productId]?.qty;
        const unit = e(expected.unit);
        const diff =
          p.receiving?.status === "completed" && actual != null
            ? `${num(expected.qty - actual)} ${unit}`
            : "Belum final";
        return `<tr><td>${e(name(s, "products", l.productId))}</td><td>${num(expected.qty)} ${unit}</td><td>${actual == null ? "Belum dicatat" : num(actual) + " " + unit}</td><td>${diff}</td><td>—</td></tr>`;
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
      return `<tr><td>${e(name(s, "products", l.productId))}</td><td>${v.expected ? `${num(v.expected.kg)} kg / ${num(v.expected.pieces)} butir` : "Belum dicatat"}</td><td>${num(v.actual.kg)} kg / ${num(v.actual.pieces)} butir</td><td>${diff}</td><td>${pct}</td></tr>`;
    }),
  );
}
export function receivingPage(s, store, space) {
  const branch = s.branchStockVersion >= 132;
  const bo = backOffice(s, space),
    plans = (s.receiptPlans || []).filter((p) => bo || p.storeId === store);
  return `<section class="supply-workspace"><div class="supply-hero"><div><span class="supply-eyebrow">PENERIMAAN SUPPLIER</span><h2>${bo ? (branch ? "Nota supplier cabang" : "Nota barang masuk gudang") : "Penerimaan & penimbangan"}</h2><p>${bo && branch ? "Pilih cabang penerima saat membuka nota supplier." : bo ? "Catat barang dan jumlah sesuai nota supplier. Stok masuk setelah gudang menyelesaikan penerimaan." : "Pilih nota untuk mencatat jumlah barang dan memindai label buah."}</p></div><div class="toolbar"><button type="button" data-supply-refresh>Perbarui</button>${bo ? '<button type="button" data-legacy-labels>Registrasi barcode stok lama</button><button type="button" class="primary" data-note-new>+ Nota supplier</button>' : ""}</div></div><section class="panel">${table(
    [
      "Nota / supplier",
      ...(bo && branch ? ["Lokasi penerima"] : []),
      "Tanggal",
      ...(bo ? ["Pembayaran nota", "Pembayaran ongkir"] : []),
      "Hasil penerimaan",
      "Penerimaan",
      "Aksi",
    ],
    plans.map((p) => {
      return `<tr><td><b>${e(p.invoiceNo)}</b><small>${e(name(s, "suppliers", p.supplierId))}</small></td>${bo && branch ? `<td>${e(name(s, "locations", p.storeId))}</td>` : ""}<td>${e(p.date)}</td>${
        bo
          ? ["invoice", "shipping"]
              .map((k) => {
                const b = noteBalance(p, k);
                return `<td>${money(b.total)}<small>${e(b.label)}</small></td>`;
              })
              .join("")
          : ""
      }<td>${receivedSummary(p)}</td><td>${e(receiptStatuses[p.receiving?.status] || "Belum dimulai")}</td><td><button type="button" ${bo ? `data-note-open="${e(p.id)}"` : `data-session-open="${e(p.id)}"`}>${bo ? "Buka nota" : p.receiving?.status === "completed" ? "Lihat penerimaan" : "Buka / lanjutkan"}</button></td></tr>`;
    }),
  )}</section></section>`;
}
export function receiptOfficeControls(s, p, d, ctx) {
  if (!backOffice(s, ctx.workspace)) return;
  const section = document.createElement("section");
  section.className = "receipt-comparison";
  section.innerHTML = `<h3>Nota supplier & hasil penerimaan</h3><p>${e(receiptStatuses[p.receiving?.status])}</p>${varianceTable(s, p)}<p class="muted">Penyusutan = (kg nota − kg aktual) ÷ kg nota × 100%. Selisih positif berarti kekurangan; negatif berarti kelebihan. Hasil final setelah penerimaan selesai.</p><div class="toolbar"><button type="button" data-expected-edit>Koreksi jumlah pada nota</button>${p.receiving?.status === "completed" ? '<button type="button" data-receipt-reopen>Buka ulang penerimaan</button>' : ""}<button type="button" data-receiving-view>Lihat detail penerimaan</button></div>`;
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
  const d = sessionDialog(
    ctx,
    `Penerimaan · ${p.invoiceNo}`,
    "<div data-receiving-session><div data-session-header></div><div data-session-detail></div></div>",
  );
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
    header.innerHTML = `<p>${e(name(s, "suppliers", p.supplierId))} · ${e(p.date)}</p><p class="notice">${e(receiptStatuses[status])} · ${receivedSummary(p)}${unitLines.length ? "" : " tersimpan"}</p>${varianceTable(ctx.getState(), p)}${editable ? unitLines.map((l) => `<button type="button" data-session-quantity="${e(l.productId)}">Catat jumlah · ${e(name(s, "products", l.productId))}</button>`).join(" ") : ""}${editable && fruit ? '<div class="supply-scan"><input data-session-code autocomplete="off" maxlength="26" inputmode="numeric" placeholder="Scan barcode buah" aria-label="Scan barcode buah" aria-describedby="form-error"><button type="button" data-session-scan>Simpan scan</button></div>' : ""}`;
    detail.innerHTML = `${editable && fruit ? '<p class="muted">Tunggu konfirmasi tersimpan sebelum scan buah berikutnya. Barcode menentukan produk dan berat; satu label untuk satu buah.</p>' : ""}<div class="toolbar">${!readOnly ? (status === "paused" ? '<button type="button" data-session-resume>Lanjutkan penerimaan</button>' : editable ? '<button type="button" data-session-pause>Jeda penerimaan</button><button type="button" class="primary" data-session-finish>Selesaikan penerimaan</button>' : "<p>Penerimaan terkunci. Koreksi harus dibuka dari Back Office.</p>") : ""}</div><section ${fruit ? "" : "hidden"} data-receiving-barcodes aria-label="Barcode tersimpan"><h3>Barcode tersimpan (${totals.pieces})</h3>${table(
      ["Barcode", "Produk", "Berat", ...(editable ? ["Aksi"] : [])],
      p.receiving.scans
        .slice()
        .reverse()
        .map(
          (x) =>
            `<tr><td><code>${e(x.barcode)}</code></td><td>${e(name(ctx.getState(), "products", x.productId))}</td><td>${num(x.grams / 1000)} kg</td>${editable ? `<td><button type="button" data-session-remove="${e(x.barcode)}">Hapus scan</button></td>` : ""}</tr>`,
        ),
    )}</section>`;
    body.querySelectorAll("[data-session-quantity]").forEach((button) => {
      button.onclick = () => {
        if (working) return;
        const productId = button.dataset.sessionQuantity;
        const unit = p.expected[productId].unit;
        const saved = p.receiving.quantities?.[productId];
        d.close();
        const next = ctx.modal(
          `Terima ${e(name(s, "products", productId))}`,
          field(
            `Jumlah aktual (${unit})`,
            quantityInput('name="qty"', unit, saved?.qty),
          ) +
            field(
              "Kedaluwarsa (opsional)",
              `<input type="date" name="expiry" min="${e(p.date)}" value="${e(saved?.expiry || "")}">`,
            ),
          "Simpan jumlah",
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
    body
      .querySelector("[data-session-pause]")
      ?.addEventListener("click", () => perform("receipt_pause"));
    body
      .querySelector("[data-session-resume]")
      ?.addEventListener("click", () => perform("receipt_resume"));
    body.querySelector("[data-session-finish]")?.addEventListener("click", () => {
      if (
        confirm(
          "Semua barang pada nota sudah diperiksa dan jumlah aktualnya sesuai? Selesaikan penerimaan untuk membukukan stok.",
        )
      )
        perform("receipt_finish", { confirmed: true });
    });
    body.querySelectorAll("[data-session-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          if (confirm("Hapus scan ini dari daftar penerimaan?"))
            perform("receipt_scan_remove", { barcode: b.dataset.sessionRemove });
        }),
    );
  };
  draw();
  d.addEventListener("close", () => ctx.render());
  readyBarcodeInput(body.querySelector("[data-session-code]"));
  return d;
}
