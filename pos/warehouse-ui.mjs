import { confirmAction } from "../shared/confirmation.mjs";
import { depositButtons } from "./cash-deposits-ui.mjs";
import { transactions } from "./reports.mjs";
import { branchPricingPage, bindBranchPricing } from "./branch-prices-ui.mjs";
import { locationFruitStock } from "./dashboard-data.mjs";
import { prepareBarcodeInput, readyBarcodeInput } from "./barcode-scanner.mjs";
import { workflowReady, backOffice } from "./warehouse-workflow.mjs";
import { receivingPage, openReceivingSession } from "./receiving-session-ui.mjs";
import { outboundPage, bindOutboundPage, openOutboundForm } from "./outbound-ui.mjs";
import { escape as e, id, today, num, money } from "./core.mjs";
import {
  warehouseEnabled,
  warehouseId,
  location,
  transferStatus,
  scanForDispatch,
  scanForReceipt,
  transferPreview,
  transferDocument,
} from "./warehouse-flow.mjs";
import { notePaymentCell, openSupplierNote } from "./supplier-notes-ui.mjs";
import { openWeighingReceipt } from "./receipt-weighing.mjs";
const field = (label, html) => `<label class="field">${e(label)}${html}</label>`;
const name = (s, key, v) => s[key]?.find((x) => x.id === v)?.name || "—";
const opts = (xs, value = "") =>
  xs
    .map(
      (x) =>
        `<option value="${e(x.id)}" ${x.id === value ? "selected" : ""}>${e(x.name)}</option>`,
    )
    .join("");
const table = (headers, rows) =>
  `<div class="table-wrap"><table><thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}" class="empty">Belum ada data.</td></tr>`}</tbody></table></div>`;
const stat = (label, value, hint = "") =>
  `<article class="supply-stat"><span>${e(label)}</span><strong>${e(value)}</strong><small>${e(hint)}</small></article>`;
const action = (view, label, description) =>
  `<button type="button" class="supply-task" data-view="${view}"><span>${e(label)}</span><small>${e(description)}</small><svg class="supply-task-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></button>`;
const badge = (t) =>
  `<span class="supply-badge ${e(t.status)}">${e(transferStatus[t.status])}</span>`;
const blocker = (s) =>
  s.stockDemo
    ? '<div class="notice">Mode demo POS belum mendukung pengiriman gudang. Keluar dari demo untuk operasional gudang.</div>'
    : s.warehouseVersion < 107
      ? '<div class="notice">Pembaruan gudang belum terpasang. Admin perlu memasang SQL 107 sebelum fitur ini digunakan.</div>'
      : "";
function locationStockTable(s) {
  const weight = (kg, pieces) =>
    `<td>${num(kg)} kg<small>${num(pieces)} butir</small></td>`;
  const rows = locationFruitStock(s)
    .filter(
      (r) =>
        !(s.branchStockVersion >= 132) ||
        r.location.locationType !== "warehouse" ||
        r.readyPieces ||
        r.rejectPieces ||
        r.soldPieces,
    )
    .map(
      (r) => `<tr>
    <th scope="row"><b>${e(r.location.name)}</b><small>${r.location.locationType === "warehouse" ? "Gudang pusat" : "Toko"}</small></th>
    ${weight(r.readyKg, r.readyPieces)}${weight(r.soldKg, r.soldPieces)}${weight(r.rejectKg, r.rejectPieces)}
    <td>${num(r.durpas500)} pcs</td><td>${num(r.durpas1000)} pcs</td><td>${num(r.coral)} kg</td><td>${num(r.skinKg)} kg</td>
  </tr>`,
    );
  return `<section class="panel location-stock"><h3 id="location-stock-heading">Stok buah per lokasi</h3>
    <div class="table-wrap"><table aria-labelledby="location-stock-heading" aria-describedby="location-stock-help">
    <colgroup span="4"></colgroup><colgroup span="4"></colgroup>
    <thead><tr><th rowspan="2" scope="col">Lokasi</th><th rowspan="2" scope="col">Siap</th><th rowspan="2" scope="col">Terjual</th><th rowspan="2" scope="col">Reject belum diolah</th><th colspan="4" scope="colgroup">Hasil pengolahan reject</th></tr>
    <tr><th scope="col">Durpas 500 g</th><th scope="col">Durpas 1 kg</th><th scope="col">Coral</th><th scope="col">Kulit terbuang (est.)</th></tr></thead>
    <tbody>${rows.join("") || '<tr><td colspan="8" class="empty">Belum ada lokasi.</td></tr>'}</tbody></table></div>
    <p id="location-stock-help" class="muted">Siap dan reject belum diolah menunjukkan stok saat ini. Terjual dan hasil pengolahan adalah total sejak pencatatan di tiap lokasi. Estimasi kulit mencakup kulit dan sisa proses, dihitung dari berat buah dikurangi hasil Durpas dan Coral.</p></section>`;
}
function storeStockActions(access) {
  return [
    access?.sell &&
      action(
        "orders",
        "Penjualan toko",
        "Scan barang siap jual dari stok toko, lalu proses pembayaran.",
      ),
    access?.waste &&
      action(
        "waste",
        "Catat atau olah reject",
        "Pilih batch toko dan scan buah yang tidak layak. Olah sekarang atau simpan untuk diolah nanti.",
      ),
  ]
    .filter(Boolean)
    .join("");
}

function supplyTasks(s, space) {
  const access = s.access || {};
  if (s.branchStockVersion >= 132 && space === "store") {
    return [
      access.stock &&
        action(
          "supplierNotes",
          "Terima dari supplier",
          "Pilih nota untuk cabang ini, lalu timbang dan scan barang.",
        ),
      access.stock &&
        action(
          "transfers",
          "Kirim ke cabang",
          "Pilih cabang tujuan dan siapkan surat jalan.",
        ),
      access.receive &&
        action(
          "receiving",
          "Terima dari cabang",
          "Cocokkan jumlah fisik dengan surat jalan.",
        ),
      storeStockActions(access),
      access.kitchen && action("kitchen", "Kitchen", "Pesanan yang perlu disiapkan."),
      access.serve && action("service", "Pelayanan meja", "Antar pesanan yang siap."),
      access.cut &&
        action("cutting", "Pemeriksaan buah", "Periksa buah untuk pelanggan."),
    ]
      .filter(Boolean)
      .join("");
  }
  if (space === "backoffice") {
    return [
      action(
        "supplierNotes",
        "Buka nota supplier",
        s.branchStockVersion >= 132
          ? "Pilih cabang penerima, lalu isi barang dan ongkir."
          : "Isi barang, modal dan ongkir untuk penerimaan gudang.",
      ),
      (!(s.branchStockVersion >= 132) || s.outboundOrders?.length > 0) &&
        action(
          "transfers",
          s.branchStockVersion >= 132
            ? "Dokumen distribusi lama"
            : "Transfer toko & wholesale",
          "Kelola dokumen pengiriman ke toko dan penjualan grosir.",
        ),
      workflowReady(s)
        ? action(
            "pricing",
            "Harga jual cabang",
            "Pilih toko dan atur harga jual pelanggan.",
          )
        : action("pricing", "Harga transfer", "Atur harga distribusi ke toko."),
      action("products", "Master barang", "Kelola produk, varian dan harga dasar."),
      (access.reports || access.trace) &&
        action(
          "reports",
          "Laporan batch supplier",
          "Telusuri posisi stok dan hasil olahan.",
        ),
    ]
      .filter(Boolean)
      .join("");
  }
  if (space === "warehouse" && s.branchStockVersion >= 132) {
    return [
      access.stock &&
        action(
          "stock",
          "Pindahkan sisa stok ke cabang",
          "Pilih stok lama yang masih ada, lalu terbitkan surat jalan.",
        ),
      access.stock &&
        s.receiptPlans?.some(
          (p) => p.storeId === warehouseId(s) && p.receiving?.status !== "completed",
        ) &&
        action(
          "supplierNotes",
          "Selesaikan penerimaan lama",
          "Periksa nota gudang yang masih terbuka.",
        ),
      (access.dispatch || access.backoffice) &&
        s.outboundOrders?.length > 0 &&
        action("transfers", "Dokumen distribusi lama", "Buka dokumen yang sudah dibuat."),
    ]
      .filter(Boolean)
      .join("");
  }
  if (space === "warehouse") {
    return [
      (access.stock || access.backoffice) &&
        action(
          "supplierNotes",
          "Terima barang supplier",
          "Buka nota admin, timbang dan scan barang yang diterima.",
        ),
      (access.dispatch || access.backoffice) &&
        action(
          "transfers",
          "Siapkan transfer & wholesale",
          "Scan barang sesuai dokumen pengiriman.",
        ),
      access.waste &&
        action(
          "waste",
          "Catat atau olah reject gudang",
          "Pilih batch gudang dan catat buah yang perlu dipisahkan.",
        ),
      (access.stock || access.produce || access.receive) &&
        action("stock", "Stok gudang", "Periksa saldo per produk dan batch."),
    ]
      .filter(Boolean)
      .join("");
  }
  return [
    access.receive &&
      action(
        "receiving",
        "Terima kiriman",
        "Buka surat jalan, scan kiriman dan konfirmasi barang masuk toko.",
      ),
    storeStockActions(access),
    access.serve && action("service", "Waitress", "Meja, pesanan siap dan pengantaran."),
    access.kitchen && action("kitchen", "Kitchen", "Proses menu setelah pembayaran."),
    access.cut &&
      action(
        "cutting",
        "Tukang potong",
        "Scan buah dan catat pemeriksaan untuk meja pelanggan.",
      ),
  ]
    .filter(Boolean)
    .join("");
}

function storeReceiptStats(s, store, pending) {
  const stock = locationFruitStock(s).find((row) => row.location.id === store);
  return (
    stat(
      "Kiriman dalam perjalanan",
      String(pending.filter((t) => t.targetId === store).length),
      "Menunggu penerimaan lengkap",
    ) +
    stat(
      "Buah siap jual",
      num(stock?.readyKg || 0) + " kg",
      num(stock?.readyPieces || 0) + " butir di toko",
    ) +
    stat(
      "Buah reject",
      num(stock?.rejectKg || 0) + " kg",
      num(stock?.rejectPieces || 0) + " butir menunggu penanganan",
    )
  );
}

export function supplyHome(s, store, space) {
  const ts = (s.transfers || []).filter(
      (t) => space === "backoffice" || t.sourceId === store || t.targetId === store,
    ),
    active = ts.filter((t) => t.status === "in_transit"),
    due = ts
      .filter((t) => t.status !== "cancelled")
      .reduce((n, t) => n + t.total - t.paid, 0);
  const title =
    space === "backoffice"
      ? "Back office"
      : space === "warehouse"
        ? s.branchStockVersion >= 132
          ? "Gudang lama"
          : "Gudang pusat"
        : "Operasional toko";
  const operational = space === "store" && !s.access?.receive && !s.access?.backoffice;
  const orders = (s.orders || []).filter(
    (o) =>
      o.store_id === store &&
      o.payment_status === "paid" &&
      ["queued", "preparing", "ready"].includes(o.status),
  );
  const stats = operational
    ? s.access?.cut
      ? stat(
          "Buah tersedia",
          num(
            (s.fruitUnits || []).filter(
              (u) => u.storeId === store && u.status === "available",
            ).length,
          ) + " butir",
          "Barcode siap diperiksa",
        ) +
        stat(
          "Reject di toko",
          num(
            s.lots
              .filter((l) => l.storeId === store && l.quality === "reject")
              .reduce((n, l) => n + l.kg, 0),
          ) + " kg",
          "Menunggu penanganan",
        ) +
        stat(
          "Pemeriksaan buah",
          String((s.cutChecks || []).filter((c) => c.storeId === store).length),
          "7 hari terakhir",
        )
      : stat("Pesanan aktif", String(orders.length), "Pesanan yang sudah dibayar") +
        stat(
          "Sedang dibuat",
          String(orders.filter((o) => o.status === "preparing").length),
          "Diproses kitchen",
        ) +
        stat(
          "Siap diantar",
          String(orders.filter((o) => o.status === "ready").length),
          "Menunggu pelayanan meja",
        )
    : space === "store"
      ? storeReceiptStats(s, store, active)
      : stat("Dalam perjalanan", String(active.length), "Menunggu penerimaan lengkap") +
        stat(
          "Buah di lokasi",
          num(
            s.lots
              .filter((l) => space === "backoffice" || l.storeId === store)
              .reduce((n, l) => n + l.kg, 0),
          ) + " kg",
          "Siap pakai dan reject terpisah di stok",
        ) +
        (!workflowReady(s) || space === "backoffice"
          ? stat("Tagihan tersisa", money(due), "Invoice aktif dikurangi pembayaran")
          : stat(
              "Penyiapan barang",
              String(
                (s.outboundOrders || []).filter((o) => o.status === "packing").length,
              ),
              "Dokumen menunggu scan",
            ));
  if (s.pettyCashVersion >= 130) {
    const central = space === "backoffice";
    const branchIds = new Set(
      s.stores
        .filter((b) => b.locationType === "store" && (central || b.id === store))
        .map((b) => b.id),
    );
    const sales =
      central || (space === "store" && (s.access?.reports || s.access?.sell))
        ? transactions(s).filter((t) => t.date === today() && branchIds.has(t.storeId))
        : null;
    const revenue = sales?.reduce((a, t) => a + t.total, 0) || 0;
    const posStats = sales
      ? stat(
          "Omzet hari ini",
          money(revenue),
          central ? "Seluruh toko" : location(s, store)?.name || "Toko",
        ) +
        stat("Transaksi lunas", num(sales.length), "Hari ini") +
        stat(
          "Rata-rata per struk",
          money(sales.length ? revenue / sales.length : 0),
          "Hari ini",
        )
      : "";
    const funds = central
      ? stat("Saldo PT Retail", money(s.retailBalance), "Dari setoran toko")
      : space === "store" && s.access?.sell
        ? stat(
            "Saldo petty cash",
            money(s.pettyBalances?.[store] || 0),
            "Dana pengeluaran toko",
          )
        : "";
    const deposits =
      !central && sales && s.cashDepositSummary?.find((x) => x.storeId === store);
    const extra =
      central && s.access?.finance
        ? action(
            "retailFunds",
            "Keuangan PT Retail",
            `${(s.pettyRequests || []).filter((r) => r.status === "pending").length} pengajuan petty cash menunggu.`,
          )
        : "";
    return `<section class="supply-workspace">${blocker(s)}<div class="header-row"><h2>${central ? "Dashboard Back Office" : space === "warehouse" ? "Dashboard gudang" : e(location(s, store)?.name || "Dashboard toko")}</h2><button data-supply-refresh>Perbarui</button></div><div class="supply-stats">${posStats}${funds}${deposits ? stat("Tunai belum disetor", money(deposits.pending), "Akumulasi cabang") : ""}${!sales ? stats : ""}</div><div class="supply-task-grid">${supplyTasks(s, space)}${extra}</div>${space === "store" && s.access?.sell ? depositButtons(s, store) : ""}${central ? locationStockTable(s) : ""}${!operational ? `<section class="panel"><h3>Kiriman yang belum diterima</h3>${transferTable(active.slice(0, 8), central)}</section>` : ""}</section>`;
  }
  const desc =
    space === "backoffice"
      ? "Buka nota supplier, siapkan dokumen transfer atau wholesale, dan atur harga jual tiap cabang."
      : space === "warehouse"
        ? "Terima barang berdasarkan nota supplier. Siapkan transfer toko atau wholesale, dan catat reject gudang."
        : "Setelah kiriman diterima, jual barang yang layak. Catat reject dari batch toko saat ditemukan.";
  return `<section class="supply-workspace">${blocker(s)}<div class="supply-hero"><div><span class="supply-eyebrow">MANIAC DUREN / ${e(space === "backoffice" ? "ADMINISTRASI" : space === "warehouse" ? "DISTRIBUSI" : "PELAYANAN")}</span><h2>${title}</h2><p>${desc}</p></div><button type="button" data-supply-refresh>Perbarui</button></div><div class="supply-task-grid">${supplyTasks(s, space)}</div><div class="supply-stats">${stats}</div>${
    space === "backoffice" ? locationStockTable(s) : ""
  }${operational ? "" : `<section class="panel"><h3>Kiriman yang belum diterima</h3>${transferTable(active.slice(0, 8), !workflowReady(s) || space === "backoffice")}</section>`}</section>`;
}
function transferTable(rows, finance = true) {
  return table(
    [
      "Nomor dokumen",
      "Tujuan / kiriman",
      "Status",
      ...(finance ? ["Tagihan"] : []),
      "Aksi",
    ],
    rows.map(
      (t) =>
        `<tr><td><b>${e(t.deliveryNo)}</b><small>${e(t.invoiceNo)}</small></td><td>${e(t.destination.name)}<small>${t.items.length} buah · ${t.lines.length} baris batch/produk</small></td><td>${badge(t)}<small>${t.invoiceNo === null ? "Mutasi antarcabang" : `${t.items.filter((i) => i.scannedAt).length}/${t.items.length} barcode diperiksa`}</small></td>${finance ? `<td>${money(t.total)}<small>Sisa ${money(t.total - t.paid)}</small></td>` : ""}<td><button type="button" data-transfer="${e(t.id)}">Buka</button></td></tr>`,
    ),
  );
}
export function transfersPage(s, store, incoming = false, space) {
  const branch = s.branchStockVersion >= 132 && (incoming || space === "store");
  if (!branch && workflowReady(s) && !incoming) return outboundPage(s, store, space);
  const canSend =
    warehouseEnabled(s) &&
    !incoming &&
    (branch
      ? s.access?.stock && location(s, store)?.locationType === "store"
      : s.access?.dispatch && location(s, store)?.locationType === "warehouse");
  const afterReceipt =
    incoming &&
    (s.transfers || []).some((t) => t.targetId === store && t.status === "received")
      ? storeStockActions(s.access)
      : "";
  return `<section class="supply-workspace">${blocker(s)}<div class="supply-hero"><div><span class="supply-eyebrow">${branch ? "MUTASI ANTARCABANG" : incoming ? "PENERIMAAN TOKO" : "DISTRIBUSI GUDANG"}</span><h2>${incoming ? "Periksa kiriman masuk" : branch ? "Kirim ke cabang" : "Pengiriman & tagihan"}</h2><p>${branch ? (incoming ? "Periksa jumlah barang per batch sebelum mengonfirmasi penerimaan." : "Pindahkan barang dengan surat jalan dari cabang aktif.") : incoming ? "Scan barcode buah dan cocokkan jumlah barang nonbuah per batch dengan surat jalan." : "Setiap kiriman memiliki invoice, surat jalan, dan jejak barcode."}</p></div><div class="toolbar"><button type="button" data-supply-refresh>Perbarui</button>${canSend ? '<button type="button" class="primary" data-transfer-new>+ Buat pengiriman</button>' : ""}</div></div><div class="supply-filters"><input type="search" data-transfer-search placeholder="${branch ? "Cari surat jalan atau cabang…" : "Cari nomor surat jalan, invoice, atau toko…"}" aria-label="Cari kiriman"><select data-transfer-filter aria-label="Status kiriman"><option value="">Semua status</option>${Object.entries(
    transferStatus,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${incoming && k === "in_transit" ? "selected" : ""}>${v}</option>`,
    )
    .join(
      "",
    )}</select></div><section class="panel" data-transfer-list></section>${afterReceipt ? `<section><h3>Setelah barang diterima</h3><div class="supply-task-grid">${afterReceipt}</div></section>` : ""}</section>`;
}
export function pricingPage(s, store) {
  if (workflowReady(s) || s.branchPricingVersion >= 123)
    return branchPricingPage(s, store);
  return `<section class="supply-workspace">${blocker(s)}<div class="supply-hero"><div><span class="supply-eyebrow">BACK OFFICE</span><h2>Harga transfer ke toko</h2><p>Harga ini terpisah dari modal batch dan harga jual pelanggan. Invoice yang sudah terbit tetap memakai harga saat dikirim.</p></div><button type="button" data-view="products">Master harga jual</button></div><section class="panel">${table(
    ["Produk", "Harga transfer", "Satuan", "Aksi"],
    s.products
      .filter((p) => p.itemType !== "recipe")
      .map((p) => {
        const r = s.transferPrices?.find((x) => x.productId === p.id);
        return `<tr><td><b>${e(p.name)}</b><small>${e(p.sku)}</small></td><td>${r ? money(r.price) : '<span class="error">Belum diatur</span>'}</td><td>${e(r?.unit || p.stockUnit)}</td><td><button type="button" data-transfer-price="${e(p.id)}" ${warehouseEnabled(s) ? "" : "disabled"}>Atur harga</button></td></tr>`;
      }),
  )}</section></section>`;
}
export function supplierNotesPage(s, store, space) {
  if (workflowReady(s)) return receivingPage(s, store, space);
  const wh = warehouseId(s),
    plans = (s.receiptPlans || []).filter(
      (p) =>
        p.storeId === (location(s, store)?.locationType === "warehouse" ? store : wh),
    );
  return `<section class="supply-workspace">${blocker(s)}<div class="supply-hero"><div><span class="supply-eyebrow">PENERIMAAN SUPPLIER</span><h2>Nota barang masuk gudang</h2><p>Admin mengisi harga nota dan ongkir. Petugas gudang memilih nota lalu scan seluruh buah.</p></div><div class="toolbar"><button type="button" data-supply-refresh>Perbarui</button>${s.access?.backoffice ? `<button type="button" data-legacy-labels>Registrasi barcode stok lama</button><button type="button" class="primary" data-note-new ${warehouseEnabled(s) ? "" : "disabled"}>+ Nota supplier</button>` : ""}</div></div><section class="panel">${table(
    [
      "Nota / supplier",
      "Tanggal",
      "Pembayaran nota",
      "Pembayaran ongkir",
      "Penerimaan",
      "Aksi",
    ],
    plans.map(
      (p) =>
        `<tr><td><b>${e(p.invoiceNo)}</b><small>${e(name(s, "suppliers", p.supplierId))}</small></td><td>${e(p.date)}</td><td>${notePaymentCell(p, "invoice")}</td><td>${notePaymentCell(p, "shipping")}</td><td>${p.receivedId ? "Sudah diterima" : "Menunggu scan gudang"}</td><td><button type="button" data-note-open="${e(p.id)}">Buka nota</button>${!p.receivedId ? `<button type="button" data-note-receive="${e(p.id)}" ${warehouseEnabled(s) ? "" : "disabled"}>Scan penerimaan</button>` : ""}</td></tr>`,
    ),
  )}</section></section>`;
}
function savingForm(d, callback) {
  let saving = false;
  const f = d.querySelector("form");
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if (saving || !f.reportValidity()) return;
    saving = true;
    const b = f.querySelector("[type=submit]");
    b.disabled = true;
    try {
      await callback(f);
    } catch (err) {
      d.querySelector("#form-error").textContent = err.message;
    } finally {
      saving = false;
      if (b.isConnected) b.disabled = false;
    }
  };
}
function safeContext(s, ctx) {
  if (!warehouseEnabled(s)) {
    ctx.toast(
      s.stockDemo
        ? "Keluar dari mode demo untuk operasional gudang."
        : "Pembaruan database gudang 107 belum terpasang.",
    );
    return false;
  }
  return true;
}
export function openDispatch(s, store, ctx) {
  if (!safeContext(s, ctx)) return;
  const branch = s.branchStockVersion >= 132;
  const source = location(s, store);
  if (
    !source ||
    (branch
      ? !["store", "warehouse"].includes(source.locationType)
      : source.locationType !== "warehouse")
  ) {
    ctx.toast(
      branch
        ? "Pilih cabang asal terlebih dahulu."
        : "Pilih gudang pusat sebagai lokasi aktif.",
    );
    return;
  }
  const targets = (s.locations || s.stores).filter(
      (x) => x.locationType === "store" && x.id !== store,
    ),
    codes = [],
    units = [];
  const d = ctx.modal(
    "Buat pengiriman toko",
    `<div class="supply-step"><b>1</b><span>Pilih tujuan dan pengantar</span></div><div class="form-grid">${field("Toko tujuan", `<select name="toStoreId" required><option value="">Pilih toko</option>${opts(targets)}</select>`)}${field("Pengantar / kendaraan", '<input name="carrier" maxlength="150" required placeholder="Nama pengantar, plat kendaraan">')}</div><div class="supply-step"><b>2</b><span>Scan barang yang dikirim</span></div><div class="supply-scan"><input data-dispatch-scan autocomplete="off" spellcheck="false" maxlength="26" placeholder="Scan barcode buah" aria-label="Scan barcode kirim"><button type="button" data-dispatch-add>Tambah barcode</button></div><p data-scan-message role="status"></p><div data-dispatch-codes></div><details><summary>Tambahkan bahan / produk satuan</summary><div class="form-grid">${field(
      "Lot barang",
      `<select data-unit-lot><option value="">Pilih lot</option>${(s.unitLots || [])
        .filter((l) => l.storeId === store && l.qty > 0)
        .map(
          (l) =>
            `<option value="${e(l.id)}">${e(name(s, "products", l.productId))} · ${num(l.qty)} ${e(l.unit)} · ${e(l.id.slice(0, 8))}</option>`,
        )
        .join("")}</select>`,
    )}${field("Jumlah", '<input data-unit-qty type="number" min="0.001" step="any">')}</div><button type="button" data-unit-add>Tambah barang</button></details><div class="supply-step"><b>3</b><span>${branch ? "Periksa barang dan kirim" : "Periksa invoice dan kirim"}</span></div><div data-dispatch-summary></div>${field("Catatan", '<textarea name="note" maxlength="500" rows="2"></textarea>')}<p class="notice">Stok asal berkurang saat dikirim. Stok tujuan bertambah setelah diterima.</p>`,
    branch ? "Terbitkan surat jalan dan kirim" : "Terbitkan invoice & kirim",
  );
  d.classList.add("supply-modal");
  const request = id(),
    input = d.querySelector("[data-dispatch-scan]"),
    message = d.querySelector("[data-scan-message]");
  prepareBarcodeInput(input);
  const draw = () => {
    d.querySelector("[data-dispatch-codes]").innerHTML =
      `<div class="supply-scan-list">${codes
        .map(
          (code, i) =>
            `<div><code>${e(code)}</code><button type="button" data-remove-code="${i}" aria-label="Hapus barcode ${e(code)}">Hapus</button></div>`,
        )
        .reverse()
        .join("")}</div>`;
    const lines = transferPreview(s, codes, units);
    d.querySelector("[data-dispatch-summary]").innerHTML =
      table(
        ["Barang", "Jumlah", ...(branch ? [] : ["Tagihan"]), ""],
        lines.map(
          (x) =>
            `<tr><td>${e(x.productName)}</td><td>${x.kg !== undefined ? num(x.kg) + " kg / " + x.pieces + " butir" : num(x.qty) + " " + e(x.unit)}</td>${branch ? "" : `<td>${money(x.total)}</td>`}<td>${x.kg === undefined ? `<button type="button" data-remove-unit="${e(x.sourceLotId)}">Hapus</button>` : ""}</td></tr>`,
        ),
      ) +
      (branch
        ? ""
        : `<p class="supply-total">Estimasi tagihan <b>${money(lines.reduce((n, l) => n + l.total, 0))}</b></p>`);
    d.querySelector("[type=submit]").disabled = !lines.length;
    d.querySelectorAll("[data-remove-unit]").forEach(
      (b) =>
        (b.onclick = () => {
          units.splice(
            units.findIndex((x) => x.lotId === b.dataset.removeUnit),
            1,
          );
          draw();
        }),
    );
    d.querySelectorAll("[data-remove-code]").forEach(
      (b) =>
        (b.onclick = () => {
          codes.splice(Number(b.dataset.removeCode), 1);
          draw();
        }),
    );
  };
  const scan = () => {
    try {
      const code = input.value.trim();
      scanForDispatch(s, store, code, codes);
      codes.push(code);
      input.value = "";
      message.textContent = `${codes.length} buah tercatat`;
      message.className = "positive";
      draw();
    } catch (err) {
      message.textContent = err.message;
      message.className = "error";
    }
    readyBarcodeInput(input);
  };
  input.onkeydown = (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      scan();
    }
  };
  d.querySelector("[data-dispatch-add]").onclick = scan;
  d.querySelector("[data-unit-add]").onclick = () => {
    try {
      const lotId = d.querySelector("[data-unit-lot]").value,
        qty = Number(d.querySelector("[data-unit-qty]").value),
        l = s.unitLots.find((x) => x.id === lotId);
      if (
        !l ||
        qty <= 0 ||
        qty > l.qty ||
        !Number.isFinite(qty) ||
        (["pcs", "porsi"].includes(l.unit) && !Number.isInteger(qty))
      )
        throw Error("Jumlah bahan tidak valid.");
      transferPreview(s, [], [{ lotId, qty }]);
      const prior = units.find((x) => x.lotId === lotId);
      if (prior) prior.qty = qty;
      else units.push({ lotId, qty });
      draw();
      message.textContent =
        "Jumlah bahan disimpan. Tambahkan lot yang sama untuk mengganti jumlah.";
    } catch (err) {
      message.textContent = err.message;
    }
  };
  savingForm(d, async (f) => {
    if (!codes.length && !units.length) throw Error("Scan barang terlebih dahulu.");
    if (
      !(await confirmAction(
        branch
          ? "Kirim barang pada daftar ini ke cabang tujuan?"
          : "Terbitkan invoice dan surat jalan? Barang yang dipilih akan keluar dari stok gudang.",
      ))
    )
      return;
    await ctx.mutate(
      "transfer_dispatch",
      {
        id: request,
        storeId: store,
        toStoreId: f.elements.toStoreId.value,
        carrier: f.elements.carrier.value.trim(),
        note: f.elements.note.value.trim(),
        barcodes: [...codes],
        units: structuredClone(units),
      },
      { throwOnError: true },
    );
    d.close();
    ctx.render();
    ctx.toast(
      branch
        ? "Mutasi tercatat. Surat jalan siap dicetak."
        : "Kiriman diterbitkan. Buka detail untuk cetak invoice dan surat jalan.",
    );
  });
  draw();
  input.focus();
  return d;
}
export function openWarehouseReceipt(s, store, ctx) {
  if (!safeContext(s, ctx)) return;
  if (s.supplierStockVersion >= 122 && backOffice(s, ctx.workspace))
    return noteDialog(s, ctx);
  const plans = (s.receiptPlans || []).filter(
    (x) =>
      x.storeId === store &&
      (workflowReady(s) ? x.receiving?.status !== "completed" : !x.receivedId),
  );
  if (!plans.length) {
    ctx.toast(
      "Belum ada nota supplier untuk lokasi ini. Back Office dapat membuka nota terlebih dahulu.",
    );
    return;
  }
  const d = ctx.modal(
    "Pilih nota supplier",
    field(
      "Nomor nota",
      `<select name="plan">${plans.map((x) => `<option value="${e(x.id)}">${e(x.invoiceNo)} · ${e(name(s, "suppliers", x.supplierId))}</option>`).join("")}</select>`,
    ),
    "Buka penerimaan",
  );
  d.querySelector("form").onsubmit = (ev) => {
    ev.preventDefault();
    const plan = plans.find((p) => p.id === ev.currentTarget.elements.plan.value);
    d.close();
    if (workflowReady(s)) openReceivingSession(s, plan.id, ctx);
    else openWeighingReceipt(s, store, { ...ctx, plan });
  };
  return d;
}
function openTransfer(s, t, ctx, receiving) {
  const internal = s.branchStockVersion >= 132 && t.invoiceNo === null;
  const finance = !internal && (!workflowReady(s) || backOffice(s, ctx.workspace));
  const canReceive = receiving && s.access?.receive && t.status === "in_transit",
    scanned = t.items.filter((i) => i.scannedAt).length;
  const d = ctx.modal(
    t.deliveryNo,
    `<div class="supply-detail-head"><div><h3>${e(t.origin.name)} → ${e(t.destination.name)}</h3><p>${internal ? "Mutasi antarcabang" : e(t.invoiceNo)} · ${e(t.carrier)}</p></div>${badge(t)}</div><div class="toolbar">${finance ? '<button type="button" data-print-invoice>Cetak invoice</button>' : ""}<button type="button" data-print-delivery>Cetak surat jalan</button></div><div class="supply-stats">${finance ? stat("Total tagihan", money(t.total)) + stat("Sisa tagihan", money(t.total - t.paid)) : ""}${t.items.length && !internal ? stat("Barcode cocok", scanned + " / " + t.items.length) : ""}</div>${table(
      ["Barang / batch", "Jumlah", ...(finance ? ["Harga transfer", "Total"] : [])],
      t.lines.map(
        (l) =>
          `<tr><td>${e(l.productName)}<small>${e(l.supplierName || "—")} · ${e(l.sourceLotId.slice(0, 8))}</small></td><td>${l.kind === "fruit" ? num(l.kg) + " kg / " + l.pieces + " butir" : num(l.qty) + " " + e(l.unit)}</td>${finance ? `<td>${money(l.price)} / ${e(l.unit)}</td><td>${money(l.total)}</td>` : ""}</tr>`,
      ),
    )}${canReceive && !internal && t.items.length ? `<div class="supply-step"><b>1</b><span>Scan ulang barang yang tiba</span></div><div class="supply-scan"><input data-receive-code maxlength="26" autocomplete="off" spellcheck="false" placeholder="Scan barcode penerimaan" aria-label="Scan barcode penerimaan"><button type="button" data-receive-add>Catat scan</button></div><p data-receive-message role="status"></p><p class="notice">Scan tersimpan di server. Seluruh kiriman tetap dalam perjalanan sampai barcode lengkap dan penerimaan dikonfirmasi.</p>` : ""}<div data-receive-list>${t.items.length ? receiptItems(t, internal) : ""}${
      canReceive && internal
        ? t.lines
            .filter((l) => l.kind === "fruit")
            .map((l) =>
              field(
                `${l.productName} · batch ${l.sourceLotId.slice(0, 8)} · dikirim ${l.pieces} butir`,
                `<input data-receive-fruit="${e(l.sourceLotId)}" type="number" step="1" min="0" required placeholder="Jumlah butir diterima">`,
              ),
            )
            .join("")
        : ""
    }</div>${
      canReceive && t.lines.some((l) => l.kind === "unit")
        ? `<h3>Periksa jumlah barang satuan</h3>${t.lines
            .filter((l) => l.kind === "unit")
            .map((l) =>
              field(
                `${l.productName} · batch ${l.sourceLotId.slice(0, 8)} · dikirim ${num(l.qty)} ${l.unit}`,
                `<input type="number" min="0" step="any" data-receive-unit="${e(l.sourceLotId)}" required placeholder="Jumlah fisik diterima">`,
              ),
            )
            .join("")}`
        : ""
    }${canReceive ? '<label class="supply-check"><input type="checkbox" name="confirmed" required> Semua barang sudah diperiksa dan sesuai surat jalan.</label>' : ""}${(finance || internal) && s.access?.backoffice && t.status !== "cancelled" ? `<div class="toolbar">${!internal && t.paid < t.total && !(s.outboundOrders || []).some((o) => o.id === t.id) ? '<button type="button" data-transfer-payment>Catat pembayaran</button>' : ""}${t.status === "in_transit" && t.paid === 0 && scanned === 0 ? '<button type="button" data-transfer-cancel>Batalkan kiriman</button>' : ""}</div>` : ""}<p>${e(t.note || "")}</p>`,
    canReceive ? "Konfirmasi penerimaan lengkap" : "Tutup",
  );
  d.classList.add("supply-modal");
  const print = (type) => {
    const win = window.open("", "_blank");
    if (!win) {
      ctx.toast("Izinkan pop-up untuk mencetak.");
      return;
    }
    win.opener = null;
    win.document.write(transferDocument(t, type));
    win.document.close();
  };
  d.querySelector("[data-print-invoice]")?.addEventListener("click", () =>
    print("invoice"),
  );
  d.querySelector("[data-print-delivery]").onclick = () => print("delivery");
  let working = false,
    scanId = null,
    scanCode = null;
  const scan = async () => {
    if (working) return;
    const input = d.querySelector("[data-receive-code]"),
      msg = d.querySelector("[data-receive-message]"),
      code = input.value.trim();
    try {
      scanForReceipt(t, code);
      if (scanCode !== code) {
        scanId = id();
        scanCode = code;
      }
      working = true;
      await ctx.mutate(
        "transfer_scan",
        { id: scanId, transferId: t.id, deliveryNo: t.deliveryNo, barcodes: [code] },
        { throwOnError: true },
      );
      t = ctx.getState().transfers.find((x) => x.id === t.id);
      scanCode = null;
      input.value = "";
      msg.textContent = `${t.items.filter((i) => i.scannedAt).length} / ${t.items.length} barcode cocok`;
      msg.className = "positive";
      d.querySelector("[data-receive-list]").innerHTML = receiptItems(t);
      d
        .querySelector(".supply-stats")
        .lastElementChild.querySelector("strong").textContent =
        t.items.filter((i) => i.scannedAt).length + " / " + t.items.length;
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "error";
    } finally {
      working = false;
      readyBarcodeInput(input);
    }
  };
  if (canReceive && !internal && t.items.length) {
    prepareBarcodeInput(d.querySelector("[data-receive-code]"));
    d.querySelector("[data-receive-add]").onclick = scan;
    d.querySelector("[data-receive-code]").onkeydown = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        scan();
      }
    };
  }
  const request = id();
  savingForm(d, async (f) => {
    if (!canReceive) {
      d.close();
      return;
    }
    if (working) throw Error("Tunggu pencatatan scan selesai.");
    if (!internal && t.items.some((i) => !i.scannedAt))
      throw Error("Masih ada barcode belum dipindai. Stok toko belum bertambah.");
    const units = [...d.querySelectorAll("[data-receive-unit]")].map((x) => ({
      lotId: x.dataset.receiveUnit,
      qty: Number(x.value),
    }));
    await ctx.mutate(
      "transfer_receive",
      {
        id: request,
        transferId: t.id,
        deliveryNo: t.deliveryNo,
        confirmed: f.elements.confirmed.checked,
        ...(internal
          ? {
              fruitCounts: Object.fromEntries(
                [...d.querySelectorAll("[data-receive-fruit]")].map((input) => [
                  input.dataset.receiveFruit,
                  Number(input.value),
                ]),
              ),
            }
          : {}),
        units,
      },
      { throwOnError: true },
    );
    d.close();
    ctx.render();
    ctx.toast("Penerimaan lengkap. Seluruh barang masuk stok toko.");
  });
  d.querySelector("[data-transfer-payment]")?.addEventListener("click", () => {
    const m = ctx.modal(
      "Pembayaran " + t.invoiceNo,
      field(
        "Jumlah dibayar (Rp)",
        `<input name="amount" type="number" min="0.01" max="${t.total - t.paid}" step="0.01" required>`,
      ) +
        field(
          "Referensi pembayaran",
          '<input name="reference" minlength="3" maxlength="150" required>',
        ),
      "Simpan pembayaran",
    );
    const eid = id();
    savingForm(m, async (f) => {
      await ctx.mutate(
        "transfer_payment",
        {
          id: eid,
          transferId: t.id,
          amount: Number(f.elements.amount.value),
          reference: f.elements.reference.value,
        },
        { throwOnError: true },
      );
      m.close();
      d.close();
      ctx.render();
    });
  });
  d.querySelector("[data-transfer-cancel]")?.addEventListener("click", () => {
    const m = ctx.modal(
      "Batalkan kiriman",
      field(
        "Alasan pembatalan",
        '<textarea name="reason" minlength="5" maxlength="500" required></textarea>',
      ) +
        '<label class="supply-check"><input type="checkbox" name="returned" required> Seluruh barang telah kembali secara fisik ke lokasi asal.</label>',
      "Batalkan & kembalikan stok",
    );
    const eid = id();
    savingForm(m, async (f) => {
      await ctx.mutate(
        "transfer_cancel",
        {
          id: eid,
          transferId: t.id,
          reason: f.elements.reason.value,
          returnedToWarehouse: f.elements.returned.checked,
        },
        { throwOnError: true },
      );
      m.close();
      d.close();
      ctx.render();
    });
  });
  return d;
}
function receiptItems(t, internal = false) {
  return `<details ${!internal && t.status === "in_transit" ? "open" : ""}><summary>Daftar barcode (${t.items.length})</summary>${table(
    ["Barcode", "Berat", "Pemeriksaan"],
    t.items.map(
      (i) =>
        `<tr><td><code>${e(i.barcode)}</code></td><td>${num(i.grams / 1000)} kg</td><td>${internal ? (t.status === "received" ? "Diterima" : "Terdaftar") : i.scannedAt ? "✓ Cocok" : "Belum dipindai"}</td></tr>`,
    ),
  )}</details>`;
}
function noteDialog(s, ctx) {
  const branch = s.branchStockVersion >= 132;
  const branches = (s.locations || s.stores).filter((l) => l.locationType === "store");
  const wh = warehouseId(s),
    products = s.products.filter(
      (p) =>
        p.stockUnit === "kg_butir" ||
        (s.supplierStockVersion >= 122 &&
          !s.stockDemo &&
          p.itemType !== "recipe" &&
          ["kg", "g", "ml", "pcs", "porsi"].includes(p.stockUnit)),
    ),
    rows = [{ productId: products[0]?.id, purchaseCost: "" }];
  if ((branch ? !branches.length : !wh) || !products.length) {
    ctx.toast(
      branch
        ? "Tambahkan cabang dan produk terlebih dahulu."
        : "Lengkapi gudang dan produk terlebih dahulu.",
    );
    return;
  }
  const d = ctx.modal(
    branch ? "Buka nota supplier untuk cabang" : "Nota supplier ke gudang",
    `${branch ? field("Cabang penerima", `<select name="receivingBranch" required><option value="">Pilih cabang penerima</option>${opts(branches)}</select>`) : `<p><b>${e(location(s, wh)?.name)}</b></p>`}<div class="form-grid">${field("Supplier", `<select name="supplierId" required>${opts(s.suppliers)}</select>`)}${field("Nomor nota supplier", '<input name="invoiceNo" maxlength="100" required>')}${field("Tanggal penerimaan", `<input name="date" type="date" value="${today()}" max="${today()}" required>`)}${field("Ongkir bersama (Rp)", '<input name="shippingCost" type="number" min="0" step="any" value="0" required>')}</div><div data-note-lines></div><button type="button" data-note-add>+ Tambah produk</button><p class="muted">Modal batch dihitung dari nilai barang dan bagian ongkir, dibagi jumlah aktual yang diterima.</p>`,
    branch ? "Simpan nota untuk cabang" : "Simpan nota untuk gudang",
  );
  d.classList.add("supply-modal");
  const list = d.querySelector("[data-note-lines]");
  const unitOf = (r) => products.find((p) => p.id === r.productId)?.stockUnit;
  const draw = () => {
    list.innerHTML = rows
      .map(
        (r, i) =>
          `<div class="form-grid" data-note-line="${i}">${field("Produk", `<select data-note-product>${opts(products, r.productId)}</select>`)}${field("Total harga produk di nota (Rp)", `<input data-note-cost type="number" min="0.01" step="any" value="${e(r.purchaseCost)}" required>`)}${unitOf(r) !== "kg_butir" ? field(`Jumlah pada nota (${e(unitOf(r))})`, `<input data-note-qty type="number" min="${["pcs", "porsi"].includes(unitOf(r)) ? 1 : 0.000001}" step="${["pcs", "porsi"].includes(unitOf(r)) ? 1 : 0.000001}" value="${e(r.expectedQty || "")}" required>`) : workflowReady(s) ? field("Berat pada nota (kg)", `<input data-note-kg type="number" min="0.001" max="9000000" step="0.001" value="${e(r.expectedKg || "")}" required>`) + field("Butir pada nota", `<input data-note-pieces type="number" min="1" max="9000000" step="1" value="${e(r.expectedPieces || "")}" required>`) : ""}${rows.length > 1 ? `<button type="button" data-note-remove="${i}">Hapus</button>` : ""}</div>`,
      )
      .join("");
    list.querySelectorAll("[data-note-line]").forEach((el) => {
      const r = rows[Number(el.dataset.noteLine)];
      el.querySelector("[data-note-product]").onchange = (ev) => {
        r.productId = ev.target.value;
        delete r.expectedQty;
        delete r.expectedKg;
        delete r.expectedPieces;
        draw();
      };
      el.querySelector("[data-note-qty]")?.addEventListener(
        "input",
        (ev) => (r.expectedQty = ev.target.value),
      );
      el.querySelector("[data-note-cost]").oninput = (ev) =>
        (r.purchaseCost = ev.target.value);
      el.querySelector("[data-note-kg]")?.addEventListener(
        "input",
        (ev) => (r.expectedKg = ev.target.value),
      );
      el.querySelector("[data-note-pieces]")?.addEventListener(
        "input",
        (ev) => (r.expectedPieces = ev.target.value),
      );
    });
    list.querySelectorAll("[data-note-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          rows.splice(Number(b.dataset.noteRemove), 1);
          draw();
        }),
    );
  };
  d.querySelector("[data-note-add]").onclick = () => {
    if (rows.length >= 50) return;
    rows.push({
      productId:
        products.find((p) => !rows.some((r) => r.productId === p.id))?.id ||
        products[0].id,
      purchaseCost: "",
    });
    draw();
  };
  const request = id();
  savingForm(d, async (f) => {
    if (new Set(rows.map((r) => r.productId)).size !== rows.length)
      throw Error("Produk tidak boleh terduplikasi.");
    await ctx.mutate(
      "receipt_plan_save",
      {
        id: request,
        storeId: branch ? f.elements.receivingBranch.value : wh,
        supplierId: f.elements.supplierId.value,
        invoiceNo: f.elements.invoiceNo.value.trim(),
        date: f.elements.date.value,
        shippingCost: Number(f.elements.shippingCost.value),
        lines: rows.map((r) => ({ ...r, purchaseCost: Number(r.purchaseCost) })),
      },
      { throwOnError: true },
    );
    d.close();
    ctx.render();
  });
  draw();
  return d;
}
export function servicePage(s, store) {
  const orders = (s.orders || []).filter(
    (o) =>
      o.store_id === store &&
      o.payment_status === "paid" &&
      ["queued", "preparing", "ready"].includes(o.status),
  );
  return `<section class="supply-workspace"><div class="supply-hero"><div><span class="supply-eyebrow">TOKO / WAITRESS</span><h2>Pelayanan meja</h2><p>Pantau pesanan lunas, cek nomor meja, lalu tandai selesai setelah diantar.</p></div><button type="button" data-supply-refresh>Perbarui</button></div><div class="supply-task-grid">${orders.map((o) => `<article class="panel supply-order"><span class="supply-badge">${e({ queued: "Menunggu kitchen", preparing: "Sedang dibuat", ready: "Siap diantar" }[o.status])}</span><h3>Meja ${e(o.table_no || o.tableNo || "—")}</h3><p>${e(o.note || "")}</p><ul>${o.lines.map((l) => `<li>${e(name(s, "products", l.productId))} × ${num(l.qty)}</li>`).join("")}</ul><button type="button" data-service-complete="${e(o.id)}" ${o.status === "ready" ? "" : "disabled"}>Sudah diantar</button></article>`).join("") || '<div class="panel empty">Belum ada pesanan untuk diantar.</div>'}</div></section>`;
}
export function cuttingPage(s, store) {
  const checks = (s.cutChecks || []).filter((c) => c.storeId === store);
  return `<section class="supply-workspace"><div class="supply-hero"><div><span class="supply-eyebrow">TOKO / TUKANG POTONG</span><h2>Pemeriksaan buah</h2><p>Scan buah yang dipilih pelanggan. Buah yang tidak layak dicatat melalui Reject & Waste.</p></div><button type="button" data-view="waste">Reject & Waste</button></div><section class="panel"><form data-cut-form><div class="form-grid">${field("Barcode buah", '<input name="barcode" maxlength="26" autocomplete="off" required>')}${field("Nomor meja / pesanan", '<input name="tableNo" maxlength="30" required>')}${field("Catatan", '<input name="note" maxlength="300">')}</div><p class="muted">Pencatatan pemeriksaan tidak mengurangi stok. Kasir memindai barcode saat pembayaran.</p><p data-cut-error class="error"></p><button type="submit" class="primary">Catat pemeriksaan</button></form></section><section class="panel"><h3>Pemeriksaan 7 hari terakhir</h3>${table(
    ["Barcode", "Meja", "Catatan", "Petugas"],
    checks.map(
      (c) =>
        `<tr><td><code>${e(c.barcode)}</code></td><td>${e(c.tableNo)}</td><td>${e(c.note)}</td><td>${e(c.actor)}</td></tr>`,
    ),
  )}</section></section>`;
}
export function bindSupply(s, store, view, ctx) {
  if (view === "pricing" && s.branchPricingVersion >= 123) return bindBranchPricing(ctx);
  ctx = {
    ...ctx,
    printOutbound: (o, type) => {
      if (type === "invoice" && !backOffice(s, ctx.workspace)) return;
      const win = window.open("", "_blank");
      if (!win) return ctx.toast("Izinkan pop-up untuk mencetak.");
      win.opener = null;
      win.document.write(transferDocument(o, type));
      win.document.close();
    },
  };
  document
    .querySelectorAll("[data-session-open]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          openReceivingSession(ctx.getState(), b.dataset.sessionOpen, ctx)),
    );
  bindOutboundPage(s, store, ctx);
  document
    .querySelector("[data-outbound-new]")
    ?.addEventListener("click", () => openOutboundForm(ctx.getState(), store, ctx));
  document.querySelectorAll("[data-supply-refresh]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await ctx.refresh();
          ctx.render();
        } catch (err) {
          ctx.toast(err.message);
        }
      }),
  );
  const incoming = view === "receiving";
  const rows = () =>
    (s.transfers || []).filter((t) =>
      incoming
        ? t.targetId === store
        : (s.access?.backoffice && ctx.workspace !== "store") || t.sourceId === store,
    );
  const list = document.querySelector("[data-transfer-list]");
  if (list) {
    const draw = () => {
      const q = document
          .querySelector("[data-transfer-search]")
          .value.trim()
          .toLowerCase(),
        status = document.querySelector("[data-transfer-filter]").value;
      list.innerHTML = transferTable(
        rows().filter(
          (t) =>
            (!status || t.status === status) &&
            (!q ||
              [t.invoiceNo, t.deliveryNo, t.destination.name, t.origin.name]
                .join(" ")
                .toLowerCase()
                .includes(q)),
        ),
        !(s.branchStockVersion >= 132) &&
          (!workflowReady(s) || backOffice(s, ctx.workspace)),
      );
    };
    document.querySelector("[data-transfer-search]").oninput = draw;
    document.querySelector("[data-transfer-filter]").onchange = draw;
    draw();
  }
  document.querySelector(".supply-workspace")?.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-transfer]");
    if (b) {
      const t = s.transfers.find((t) => t.id === b.dataset.transfer);
      openTransfer(s, t, ctx, (incoming || t.targetId === store) && t.targetId === store);
    }
  });
  document
    .querySelector("[data-transfer-new]")
    ?.addEventListener("click", () => openDispatch(s, store, ctx));
  document.querySelectorAll("[data-transfer-price]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = s.products.find((p) => p.id === b.dataset.transferPrice),
          r = s.transferPrices?.find((x) => x.productId === p.id),
          units = p.stockUnit === "kg_butir" ? ["kg", "butir"] : [p.stockUnit];
        const d = ctx.modal(
          "Harga transfer · " + p.name,
          field(
            "Satuan",
            `<select name="unit">${units.map((u) => `<option ${u === r?.unit ? "selected" : ""}>${e(u)}</option>`).join("")}</select>`,
          ) +
            field(
              "Harga transfer ke toko (Rp)",
              `<input name="price" type="number" min="0.01" step="0.01" value="${r?.price || ""}" required>`,
            ),
          "Simpan harga",
        );
        const request = id();
        savingForm(d, async (f) => {
          await ctx.mutate(
            "transfer_price_save",
            {
              id: request,
              productId: p.id,
              unit: f.elements.unit.value,
              price: Number(f.elements.price.value),
            },
            { throwOnError: true },
          );
          d.close();
          ctx.render();
        });
      }),
  );
  document.querySelector("[data-legacy-labels]")?.addEventListener("click", () => {
    const lots = s.lots.filter((l) => {
      const tracked = (s.fruitUnits || []).filter(
        (u) => u.lotId === l.id && ["available", "reject"].includes(u.status),
      );
      return (
        l.kg > tracked.reduce((n, u) => n + u.grams / 1000, 0) + 0.0001 &&
        ["ready", "reject"].includes(l.quality)
      );
    });
    if (!lots.length) return ctx.toast("Tidak ada sisa stok lama tanpa barcode.");
    const d = ctx.modal(
      "Registrasi barcode stok lama",
      field(
        "Batch yang diperiksa",
        `<select name="lotId">${lots.map((l) => `<option value="${e(l.id)}">${e(name(s, "stores", l.storeId))} · ${e(name(s, "products", l.productId))} · ${e(name(s, "suppliers", l.supplierId))} · ${e(l.id.slice(0, 8))}</option>`).join("")}</select>`,
      ) +
        field(
          "Scan seluruh label, satu barcode per baris",
          '<textarea name="codes" rows="8" required placeholder="Scan lalu Enter"></textarea>',
        ) +
        field(
          "Alasan / hasil pemeriksaan fisik",
          '<textarea name="reason" minlength="10" maxlength="500" required></textarea>',
        ) +
        '<p class="notice">Khusus stok lama. Total berat dan butir harus tepat sama dengan stok belum berlabel. Barcode milik batch lain ditolak. Tidak menambah stok.</p>',
      "Registrasikan barcode",
    );
    const eid = id();
    savingForm(d, async (f) => {
      await ctx.mutate(
        "legacy_labels_register",
        {
          id: eid,
          lotId: f.elements.lotId.value,
          barcodes: f.elements.codes.value.trim().split(/\s+/),
          reason: f.elements.reason.value,
        },
        { throwOnError: true },
      );
      d.close();
      ctx.render();
    });
  });
  document
    .querySelector("[data-note-new]")
    ?.addEventListener("click", () => noteDialog(s, ctx));
  document.querySelectorAll("[data-note-open]").forEach((b) => {
    b.onclick = () => {
      const current = ctx.getState?.() || s;
      const plan = current.receiptPlans.find((p) => p.id === b.dataset.noteOpen);
      if (plan) {
        if (workflowReady(current) && !backOffice(current, ctx.workspace))
          openReceivingSession(current, plan.id, ctx);
        else openSupplierNote(current, plan, ctx);
      }
    };
  });
  document.querySelectorAll("[data-note-receive]").forEach(
    (b) =>
      (b.onclick = () => {
        const plan = s.receiptPlans.find((x) => x.id === b.dataset.noteReceive);
        if (workflowReady(s)) openReceivingSession(ctx.getState(), plan.id, ctx);
        else openWeighingReceipt(s, plan.storeId, { ...ctx, plan });
      }),
  );
  document.querySelectorAll("[data-service-complete]").forEach((b) => {
    const request = id();
    b.onclick = async () => {
      b.disabled = true;
      try {
        await ctx.mutate(
          "service_complete",
          { id: request, orderId: b.dataset.serviceComplete },
          { throwOnError: true },
        );
        ctx.render();
      } catch (err) {
        ctx.toast(err.message);
        b.disabled = false;
      }
    };
  });
  const f = document.querySelector("[data-cut-form]");
  if (f) {
    prepareBarcodeInput(f.elements.barcode);
    const request = id();
    let busy = false;
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      if (busy) return;
      busy = true;
      try {
        await ctx.mutate(
          "fruit_cut_check",
          { id: request, storeId: store, ...Object.fromEntries(new FormData(f)) },
          { throwOnError: true },
        );
        ctx.render();
        readyBarcodeInput(document.querySelector("[data-cut-form] [name=barcode]"));
      } catch (err) {
        readyBarcodeInput(f.elements.barcode);
        f.querySelector("[data-cut-error]").textContent = err.message;
      } finally {
        busy = false;
      }
    };
  }
}
