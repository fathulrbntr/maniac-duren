import { bindNoteProofViewer } from "./supplier-note-proof.mjs";
import { table, recordCells, recordTable } from "./supply-session-ui.mjs";
import { receiptOfficeControls } from "./receiving-session-ui.mjs";
import { workflowReady } from "./warehouse-workflow.mjs";
import { escape as e, id, today, money, num } from "./core.mjs";
import {
  noteBalance,
  cancellationBlock,
  noteReady,
  noteOwner,
  noteCanPay,
  noteMoney,
  noteUnitCosts,
} from "./supplier-notes.mjs";
const costValue = (value) =>
  value == null
    ? '<span title="Modal atau data penerimaan belum tersedia">—</span>'
    : money(value);
const field = (label, input) => `<label class="field">${e(label)}${input}</label>`;
const name = (s, collection, key) =>
  s[collection]?.find((v) => v.id === key)?.name || "—";
const stamp = (at) =>
  at ? new Date(at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "—";
const componentName = (c) => (c === "shipping" ? "Ongkir" : "Nota supplier");
export function notePaymentCell(p, component) {
  const b = noteBalance(p, component);
  return `<b>${money(b.total)}</b><span class="note-payment-status ${b.status}">${e(b.label)}</span>`;
}
function paymentCard(s, p, component) {
  const b = noteBalance(p, component);
  return `<section class="note-payment-card"><h3>${componentName(component)}</h3>${notePaymentCell(p, component)}<dl><div><dt>Sudah dibayar</dt><dd>${money(b.paid)}</dd></div><div><dt>${b.remaining < 0 ? "Kelebihan bayar" : "Sisa tagihan"}</dt><dd>${money(Math.abs(b.remaining))}</dd></div></dl>${noteCanPay(s) && b.remaining > 0 ? `<button type="button" data-note-pay="${component}">Catat pembayaran ${component === "shipping" ? "ongkir" : "nota"}</button>${b.status === "unknown" ? `<button type="button" data-note-unpaid="${component}">Tandai belum dibayar</button>` : ""}` : ""}</section>`;
}
function saveForm(d, action, p, ctx, payload) {
  const f = d.querySelector("form"),
    requestId = id();
  let saving = false;
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if (saving || !f.reportValidity()) return;
    saving = true;
    const button = f.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await ctx.mutate(
        action,
        { ...payload(f), id: requestId, planId: p.id, expectedRevision: p.revision },
        { throwOnError: true },
      );
      d.close();
      ctx.render();
      const state = ctx.getState();
      const updated =
        state.receiptPlans?.find((n) => n.id === p.id) ||
        state.cancelledReceiptPlans?.find((n) => n.id === p.id);
      if (updated) openSupplierNote(state, updated, ctx);
    } catch (error) {
      d.querySelector("#form-error").textContent = error.message;
    } finally {
      saving = false;
      if (button.isConnected) button.disabled = false;
    }
  };
}
function paymentDialog(s, p, component, ctx) {
  if (!noteCanPay(s)) return;
  const b = noteBalance(p, component);
  if (b.remaining <= 0) return;
  const d = ctx.modal(
    `Pembayaran ${componentName(component).toLowerCase()}`,
    `<p>Nota <b>${e(p.invoiceNo)}</b> · Sisa ${money(b.remaining)}</p><div class="form-grid">${field("Tanggal pembayaran", `<input name="date" type="date" value="${today()}" max="${today()}" required>`)}${field("Jumlah dibayar (Rp)", `<input name="amount" type="number" min="0.01" step="0.01" max="${b.remaining}" value="${b.remaining}" required>`)}${field("Metode", '<select name="method"><option value="transfer">Transfer bank</option><option value="cash">Tunai</option><option value="other">Lainnya</option></select>')}${field("Referensi / keterangan", '<input name="reference" maxlength="200" placeholder="Nomor referensi atau penerima pembayaran">')}</div><p class="muted">Catat pembayaran yang sudah dilakukan. Pembayaran ini hanya mengurangi tagihan ${componentName(component).toLowerCase()}.</p>`,
  );
  saveForm(d, "supplier_note_payment", p, ctx, (f) => ({
    component,
    amount: noteMoney(f.elements.amount.value),
    date: f.elements.date.value,
    method: f.elements.method.value,
    reference: f.elements.reference.value.trim(),
  }));
}
function correctionDialog(s, p, ctx) {
  if (!noteOwner(s)) return;
  const d = ctx.modal(
    "Koreksi nota · persetujuan owner",
    `<p>Nota <b>${e(p.invoiceNo)}</b> · ${e(name(s, "suppliers", p.supplierId))}</p><p>Periksa total harga per produk sesuai nota supplier. Jumlah barang dan barcode tetap mengikuti penerimaan.</p><div class="note-correction-lines">${p.lines.map((l, i) => field(`${name(s, "products", l.productId)} · sebelumnya ${money(l.purchaseCost)}`, `<input name="cost${i}" type="number" min="0.01" step="0.01" value="${e(l.purchaseCost)}" required>`)).join("")}${field(`Ongkir · sebelumnya ${money(p.shippingCost)}`, `<input name="shippingCost" type="number" min="0" step="0.01" value="${e(p.shippingCost)}" required>`)}</div>${field("Alasan koreksi", '<textarea name="reason" minlength="5" maxlength="500" required placeholder="Contoh: harga pada nota supplier salah diketik"></textarea>')}<p class="notice">Modal batch dan stok turunannya dihitung ulang. HPP transaksi terdahulu dan harga transfer tetap memakai nilai saat transaksi. Riwayat pembayaran tetap tersimpan.</p><label class="note-confirm"><input name="confirmed" type="checkbox" required> Saya sebagai owner menyetujui nilai koreksi ini.</label>`,
  );
  d.classList.add("supply-modal");
  saveForm(d, "supplier_note_correct", p, ctx, (f) => ({
    shippingCost: noteMoney(f.elements.shippingCost.value, true),
    lines: p.lines.map((l, i) => ({
      productId: l.productId,
      purchaseCost: noteMoney(f.elements[`cost${i}`].value),
    })),
    reason: f.elements.reason.value.trim(),
    ownerConfirmed: f.elements.confirmed.checked,
  }));
}
function archivedDraft(s, p) {
  const scans = p.receiving?.scans || [];
  const quantities = Object.entries(p.receiving?.quantities || {});
  if (!scans.length && !quantities.length) return "";
  const rows = [
    ...scans.map((x) => [
      e(name(s, "products", x.productId)),
      `${num(x.grams / 1000)} kg`,
      `<code>${e(x.barcode)}</code>`,
    ]),
    ...quantities.map(([key, x]) => [
      e(name(s, "products", key)),
      `${num(x.qty)} ${e(p.expected?.[key]?.unit)}`,
      "—",
    ]),
  ];
  return `<details><summary>Draf penerimaan saat dibatalkan</summary>${recordTable(["Produk", "Jumlah draf", "Barcode"], rows)}</details>`;
}
function cancelDialog(p, ctx) {
  const scans = p.receiving.scans?.length || 0;
  const quantities = Object.keys(p.receiving.quantities || {}).length;
  const d = ctx.modal(
    "Batalkan nota supplier",
    `<p>Batalkan nota <b>${e(p.invoiceNo)}</b>? Nota akan keluar dari daftar penerimaan dan tagihan aktif.</p>${scans || quantities ? `<p class="notice">Draf penerimaan berisi ${num(scans)} scan buah dan ${num(quantities)} jenis barang satuan. Draf disimpan di riwayat dan barcode dapat dipakai kembali.</p>` : ""}
    ${field("Alasan pembatalan", '<textarea name="reason" minlength="5" maxlength="500" required></textarea>')}`,
    "Batalkan nota",
  );
  d.classList.add("supply-modal");
  saveForm(d, "supplier_note_cancel", p, ctx, (f) => ({
    reason: f.elements.reason.value.trim(),
    expectedSessionRevision: p.receiving.revision,
  }));
}
export function openSupplierNote(s, p, ctx) {
  const cancelled = p.cancelled;
  const canCancel =
    s.supplierNoteCancelVersion >= 134 &&
    !s.stockDemo &&
    s.access?.backoffice &&
    ctx.workspace === "backoffice";
  const blocked = canCancel ? cancellationBlock(p) : "";
  const batches =
    [...(s.lots || []), ...(s.unitLots || [])].filter(
      (l) => p.receivedId && l.shipmentId === p.receivedId && !l.sourceLotId,
    ) || [];
  const history = (p.payments || [])
    .map(
      (x) =>
        `<article class="note-history-item"><b>${componentName(x.component)} · ${money(x.amount)}${x.voided ? " · Dibatalkan" : ""}</b><span>${e(x.date)} · ${e({ transfer: "Transfer bank", cash: "Tunai", other: "Lainnya" }[x.method])}</span><span>${e(x.reference || "—")}</span><small>Dicatat ${e(x.actor)} · ${e(stamp(x.at))}</small>${x.voided ? `<small>Alasan: ${e(x.voidReason)} · ${e(x.voidBy)} · ${e(stamp(x.voidAt))}</small>` : noteOwner(s) ? `<button type="button" data-note-void="${e(x.id)}">Batalkan catatan pembayaran</button>` : ""}</article>`,
    )
    .join("");
  const corrections = (p.corrections || [])
    .map(
      (c) =>
        `<article class="note-history-item"><b>${e(c.actor)} · ${e(stamp(c.at))}</b><p>${e(c.reason)}</p><ul>${(c.after.lines || []).map((l) => `<li>${e(name(s, "products", l.productId))}: ${money(c.before.lines.find((x) => x.productId === l.productId)?.purchaseCost)} → ${money(l.purchaseCost)}</li>`).join("")}${
          c.after.expected
            ? Object.entries(c.after.expected)
                .map(
                  ([productId, v]) =>
                    `<li>${e(name(s, "products", productId))}: ${c.before.expected?.[productId] ? `${num(c.before.expected[productId].kg)} kg / ${num(c.before.expected[productId].pieces)} butir` : "Belum dicatat"} → ${num(v.kg)} kg / ${num(v.pieces)} butir</li>`,
                )
                .join("")
            : `<li>Ongkir: ${money(c.before.shippingCost)} → ${money(c.after.shippingCost)}</li>`
        }</ul></article>`,
    )
    .join("");
  const costHeads = [
    "Produk",
    "Total harga nota",
    "Diterima",
    "Alokasi ongkir",
    p.lines.some((l) => p.expected?.[l.productId]?.unit) ? "Modal/satuan" : "Modal/kg",
    "Modal/butir",
  ];
  const costRows = p.lines.map((line) => {
    const batch = batches.find((b) => b.productId === line.productId);
    const costs = noteUnitCosts(batch);
    const unit = p.expected?.[line.productId]?.unit;
    const received = unit
      ? `${num(batch?.receivedQty)} ${e(unit)}`
      : `${num(batch?.receivedKg)} kg / ${num(batch?.receivedPieces)} butir`;
    const cells = [
      e(name(s, "products", line.productId)),
      money(line.purchaseCost),
      batch ? received : "—",
      costValue(batch?.shippingCost),
      unit
        ? `${costValue(batch?.unitCost)} /${e(unit)}`
        : `<span data-note-cost-kg>${costValue(costs.perKg)}</span>`,
      unit ? "—" : `<span data-note-cost-piece>${costValue(costs.perPiece)}</span>`,
    ];
    return `<tr data-note-cost-row="${e(line.productId)}">${recordCells(costHeads, cells)}</tr>`;
  });
  const d = ctx.modal(
    "Detail nota supplier",
    `<div class="note-detail"><header><h3>${e(p.invoiceNo)}</h3><p>${e(name(s, "suppliers", p.supplierId))} · ${e(p.date)}</p><p>${e(name(s, "stores", p.storeId))} · <b>${cancelled ? "Dibatalkan" : p.receivedId ? "Sudah diterima" : "Menunggu penerimaan"}</b></p></header>${p.hasProof && s.access?.backoffice && ctx.workspace === "backoffice" ? '<div><button type="button" data-view-note-proof>Lihat foto nota</button><span role="status" data-view-proof-status></span><img class="deposit-proof-full" data-note-proof-image alt="Bukti foto nota supplier" hidden></div>' : ""}${cancelled ? `<section class="notice"><b>Nota dibatalkan</b><p>${e(stamp(cancelled.at))} · ${e(cancelled.actor || "—")}</p><p>Alasan · ${e(cancelled.reason)}</p></section>${archivedDraft(s, p)}` : canCancel && blocked ? `<p class="muted">Pembatalan nota terkunci. ${e(blocked)}</p>` : ""}${s.stockDemo ? '<p class="notice">Mode demo aktif. Pembayaran dan koreksi nota hanya tersedia pada data nyata.</p>' : !noteReady(s) ? '<p class="notice">Pasang pembaruan nota supplier 112 untuk mencatat pembayaran dan koreksi owner.</p>' : ""}<div class="note-payment-grid">${paymentCard(s, p, "invoice")}${paymentCard(s, p, "shipping")}</div><h3>Rincian produk</h3>${table(costHeads, costRows, true)}<p class="muted">Modal termasuk alokasi ongkir, dibagi berat atau jumlah aktual saat penerimaan. Modal/butir merupakan rata-rata per buah.${cancelled ? "" : p.receivedId ? " Nilai — berarti data modal atau penerimaan belum tersedia untuk akun ini." : " Perhitungan tersedia setelah penerimaan selesai."}</p>${cancelled ? "" : noteOwner(s) ? '<button type="button" data-note-correct>Koreksi harga & ongkir · Owner</button>' : '<p class="muted">Koreksi harga dan ongkir hanya dapat disetujui melalui akun owner.</p>'}<h3>Riwayat pembayaran</h3>${history || '<p class="muted">Belum ada pembayaran yang dicatat.</p>'}<h3>Riwayat koreksi nota</h3>${corrections || '<p class="muted">Belum ada koreksi.</p>'}</div>`,
    "Tutup",
  );
  bindNoteProofViewer(d, p.id, ctx.readSupplierNoteProof);
  d.classList.add("supply-modal");
  d.querySelector("form").onsubmit = (ev) => {
    ev.preventDefault();
    d.close();
  };
  d.querySelectorAll("[data-note-pay]").forEach(
    (b) =>
      (b.onclick = () => {
        d.close();
        paymentDialog(s, p, b.dataset.notePay, ctx);
      }),
  );
  d.querySelector("[data-note-correct]")?.addEventListener("click", () => {
    d.close();
    correctionDialog(s, p, ctx);
  });
  d.querySelectorAll("[data-note-unpaid]").forEach(
    (b) =>
      (b.onclick = () => {
        d.close();
        const c = b.dataset.noteUnpaid;
        const confirm = ctx.modal(
          "Konfirmasi belum dibayar",
          `<p>Pastikan ${e(componentName(c).toLowerCase())} untuk <b>${e(p.invoiceNo)}</b> memang belum pernah dibayar. Jika sudah, gunakan Catat pembayaran.</p>`,
          "Tandai belum dibayar",
        );
        saveForm(confirm, "supplier_note_confirm_unpaid", p, ctx, () => ({
          component: c,
        }));
      }),
  );
  d.querySelectorAll("[data-note-void]").forEach(
    (b) =>
      (b.onclick = () => {
        d.close();
        const confirm = ctx.modal(
          "Batalkan catatan pembayaran · Owner",
          `${field("Alasan pembatalan", '<textarea name="reason" minlength="5" maxlength="500" required></textarea>')}<p>Gunakan untuk membetulkan pencatatan yang salah. Tindakan ini tidak mengembalikan uang melalui bank.</p>`,
          "Batalkan catatan",
        );
        saveForm(confirm, "supplier_note_payment_void", p, ctx, (f) => ({
          paymentId: b.dataset.noteVoid,
          reason: f.elements.reason.value.trim(),
        }));
      }),
  );
  const footerClose = d.querySelector(".modal-actions .close");
  if (canCancel && !blocked) {
    footerClose.setAttribute("class", "danger");
    footerClose.textContent = "Batalkan nota";
    footerClose.setAttribute("data-note-cancel", "");
    footerClose.onclick = () => {
      d.close();
      cancelDialog(p, ctx);
    };
  } else footerClose?.remove();
  if (!cancelled && workflowReady(s)) receiptOfficeControls(s, p, d, ctx);
  return d;
}
