import { escape as e, id, num, money, today } from "./core.mjs";
import {
  backOffice,
  outboundStatuses,
  outboundBalance,
  saveWorkflow,
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
export function outboundPage(s, store, space) {
  const bo = backOffice(s, space),
    orders = (s.outboundOrders || []).filter((o) => bo || o.sourceId === store);
  return `<section class="supply-workspace"><div class="supply-hero"><div><span class="supply-eyebrow">DISTRIBUSI GUDANG</span><h2>Transfer toko & invoice wholesale</h2><p>${bo ? "Buat dokumen dan harga khusus, tunggu scan gudang, lalu terbitkan." : "Scan barang sesuai dokumen Back Office. Setiap barcode hanya boleh masuk satu pengiriman aktif."}</p></div><div class="toolbar"><button type="button" data-supply-refresh>Perbarui</button>${bo ? '<button type="button" class="primary" data-outbound-new>+ Transaksi baru</button>' : ""}</div></div><section class="panel">${table(
    [
      "Dokumen",
      "Jenis / tujuan",
      "Barang",
      "Pengiriman",
      ...(bo ? ["Pembayaran"] : []),
      "Aksi",
    ],
    orders.map((o) => {
      const balance = outboundBalance(o),
        transfer = s.transfers?.find((t) => t.id === o.id);
      return `<tr><td><b>${e(o.invoiceNo || "Belum terbit")}</b><small>${e(o.deliveryNo || o.id.slice(0, 8))}</small></td><td>${o.kind === "transfer" ? "Transfer toko" : "Wholesale"}<small>${e(o.kind === "transfer" ? name(s, "locations", o.targetId) : o.buyer?.name)}</small></td><td>${o.items.length} butir / ${num(o.items.reduce((v, i) => v + i.grams, 0) / 1000)} kg</td><td>${e(transfer?.status === "received" ? "Diterima toko" : outboundStatuses[o.status])}</td>${bo ? `<td>${o.total == null ? "Menunggu scan" : money(balance.total)}<small>${e(balance.label)}</small>${o.invoiceNo ? `<small>Sisa ${money(balance.remaining)}</small>` : ""}</td>` : ""}<td><button type="button" data-outbound-open="${e(o.id)}">Buka</button></td></tr>`;
    }),
  )}</section></section>`;
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
