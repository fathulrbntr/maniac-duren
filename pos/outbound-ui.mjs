import { escape as e, id, num, money, today } from "./core.mjs";
import {
  backOffice,
  outboundStatuses,
  outboundBalance,
  saveWorkflow,
  invoicePeriods,
  invoiceDate,
  invoicePaymentStatus,
  outboundInvoiceView,
  loadInvoiceFilters,
  saveInvoiceFilters,
} from "./warehouse-workflow.mjs";
import {
  field,
  table,
  name,
  options,
  sessionDialog,
  submitSession,
  bindRecovery,
} from "./supply-session-ui.mjs";
function invoiceScope(s, store, space) {
  const bo = backOffice(s, space);
  return {
    bo,
    orders: (s.outboundOrders || []).filter((o) => bo || o.sourceId === store),
  };
}
function invoiceTable(s, rows, bo, group) {
  return table(
    [
      "Dokumen",
      group === "issued" ? "Tanggal terbit (WIB)" : "Tanggal dibuat (WIB)",
      "Jenis / tujuan",
      "Barang",
      "Pengiriman",
      ...(bo ? [group === "cancelled" ? "Nilai dokumen" : "Pembayaran"] : []),
      ...(group === "cancelled" ? ["Alasan pembatalan"] : []),
      "Aksi",
    ],
    rows.map((o) => {
      const transfer = s.transfers?.find((t) => t.id === o.id),
        balance = bo ? outboundBalance(o) : null;
      const cancelled = group === "cancelled",
        payment = invoicePaymentStatus(o);
      const status = cancelled
        ? "Dibatalkan"
        : transfer?.status === "received"
          ? "Diterima toko"
          : outboundStatuses[o.status] || o.status;
      return `<tr data-outbound-row="${e(o.id)}"><td><b>${e(o.invoiceNo || (cancelled ? "Dokumen dibatalkan" : "Belum terbit"))}</b><small>${e(o.deliveryNo || o.id.slice(0, 8))}</small></td><td>${e(invoiceDate(group === "issued" ? o.issuedAt : o.createdAt) || "Belum tersedia")}</td><td>${o.kind === "transfer" ? "Transfer toko" : "Wholesale"}<small>${e(o.kind === "transfer" ? name(s, "locations", o.targetId) : o.buyer?.name)}</small></td><td>${num(o.items.length)} butir / ${num(o.items.reduce((v, i) => v + i.grams, 0) / 1000)} kg</td><td>${e(status)}</td>${bo ? `<td>${o.total == null ? "Menunggu scan" : money(balance.total)}${cancelled ? "<small>Tidak masuk tagihan aktif</small>" : o.invoiceNo ? `<small class="outbound-payment ${e(payment)}">${e({ paid: "Lunas", partial: "Dibayar sebagian", unpaid: "Belum dibayar", unknown: "Nilai belum tersedia" }[payment])}</small>${payment !== "unknown" ? `<small>Sudah dibayar ${money(balance.paid)}</small><small>Sisa ${money(balance.remaining)}</small>` : ""}` : "<small>Belum terbit</small>"}</td>` : ""}${cancelled ? `<td>${e(o.cancelReason || transfer?.cancelReason || "—")}</td>` : ""}<td><button type="button" data-outbound-open="${e(o.id)}">Buka</button></td></tr>`;
    }),
  );
}
function invoiceSummary(view) {
  const ready = view.summary && !view.summary.incomplete;
  return `<div class="supply-stats outbound-summary">${[
    ["total", "Total nota aktif", `${num(view.activeCount)} invoice dalam periode`],
    ["paid", "Sudah dibayar", "Pembayaran tercatat untuk invoice periode ini"],
    ["remaining", "Sisa tagihan", "Total nota aktif dikurangi pembayaran"],
  ]
    .map(
      ([key, label, hint]) =>
        `<article class="supply-stat"><span>${label}</span><strong data-invoice-total="${key}">${ready ? money(view.summary[key]) : "—"}</strong><small>${e(hint)}</small></article>`,
    )
    .join(
      "",
    )}</div>${view.summary?.incomplete ? '<p class="notice">Nilai invoice belum lengkap. Perbarui data untuk menghitung ringkasan.</p>' : ""}`;
}
function invoiceSection(s, view, bo, group) {
  const titles = {
    issued: "Sudah diterbitkan",
    drafts: "Belum diterbitkan",
    cancelled: "Dibatalkan",
  };
  const hint =
    group === "issued"
      ? `${num(view.issued.length)} dari ${num(view.activeCount)} invoice aktif dalam periode ditampilkan.`
      : group === "drafts"
        ? "Semua dokumen yang masih disiapkan atau menunggu penerbitan."
        : "Semua dokumen dibatalkan, termasuk yang belum memiliki nomor invoice.";
  return `<div class="outbound-table-heading"><h3>${titles[group]}</h3><span class="supply-badge">${num(view[group].length)}</span></div><p class="muted">${e(hint)}</p>${invoiceTable(s, view[group], bo, group)}`;
}
export function outboundPage(s, store, space) {
  const { bo, orders } = invoiceScope(s, store, space),
    filters = loadInvoiceFilters(s, store, space);
  const view = outboundInvoiceView(orders, filters, today(), {
    finance: bo,
    transfers: s.transfers,
  });
  return `<section class="supply-workspace" data-outbound-page><div class="supply-hero"><div><span class="supply-eyebrow">DISTRIBUSI GUDANG</span><h2>Transfer toko & invoice wholesale</h2><p>${bo ? "Buat dokumen dan harga khusus, tunggu scan gudang, lalu terbitkan." : "Scan barang sesuai dokumen Back Office. Setiap barcode hanya boleh masuk satu pengiriman aktif."}</p></div><div class="toolbar"><button type="button" data-supply-refresh>Perbarui</button>${bo ? '<button type="button" class="primary" data-outbound-new>+ Transaksi baru</button>' : ""}</div></div><section class="panel outbound-filter-panel" aria-label="Filter invoice terbit"><h3>Periode invoice</h3><div class="outbound-filters">${field(
    "Periode",
    `<select data-invoice-period>${Object.entries(invoicePeriods)
      .map(
        ([k, v]) =>
          `<option value="${k}" ${filters.period === k ? "selected" : ""}>${v}</option>`,
      )
      .join("")}</select>`,
  )}${field("Tanggal awal", `<input data-invoice-from type="date" value="${e(view.period.from)}">`)}${field("Tanggal akhir", `<input data-invoice-to type="date" value="${e(view.period.to)}">`)}${bo ? field("Status pembayaran", `<select data-invoice-payment><option value="all" ${filters.payment === "all" ? "selected" : ""}>Semua pembayaran</option><option value="paid" ${filters.payment === "paid" ? "selected" : ""}>Lunas</option><option value="unpaid" ${filters.payment === "unpaid" ? "selected" : ""}>Belum lunas / sebagian</option></select>`) : ""}<button type="button" data-invoice-reset>Reset filter</button></div><p class="error" data-invoice-error role="alert">${e(view.period.error)}</p><p class="muted">Periode mengikuti tanggal terbit (WIB).${bo ? " Ringkasan mencakup seluruh invoice aktif dalam periode; filter pembayaran hanya menyaring tabel. Pembayaran di tanggal lain tetap dihitung untuk invoice yang sama." : ""}</p><p class="notice" data-invoice-missing-dates ${view.missingDates ? "" : "hidden"}>${num(view.missingDates)} invoice belum memiliki tanggal terbit yang valid. Invoice tersebut hanya muncul pada Semua periode.</p></section>${bo ? `<div data-invoice-summary aria-live="polite">${invoiceSummary(view)}</div>` : ""}${["issued", "drafts", "cancelled"].map((group) => `<section class="panel outbound-table-panel" data-invoice-table="${group}" aria-label="${{ issued: "Invoice sudah diterbitkan", drafts: "Dokumen belum diterbitkan", cancelled: "Dokumen dibatalkan" }[group]}">${invoiceSection(s, view, bo, group)}</section>`).join("")}</section>`;
}
export function bindOutboundPage(s, store, ctx) {
  const root = document.querySelector("[data-outbound-page]");
  if (!root) return;
  let filters = loadInvoiceFilters(s, store, ctx.workspace);
  const period = root.querySelector("[data-invoice-period]"),
    from = root.querySelector("[data-invoice-from]"),
    to = root.querySelector("[data-invoice-to]"),
    payment = root.querySelector("[data-invoice-payment]");
  const draw = () => {
    const current = ctx.getState(),
      { bo, orders } = invoiceScope(current, store, ctx.workspace);
    const view = outboundInvoiceView(orders, filters, today(), {
      finance: bo,
      transfers: current.transfers,
    });
    period.value = filters.period;
    from.value = view.period.from;
    to.value = view.period.to;
    if (payment) payment.value = filters.payment;
    root.querySelector("[data-invoice-error]").textContent = view.period.error;
    const missing = root.querySelector("[data-invoice-missing-dates]");
    missing.hidden = !view.missingDates;
    missing.textContent = `${num(view.missingDates)} invoice belum memiliki tanggal terbit yang valid. Invoice tersebut hanya muncul pada Semua periode.`;
    const summary = root.querySelector("[data-invoice-summary]");
    if (summary) summary.innerHTML = bo ? invoiceSummary(view) : "";
    for (const group of ["issued", "drafts", "cancelled"])
      root.querySelector(`[data-invoice-table="${group}"]`).innerHTML = invoiceSection(
        current,
        view,
        bo,
        group,
      );
  };
  const save = () => {
    filters = saveInvoiceFilters(ctx.getState(), store, ctx.workspace, filters);
    draw();
  };
  period.onchange = () => {
    filters = {
      ...filters,
      period: period.value,
      from: from.value || today(),
      to: to.value || today(),
    };
    save();
  };
  from.onchange = to.onchange = () => {
    filters = { ...filters, period: "custom", from: from.value, to: to.value };
    save();
  };
  if (payment)
    payment.onchange = () => {
      filters = { ...filters, payment: payment.value };
      save();
    };
  root.querySelector("[data-invoice-reset]").onclick = () => {
    filters = { period: "all", payment: "all", from: "", to: "" };
    save();
  };
  root.addEventListener("click", (ev) => {
    const button = ev.target.closest("[data-outbound-open]");
    if (button) openOutbound(ctx.getState(), button.dataset.outboundOpen, ctx);
  });
}
export function openOutboundForm(s, store, ctx, o) {
  if (!backOffice(s, ctx.workspace)) return;
  const wh = (s.locations || s.stores).find((x) => x.locationType === "warehouse"),
    products = s.products.filter((p) => p.stockUnit === "kg_butir"),
    stores = (s.locations || s.stores).filter((x) => x.locationType === "store");
  if (!wh || !products.length) {
    ctx.toast("Lengkapi gudang dan master buah terlebih dahulu.");
    return;
  }
  const key = o?.id || id(),
    rows = o
      ? structuredClone(o.rates)
      : [{ productId: products[0].id, unit: "kg", price: "" }];
  const d = ctx.modal(
    o ? "Edit dokumen & harga" : "Transaksi barang keluar",
    `<div class="form-grid">${field("Jenis transaksi", `<select name="kind"><option value="transfer" ${o?.kind !== "wholesale" ? "selected" : ""}>Transfer ke toko Maniac Duren</option><option value="wholesale" ${o?.kind === "wholesale" ? "selected" : ""}>Penjualan wholesale</option></select>`)}${field("Toko tujuan", `<select name="targetId">${options(stores, o?.targetId)}</select>`)}${field("Nama pembeli wholesale", `<input name="buyerName" maxlength="150" value="${e(o?.buyer?.name || "")}">`)}${field("Telepon pembeli", `<input name="phone" maxlength="50" value="${e(o?.buyer?.phone || "")}">`)}${field("Alamat pembeli", `<textarea name="address" maxlength="500">${e(o?.buyer?.address || "")}</textarea>`)}${field("Pengantar / kendaraan", `<input name="carrier" maxlength="150" value="${e(o?.carrier || "")}" required>`)}${field("Pilihan pembayaran", `<select name="paymentMode"><option value="pending" ${o?.paymentMode !== "paid" ? "selected" : ""}>Pending payment</option><option value="paid" ${o?.paymentMode === "paid" ? "selected" : ""}>Langsung bayar saat invoice terbit</option></select>`)}</div><h3>Harga untuk transaksi ini</h3><div data-outbound-rates></div><button type="button" data-rate-add>+ Produk</button>${field("Catatan", `<textarea name="note" maxlength="500">${e(o?.note || "")}</textarea>`)}<p class="muted">Jumlah dan berat berasal dari barcode yang disiapkan gudang. Harga dikunci saat invoice diterbitkan. Pembayaran langsung dikonfirmasi setelah total diketahui.</p>`,
    "Simpan dokumen",
  );
  d.classList.add("supply-modal");
  const f = d.querySelector("form"),
    list = d.querySelector("[data-outbound-rates]");
  const kind = () => {
    const wholesale = f.elements.kind.value === "wholesale";
    f.elements.targetId.closest("label").hidden = wholesale;
    f.elements.targetId.required = !wholesale;
    for (const k of ["buyerName", "phone", "address"])
      f.elements[k].closest("label").hidden = !wholesale;
    f.elements.buyerName.required = wholesale;
  };
  f.elements.kind.onchange = kind;
  kind();
  const draw = () => {
    list.innerHTML = rows
      .map(
        (r, i) =>
          `<div class="form-grid" data-rate-row="${i}">${field("Produk", `<select data-rate-product>${options(products, r.productId)}</select>`)}${field("Satuan harga", `<select data-rate-unit><option value="kg" ${r.unit === "kg" ? "selected" : ""}>Per kg</option><option value="butir" ${r.unit === "butir" ? "selected" : ""}>Per butir</option></select>`)}${field("Harga khusus (Rp)", `<input data-rate-price type="number" min="0.01" step="0.01" value="${e(r.price)}" required>`)}${rows.length > 1 ? `<button type="button" data-rate-remove="${i}">Hapus produk</button>` : ""}</div>`,
      )
      .join("");
    list.querySelectorAll("[data-rate-row]").forEach((el) => {
      const r = rows[Number(el.dataset.rateRow)];
      for (const [attr, key] of [
        ["product", "productId"],
        ["unit", "unit"],
        ["price", "price"],
      ])
        el.querySelector(`[data-rate-${attr}]`).onchange = (ev) =>
          (r[key] = ev.target.value);
    });
    list.querySelectorAll("[data-rate-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          rows.splice(Number(b.dataset.rateRemove), 1);
          draw();
        }),
    );
  };
  d.querySelector("[data-rate-add]").onclick = () => {
    if (rows.length < 50) {
      rows.push({
        productId:
          products.find((p) => !rows.some((r) => r.productId === p.id))?.id ||
          products[0].id,
        unit: "kg",
        price: "",
      });
      draw();
    }
  };
  draw();
  submitSession(
    d,
    ctx,
    key,
    "outbound_save",
    (f) => ({
      orderId: key,
      expectedRevision: o?.revision,
      storeId: o?.sourceId || wh.id,
      kind: f.elements.kind.value,
      targetId: f.elements.kind.value === "transfer" ? f.elements.targetId.value : null,
      buyer: {
        name: f.elements.buyerName.value.trim(),
        phone: f.elements.phone.value.trim(),
        address: f.elements.address.value.trim(),
      },
      carrier: f.elements.carrier.value.trim(),
      note: f.elements.note.value.trim(),
      paymentMode: f.elements.paymentMode.value,
      rates: rows.map((r) => ({ ...r, price: Number(r.price) })),
    }),
    () => openOutbound(ctx.getState(), key, ctx),
  );
  bindRecovery(d, ctx, key, () => openOutbound(ctx.getState(), key, ctx));
  return d;
}
function paymentFields(amount) {
  return `<div class="form-grid">${field("Tanggal pembayaran", `<input name="date" type="date" value="${today()}" max="${today()}" required>`)}${field("Metode", '<select name="method"><option value="transfer">Transfer bank</option><option value="cash">Tunai</option><option value="other">Lainnya</option></select>')}${field("Referensi / penerima", '<input name="reference" minlength="3" maxlength="200" required>')}</div>${amount ? field("Jumlah pembayaran (Rp)", `<input name="amount" type="number" min="0.01" max="${amount}" step="0.01" value="${amount}" required>`) : ""}<label class="supply-check"><input type="checkbox" name="paymentConfirmed" required> Uang benar-benar sudah diterima.</label>`;
}
export function openOutbound(s, oid, ctx) {
  let o = s.outboundOrders?.find((x) => x.id === oid);
  if (!o) return;
  const bo = backOffice(s, ctx.workspace),
    key = o.id;
  const d = sessionDialog(
      ctx,
      o.invoiceNo || "Penyiapan pengiriman",
      "<div data-outbound-detail></div>",
    ),
    body = d.querySelector("[data-outbound-detail]");
  let working = false;
  const reopen = () => openOutbound(ctx.getState(), oid, ctx),
    recovery = bindRecovery(d, ctx, key, reopen);
  const perform = async (action, extra = {}) => {
    if (working) return;
    working = true;
    try {
      await saveWorkflow(ctx.getState(), key, ctx, action, {
        id: id(),
        orderId: key,
        expectedRevision: o.revision,
        ...extra,
      });
      o = ctx.getState().outboundOrders.find((x) => x.id === oid);
      d.dataset.dirty = "false";
      d.querySelector("#form-error").textContent = "";
      draw();
    } catch (err) {
      d.querySelector("#form-error").textContent = err.message;
      recovery();
    } finally {
      working = false;
      body.querySelector("[data-outbound-code]")?.focus();
    }
  };
  const confirmForm = (action, title, html, extras) => {
    d.close();
    const next = ctx.modal(title, html, "Simpan");
    next.classList.add("supply-modal");
    submitSession(
      next,
      ctx,
      key,
      action,
      (f) => ({ orderId: key, expectedRevision: o.revision, ...extras(f) }),
      reopen,
    );
    bindRecovery(next, ctx, key, reopen);
  };
  const draw = () => {
    const balance = outboundBalance(o),
      packing = !bo && o.status === "packing";
    body.innerHTML = `<p><b>${o.kind === "transfer" ? "Transfer toko" : "Penjualan wholesale"}</b> · ${e(o.kind === "transfer" ? name(ctx.getState(), "locations", o.targetId) : o.buyer?.name)}</p><p>${e(o.carrier)} · ${e(outboundStatuses[o.status])}</p>${bo ? `<div class="notice">${e(balance.label)}${o.total != null ? ` · Total ${money(balance.total)} · Dibayar ${money(balance.paid)} · Sisa ${money(balance.remaining)}` : ""}</div>` : ""}${table(
      ["Produk", ...(bo ? ["Harga khusus"] : [])],
      o.rates.map(
        (r) =>
          `<tr><td>${e(name(ctx.getState(), "products", r.productId))}</td>${bo ? `<td>${money(r.price)} / ${e(r.unit)}</td>` : ""}</tr>`,
      ),
    )}<p><b>${o.items.length} butir · ${num(o.items.reduce((n, x) => n + x.grams, 0) / 1000)} kg tersimpan</b></p>${packing ? '<div class="supply-scan"><input data-outbound-code aria-label="Scan barcode pengiriman" placeholder="Scan barcode barang yang disiapkan" maxlength="26" autocomplete="off"><button type="button" data-outbound-add>Simpan scan</button></div><p class="muted">Scan tersimpan otomatis. Dokumen ini dapat ditutup dan dilanjutkan dari daftar pengiriman.</p>' : ""}<div class="toolbar">${bo && ["packing", "ready"].includes(o.status) ? '<button type="button" data-outbound-edit>Edit dokumen & harga</button>' : ""}${bo && o.status === "ready" ? '<button type="button" data-outbound-repack>Buka ulang penyiapan</button><button type="button" class="primary" data-outbound-issue>Terbitkan invoice & surat jalan</button>' : ""}${packing ? '<button type="button" class="primary" data-outbound-ready>Selesai scan penyiapan</button>' : ""}${!bo && o.status === "approved" ? '<button type="button" class="primary" data-outbound-dispatch>Konfirmasi barang dikirim</button>' : ""}${bo && o.invoiceNo && balance.remaining > 0 && o.status !== "cancelled" ? '<button type="button" data-outbound-pay>Catat pembayaran</button>' : ""}${bo && ["packing", "ready", "approved"].includes(o.status) && !o.paid ? '<button type="button" data-outbound-cancel>Batalkan dokumen</button>' : ""}${o.invoiceNo ? `${bo ? '<button type="button" data-outbound-print="invoice">Cetak invoice</button>' : ""}<button type="button" data-outbound-print="delivery">Cetak surat jalan</button>` : ""}</div><details open><summary>Barcode dalam dokumen</summary>${table(
      ["Barcode", "Produk", "Berat", ...(packing ? ["Aksi"] : [])],
      o.items.map(
        (i) =>
          `<tr><td><code>${e(i.barcode)}</code></td><td>${e(name(ctx.getState(), "products", i.productId))}</td><td>${num(i.grams / 1000)} kg</td>${packing ? `<td><button type="button" data-outbound-remove="${e(i.barcode)}">Hapus</button></td>` : ""}</tr>`,
      ),
    )}</details>${
      bo && o.payments?.length
        ? `<h3>Riwayat pembayaran</h3>${table(
            ["Tanggal", "Jumlah", "Metode / referensi", "Dicatat oleh"],
            o.payments.map(
              (p) =>
                `<tr><td>${e(p.date)}</td><td>${money(p.amount)}</td><td>${e(p.method)} · ${e(p.reference)}</td><td>${e(p.actor)}</td></tr>`,
            ),
          )}`
        : ""
    }<p>${e(o.note)}</p>`;
    const input = body.querySelector("[data-outbound-code]");
    const scan = () => {
      if (input.value.trim()) perform("outbound_scan", { barcode: input.value.trim() });
    };
    input?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        scan();
      }
    });
    body.querySelector("[data-outbound-add]")?.addEventListener("click", scan);
    body
      .querySelectorAll("[data-outbound-remove]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            perform("outbound_scan_remove", { barcode: b.dataset.outboundRemove })),
      );
    body.querySelector("[data-outbound-ready]")?.addEventListener("click", () => {
      if (confirm("Semua barcode untuk pengiriman ini sudah lengkap?"))
        perform("outbound_ready");
    });
    body.querySelector("[data-outbound-dispatch]")?.addEventListener("click", () => {
      if (
        confirm(
          "Barang sesuai dokumen dan sudah diserahkan untuk dikirim? Stok gudang akan berkurang.",
        )
      )
        perform("outbound_dispatch", { confirmed: true });
    });
    body.querySelector("[data-outbound-edit]")?.addEventListener("click", () => {
      d.close();
      openOutboundForm(ctx.getState(), o.sourceId, ctx, o);
    });
    body
      .querySelector("[data-outbound-repack]")
      ?.addEventListener("click", () => perform("outbound_repack"));
    body.querySelector("[data-outbound-issue]")?.addEventListener("click", () =>
      confirmForm(
        "outbound_issue",
        "Terbitkan dokumen",
        `<p>Total ${money(o.total)}. Harga dan daftar barcode akan dikunci.</p>${o.paymentMode === "paid" ? paymentFields() : "<p>Pembayaran: Pending payment. Pelunasan dicatat terpisah setelah uang diterima.</p>"}`,
        (f) =>
          o.paymentMode === "paid"
            ? {
                date: f.elements.date.value,
                method: f.elements.method.value,
                reference: f.elements.reference.value,
                paymentConfirmed: f.elements.paymentConfirmed.checked,
              }
            : {},
      ),
    );
    body.querySelector("[data-outbound-pay]")?.addEventListener("click", () =>
      confirmForm(
        "outbound_payment",
        "Catat pembayaran invoice",
        paymentFields(balance.remaining),
        (f) => ({
          amount: Number(f.elements.amount.value),
          date: f.elements.date.value,
          method: f.elements.method.value,
          reference: f.elements.reference.value,
          paymentConfirmed: f.elements.paymentConfirmed.checked,
        }),
      ),
    );
    body
      .querySelector("[data-outbound-cancel]")
      ?.addEventListener("click", () =>
        confirmForm(
          "outbound_cancel",
          "Batalkan dokumen",
          field(
            "Alasan pembatalan",
            '<textarea name="reason" minlength="5" maxlength="500" required></textarea>',
          ),
          (f) => ({ reason: f.elements.reason.value.trim() }),
        ),
      );
    body
      .querySelectorAll("[data-outbound-print]")
      .forEach((b) => (b.onclick = () => ctx.printOutbound(o, b.dataset.outboundPrint)));
  };
  draw();
  d.addEventListener("close", () => ctx.render());
  body.querySelector("[data-outbound-code]")?.focus();
  return d;
}
