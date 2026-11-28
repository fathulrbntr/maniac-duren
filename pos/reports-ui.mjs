import { recordTable, sessionDialog } from "./supply-session-ui.mjs";
import { expenseFields } from "./store-expenses-ui.mjs";
import { escape as e, today, money, num, id } from "./core.mjs";
import {
  label,
  periodRange,
  salesReport,
  expenseReport,
  deliveryReport,
  stockReport,
  marginReport,
  reportSheets,
  batchReportSheets,
} from "./reports.mjs";
import { transferStatus } from "./warehouse-flow.mjs";
import { cashFlowSheets, fundingNames, fundingOptions } from "./cash-flow.mjs";
import { downloadWorkbook, printWindow, reportPrint } from "./report-export.mjs";
import { batchReportPage, bindBatchReport } from "./batch-report-ui.mjs";
const options = (s) =>
  `<option value="">Semua toko yang dapat diakses</option>${s.stores.map((t) => `<option value="${e(t.id)}">${e(t.name)}</option>`).join("")}`;
const field = (label, body) =>
  `<label class="field"><span>${label}</span>${body}</label>`;
const tabs = {
  summary: "Ringkasan",
  payments: "Pembayaran",
  products: "Per produk",
  stores: "Per toko",
  suppliers: "Supplier",
  stock: "Mutasi stok",
  deliveries: "Pengiriman",
  cashflow: "Arus kas",
  expenses: "Pengeluaran",
  margin: "HPP & Hasil",
  batches: "Batch supplier",
};
let reportScope = "";
let requestedScope = null;
let tab = "summary",
  filters = { ...periodRange("month", today()), store: "", period: "month" },
  page = 0;
const allowed = (s, t, workspace) =>
  t === "deliveries"
    ? s.warehouseVersion >= 107 &&
      !s.stockDemo &&
      !!(s.access?.trace || s.access?.reports)
    : t === "cashflow"
      ? workspace === "backoffice" &&
        s.access?.backoffice &&
        s.access?.finance &&
        !s.stockDemo
      : !s.access ||
        (["expenses", "margin"].includes(t)
          ? s.access.finance
          : t === "batches"
            ? s.access.trace || s.access.finance || s.access.waste
            : t === "stock"
              ? s.access.trace
              : s.access.reports);
export function selectReportTab(t, scope = null) {
  tab = t;
  page = 0;
  requestedScope = scope;
}
export function reportsPage(s, workspace) {
  if (!allowed(s, tab, workspace))
    tab = Object.keys(tabs).find((t) => allowed(s, t, workspace)) || "summary";
  const stores =
    tab === "cashflow" ? s.stores.filter((x) => x.locationType === "store") : s.stores;
  const grouped = s.pettyCashVersion >= 130 && !s.stockDemo;
  const groups = [
    ["Penjualan", ["summary", "payments", "products", "stores", "suppliers"]],
    ["Stok & pengiriman", ["stock", "batches", "deliveries"]],
    ["Keuangan", ["cashflow", "expenses", "margin"]],
  ]
    .map(([group, keys]) => [group, keys.filter((k) => allowed(s, k, workspace))])
    .filter(([, keys]) => keys.length);
  const nav = groups
    .map(
      ([group, keys]) =>
        `<div class="report-tab-group"><strong>${group}</strong><div class="toolbar">${keys
          .map(
            (k) =>
              `<button type="button" data-report-tab="${k}" aria-pressed="${k === tab}" class="${k === tab ? "primary" : ""}">${tabs[k]}</button>`,
          )
          .join("")}</div></div>`,
    )
    .join("");
  const picker = groups
    .map(
      ([group, keys]) =>
        `<optgroup label="${group}">${keys.map((k) => `<option value="${k}" ${k === tab ? "selected" : ""}>${tabs[k]}</option>`).join("")}</optgroup>`,
    )
    .join("");
  const deliveryFields =
    tab === "deliveries"
      ? `<div class="report-delivery-filters">${field("Cari kiriman", '<input type="search" id="report-delivery-query" placeholder="Nomor nota, surat jalan, atau cabang">')}${field(
          "Status kiriman",
          `<select id="report-delivery-status"><option value="">Semua status</option>${Object.entries(
            transferStatus,
          )
            .map(([value, title]) => `<option value="${value}">${e(title)}</option>`)
            .join("")}</select>`,
        )}</div>`
      : "";
  const archive =
    grouped && workspace === "backoffice" && s.access?.backoffice
      ? '<button type="button" data-view="documents">Arsip dokumen</button>'
      : "";
  return `<div class="intro report-heading"><div><h2>Laporan</h2><p class="muted">${tab === "summary" ? "Ekspor ringkasan mencakup seluruh bagian laporan standar sesuai akses." : "Ekspor mengikuti jenis laporan dan filter yang dipilih."}</p></div><div class="toolbar report-actions"><button type="button" id="report-refresh">Perbarui</button><button type="button" id="report-excel">Excel</button><button type="button" id="report-pdf">Cetak / PDF</button></div></div><label class="field report-mobile-picker"><span>Jenis laporan</span><select id="report-picker">${picker}</select></label><nav class="report-tabs" aria-label="Jenis laporan">${nav}</nav><section class="panel" id="report-filters" data-expanded="false" ${tab === "batches" ? "hidden" : ""}><button type="button" class="report-filter-toggle" id="report-filter-toggle" aria-expanded="false" aria-controls="report-controls"><span>Filter laporan</span><small id="report-filter-caption"></small></button><div id="report-controls"><div class="report-filter-grid">${field("Periode", `<select id="report-period"><option value="day">Hari ini</option><option value="week">Minggu ini (Senin–Minggu)</option><option value="month">Bulan ini</option><option value="custom">Pilih tanggal</option></select>`)}${field("Dari", '<input id="report-from" type="date" required>')}${field("Sampai", '<input id="report-to" type="date" required>')}${field("Toko", `<select id="report-store">${options({ stores })}</select>`)}</div>${deliveryFields}</div><p id="report-error" class="error" role="alert"></p></section><div id="report-result" data-report-kind="${tab}" aria-label="${tabs[tab]}"></div>${archive ? `<div class="report-archive">${archive}</div>` : ""}`;
}
const table = (headers, rows) =>
  `<div class="table-wrap"><table><thead><tr>${headers.map((x) => `<th>${e(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}" class="empty">Belum ada data pada periode ini.</td></tr>`}</tbody></table></div>`;
const stat = (name, value) =>
  `<div class="stat"><small>${e(name)}</small><strong>${value}</strong></div>`;
export function bindReports(s, store, ctx) {
  const $ = (q) => document.querySelector(q),
    result = $("#report-result");
  const scope = (s.me?.id || "") + ":" + (ctx.workspace || "");
  if (scope !== reportScope) {
    filters.store = "";
    delete filters.query;
    delete filters.status;
  }
  reportScope = scope;
  if (requestedScope) {
    const { store: branch, from, to, period } = requestedScope;
    filters.store = branch || "";
    if (from && to)
      Object.assign(filters, {
        from,
        to,
        period: ["day", "month", "week"].includes(period) ? period : "custom",
      });
    requestedScope = null;
  }
  if (
    filters.store &&
    !s.stores.some(
      (t) => t.id === filters.store && (tab !== "cashflow" || t.locationType === "store"),
    )
  )
    filters.store = "";
  $("#report-period").value = filters.period;
  $("#report-from").value = filters.from;
  $("#report-to").value = filters.to;
  const fixedLocation =
    store && s.warehouseVersion >= 107 && ["store", "warehouse"].includes(ctx.workspace);
  if (fixedLocation) {
    filters.store = store;
    $("#report-store").disabled = true;
  }
  $("#report-store").value = filters.store;
  if (tab === "deliveries") {
    $("#report-delivery-query").value = filters.query || "";
    $("#report-delivery-status").value = filters.status || "";
  }
  const filter = () => ({
    from: $("#report-from").value,
    to: $("#report-to").value,
    store: $("#report-store").value,
    period: $("#report-period").value,
    ...(tab === "deliveries"
      ? {
          query: $("#report-delivery-query").value.trim(),
          status: $("#report-delivery-status").value,
        }
      : {}),
  });
  const toggle = $("#report-filter-toggle");
  toggle.onclick = () => {
    const expanded = $("#report-filters").dataset.expanded !== "true";
    $("#report-filters").dataset.expanded = String(expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
  };
  const valid = () => {
    const f = filter(),
      ok =
        tab === "batches"
          ? !$("#batch-from")?.value ||
            !$("#batch-to")?.value ||
            $("#batch-from").value <= $("#batch-to").value
          : f.from && f.to && f.from <= f.to;
    const dateLabel =
      { day: "Hari ini", week: "Minggu ini", month: "Bulan ini" }[f.period] ||
      [f.from, f.to !== f.from && f.to].filter(Boolean).join(" – ");
    $("#report-filter-caption").textContent = [
      dateLabel,
      f.store ? label(s, "stores", f.store) : "Semua toko",
      f.query,
      transferStatus[f.status],
    ]
      .filter(Boolean)
      .join(" · ");
    const issue = $("#batch-range-error") || $("#report-error");
    issue.textContent = ok
      ? ""
      : "Isi periode yang valid: tanggal awal tidak boleh melewati akhir.";
    $("#report-excel").disabled = !ok;
    $("#report-pdf").disabled = !ok;
    return ok;
  };
  const applyBatchState = (update) => {
    if (update.state) {
      s = update.state;
      if (!allowed(s, "batches")) {
        document.querySelectorAll("dialog.reject-modal[open]").forEach((d) => d.close());
        ctx.render();
        return;
      }
    }
    $("#batch-results")?.dispatchEvent(
      new CustomEvent("batch-state", { detail: update }),
    );
  };
  let refreshingBatch = false;
  const refreshBatch = async () => {
    if (refreshingBatch) return;
    refreshingBatch = true;
    try {
      await (ctx.refreshBatchState || ctx.refresh)();
      applyBatchState({ state: ctx.getState() });
    } catch (error) {
      applyBatchState({ error: true });
      throw error;
    } finally {
      refreshingBatch = false;
    }
  };
  result.addEventListener("report-sync", (event) => {
    if (tab === "batches") applyBatchState(event.detail);
  });
  let requestNumber = 0,
    flowSheets = null;
  const retailLink =
    s.pettyCashVersion >= 130 &&
    ctx.workspace === "backoffice" &&
    s.access?.backoffice &&
    s.access?.finance
      ? '<button type="button" data-view="retailFunds">Buka Keuangan PT Retail</button>'
      : "";
  const drawFlow = async (selected, ticket) => {
    $("#report-excel").disabled = $("#report-pdf").disabled = true;
    if (!(s.cashFlowVersion >= 127)) {
      result.textContent = "Pasang SQL arus kas 127 lalu muat ulang POS.";
      return;
    }
    result.textContent = "Memuat arus kas…";
    try {
      const report = await ctx.rpc("pos_cash_flow_read", { filters: selected });
      if (!result.isConnected || ticket !== requestNumber || tab !== "cashflow") return;
      flowSheets = cashFlowSheets(report, selected.store, selected.from, selected.to);
      const [shop, retail] = flowSheets;
      const distribution = flowSheets.find((x) => x.name === "PT Distribusi (Gudang)");
      const invoices = flowSheets.find((x) => x.name === "Tagihan PT Distribusi");
      const review = flowSheets.find((x) => x.name === "Perlu diperiksa");
      const sheetTable = (sheet) =>
        table(
          ["Komponen", "Nilai"],
          sheet.rows.map(([label, value]) => [
            e(label),
            label.includes("jumlah transaksi") ? num(value) : money(value),
          ]),
        );
      const panel = (sheet, extra = "") =>
        `<section class="panel"><h3>${e(sheet.name)}</h3>${sheetTable(sheet)}${extra}</section>`;
      const invoiceTable = invoices
        ? `<h4>Tagihan dan invoice</h4>${sheetTable(invoices)}`
        : "";
      result.innerHTML =
        `<div class="cash-flow-grid">${panel(shop)}${panel(retail)}${distribution ? panel(distribution, invoiceTable) : ""}</div>` +
        (review ? panel(review) : "") +
        (report.turnoverDepositVersion >= 138
          ? '<p class="muted">Saldo setoran cabang adalah omzet tunai dan nontunai setelah pengembalian dana, dikurangi setoran ke PT Retail. Saldo positif masih harus disetor. Petty cash dan biaya operasional dicatat terpisah.</p>'
          : report.branchStockVersion >= 132
            ? '<p class="muted">Pembayaran nota dan ongkir supplier cabang mengikuti tanggal pembayaran. Mutasi antarcabang hanya memindahkan persediaan.</p>'
            : `<p class="muted">Uang kas toko mengikuti transaksi tunai tercatat sejak awal riwayat POS. Uang awal kembalian tidak termasuk. Penjualan nontunai mengikuti pembayaran di kasir. Setoran dan pembayaran nota antarpihak ditampilkan di kedua pihak. Tagihan menjadi arus kas saat dibayar.</p>`) +
        (selected.store && !report.branchStockVersion
          ? '<p class="muted">Filter cabang menampilkan dana terkait toko terpilih. Pilih semua toko untuk melihat wholesale dan pembayaran supplier.</p>'
          : "") +
        (review
          ? '<p class="notice">Saldo hanya mencakup transaksi yang dapat dialokasikan. Lengkapi sumber dana melalui Laporan → Pengeluaran dan periksa tanggal refund yang belum tersedia.</p>'
          : "") +
        (retailLink || '<button type="button" id="flow-expense">+ Pengeluaran</button>');
      ctx.bindNavigation?.(result);
      $("#flow-expense")?.addEventListener("click", () =>
        expenseDialog(s, selected.store || store, ctx),
      );
      $("#report-excel").disabled = $("#report-pdf").disabled = false;
    } catch (error) {
      if (result.isConnected && ticket === requestNumber && tab === "cashflow") {
        flowSheets = null;
        result.textContent = "Arus kas belum dapat dimuat. " + error.message;
      }
    }
  };
  const draw = () => {
    requestNumber++;
    flowSheets = null;
    if (!valid()) {
      result.innerHTML = "";
      return;
    }
    filters = filter();
    if (tab === "cashflow") {
      void drawFlow(filters, requestNumber);
      return;
    }
    if (tab === "batches") {
      result.innerHTML = batchReportPage(
        s,
        fixedLocation
          ? store
          : filters.store || (ctx.workspace === "backoffice" ? "" : store),
        fixedLocation,
      );
      $("#batch-from").addEventListener("change", valid);
      $("#batch-to").addEventListener("change", valid);
      bindBatchReport(s, store, ctx);
      return;
    }
    const a = ["summary", "payments", "products", "stores", "suppliers"].includes(tab)
      ? salesReport(s, filters)
      : null;
    const x =
      tab === "expenses" || (tab === "summary" && (!s.access || s.access.finance))
        ? expenseReport(s, filters)
        : null;
    const st = tab === "stock" ? stockReport(s, filters) : null;
    let rows = [],
      headers = [],
      intro = "";
    if (tab === "summary") {
      intro = `<div class="stats">${stat("Penjualan bersih", money(a.total))}${stat("Transaksi penjualan aktif", num(a.tx.length))}${stat("Rata-rata transaksi", money(a.tx.length ? a.total / a.tx.length : 0))}${!s.access || s.access.finance ? stat("Pembelian + operasional", x.unknown ? "Belum lengkap" : money(x.total)) : ""}</div><p class="muted">Setelah diskon; transaksi batal/refund dikeluarkan dari periode penjualan asal. Invoice dokumen tidak menambah omzet; wholesale dicatat sekali saat barang dikirim, termasuk yang belum lunas.</p>`;
      headers = ["Tanggal", "Transaksi", "Penjualan bersih"];
      rows = a.days
        .slice()
        .reverse()
        .map((r) => [
          `<button class="report-day" type="button" data-sales-day="${e(r.date)}" aria-label="Lihat transaksi ${e(r.date)}">${e(r.date)}</button>`,
          num(r.count),
          money(r.total),
        ]);
    }
    if (tab === "payments") {
      headers = ["Metode pembayaran", "Transaksi", "Penjualan bersih"];
      rows = a.payments.map((r) => [e(r.name), num(r.count), money(r.total)]);
      intro = `<div class="stats">${stat("Penjualan bersih", money(a.total))}</div><p class="muted">Setelah diskon; transaksi batal/refund dikeluarkan dari periode penjualan asal. Nominal ini bukan saldo pencairan penyedia pembayaran.</p>`;
    }
    if (tab === "products") {
      headers = ["Produk", "Satuan", "Jumlah", "Kg aktual", "Butir", "Penjualan bersih"];
      rows = a.products.map((r) => [
        e(r.name),
        e(r.unit),
        num(r.qty),
        num(r.kg),
        num(r.pieces),
        money(r.revenue),
      ]);
    }
    if (tab === "stores") {
      headers = ["Toko", "Transaksi", "Penjualan bersih"];
      rows = a.stores.map((r) => [e(r.name), num(r.count), money(r.total)]);
      intro = `<div class="stats">${stat("Total toko terpilih", money(a.total))}</div>`;
    }
    if (tab === "suppliers") {
      headers = ["Supplier", "Metode", "Penjualan bersih"];
      rows = a.suppliers.map((r) => [e(r.name), e(r.method), money(r.revenue)]);
      intro =
        '<p class="muted">Produk campuran dialokasikan menurut modal bahan. Nilai tanpa asal/modal lengkap tetap dicatat sebagai Belum terpetakan; tidak diasumsikan milik supplier tertentu.</p>';
    }
    if (tab === "stock") {
      headers = [
        "Produk / toko",
        "Satuan",
        "Awal*",
        "Datang",
        "Terjual / bahan",
        "Reject ditandai**",
        "Waste",
        "Transfer +",
        "Transfer −",
        "Produksi / koreksi",
        "Akhir*",
        "Sekarang",
        "Reject sekarang",
      ];
      rows = st.rows.map((r) => [
        `${e(r.name)}<small>${e(r.store)}</small>`,
        e(r.unit),
        ...[
          r.opening,
          r.incoming,
          r.sold,
          r.rejected,
          r.loss,
          r.transferIn,
          r.transferOut,
          r.other,
          r.closing,
          r.current,
          r.rejectCurrent,
        ].map(num),
      ]);
      intro = `<p class="muted">* Stok awal/akhir dihitung mundur dari stok sekarang dan jurnal. ** Reject ditandai dihitung sekali, dikurangi pembatalan pada periode ini. Pemakaian reject untuk olahan tidak dihitung ulang. Reject dapat berasal dari stok awal; nilai negatif menunjukkan pembatalan dari periode sebelumnya. Terjual/bahan mengikuti tanggal barang dipakai.</p>${st.rejectUnclassified ? `<p class="notice">${st.rejectUnclassified} baris reject belum terpetakan. Angka reject belum lengkap; periksa jejak stok.</p>` : ""}${st.incomplete ? '<p class="notice">Ada stok dengan riwayat sebelum jurnal. Cocokkan saldo awal dengan stock opname; riwayat lama tidak dianggap lengkap.</p>' : ""}`;
    }
    if (tab === "deliveries") {
      const { sheet, counts } = deliveryReport(s, filters);
      headers = sheet.headers;
      rows = sheet.rows.map((row) => row.map((cell) => e(cell || "—")));
      intro = `<div class="stats">${stat("Dalam perjalanan", num(counts.in_transit))}${stat("Diterima lengkap", num(counts.received))}${stat("Dibatalkan", num(counts.cancelled))}</div><p class="muted">Periode mengikuti tanggal barang dikirim (WIB). Cabang terpilih mencakup kiriman masuk dan keluar.</p>`;
    }
    if (tab === "margin") {
      const m = marginReport(s, filters);
      headers = [
        "Tanggal",
        "Produk",
        "Penjualan",
        "HPP",
        "Laba kotor",
        "Bahan olahan reject",
      ];
      rows = m.rows.map((r) => [
        e(r.date),
        e(r.name),
        money(r.revenue),
        r.cost == null ? "Belum diketahui" : money(r.cost),
        r.cost == null ? "Belum diketahui" : money(r.revenue - r.cost),
        r.recovered ? "Ya" : "Tidak",
      ]);
      intro = `<div class="stats">${stat("HPP tercatat", money(m.cogs))}${stat("Waste tercatat", money(m.loss))}${stat("Operasional", m.operating == null ? "Belum lengkap" : money(m.operating))}${stat("Hasil setelah biaya", m.unknown ? "Belum lengkap" : money(m.result))}</div><p class="muted">Penjualan − HPP − waste − operasional. Pembelian tidak dikurangkan lagi karena modal dicatat sebagai HPP ketika terjual. Hanya biaya yang tercatat; belum merupakan laba bersih akuntansi.</p>${m.unknown ? '<p class="notice">Periksa rincian HPP, biaya operasional dan tanggal pencatatan waste. Pesanan yang masih di dapur bisa menunggu pencatatan pemakaian bahan.</p>' : ""}`;
    }
    if (tab === "expenses") {
      headers = [
        "Tanggal / toko",
        "Kategori",
        "Keterangan",
        "Nominal",
        "Referensi",
        "Aksi",
      ];
      rows = x.rows.map((r) => [
        `${e(r.date)}<small>${e(label(s, "stores", r.storeId))}</small>`,
        e(r.category) +
          (r.kind === "expense" && s.cashFlowVersion >= 127
            ? `<small>${e(fundingNames[r.funding] || "Sumber dana belum dipilih")}</small>`
            : ""),
        e(r.description),
        r.amount == null ? "Belum diketahui" : money(r.amount),
        e(r.reference || "—"),
        r.kind === "expense"
          ? s.pettyCashVersion >= 130 && ctx.workspace !== "backoffice"
            ? ""
            : `${s.cashFlowVersion >= 127 && !s.stockDemo && !r.funding ? `<button type="button" data-expense-funding="${e(r.id)}">Tentukan sumber dana</button>` : ""}<button data-expense-void="${e(r.id)}" class="small danger">Batalkan</button>`
          : "Dari penerimaan",
      ]);
      intro = `<div class="header-row"><p>Biaya pembelian termasuk ongkir + pengeluaran operasional. HPP, waste, PO, invoice, dan transfer tidak dihitung ulang. Laporan mengikuti tanggal biaya dicatat.</p>${retailLink || `<button id="add-expense" ${s.pettyCashVersion >= 130 && ctx.workspace !== "backoffice" ? "hidden" : ""} class="primary" ${s.reportsAdminVersion >= 71 && !s.stockDemo ? "" : "disabled"}>+ Pengeluaran</button>`}</div><div class="stats">${stat("Pembelian tercatat", money(x.purchases))}${stat("Operasional", money(x.operating))}${stat("Total pengeluaran", x.unknown ? "Belum lengkap" : money(x.total))}</div>${x.unknown ? `<p class="notice">${x.unknown} penerimaan belum memiliki modal.</p>` : ""}`;
    }
    const max = Math.max(0, Math.ceil(rows.length / 50) - 1);
    page = Math.min(page, max);
    const renderTable = tab === "deliveries" ? recordTable : table;
    result.innerHTML = `${intro}<section class="panel"><h3 class="report-table-title">${tabs[tab]}</h3>${renderTable(headers, rows.slice(page * 50, page * 50 + 50))}<div class="report-pages" ${max === 0 ? "hidden" : ""}><button id="r-prev" ${page === 0 ? "disabled" : ""}>Sebelumnya</button><span>${rows.length} baris · ${page + 1}/${max + 1}</span><button id="r-next" ${page >= max ? "disabled" : ""}>Berikutnya</button></div></section>${
      tab === "stock"
        ? `<details class="panel"><summary>Jejak pergerakan stok (${st.details.length}) · seluruh rincian tersedia di Excel/PDF</summary>${table(
            ["Tanggal", "Kegiatan", "Produk", "Lot", "Perubahan"],
            st.details
              .slice(0, 100)
              .map((j) => [
                e(j.date),
                e(j.label),
                e(j.product),
                e(j.lot_id),
                num(j.qty) + " " + e(j.unit),
              ]),
          )}</details>`
        : ""
    }`;
    $("#r-prev").onclick = () => {
      page--;
      draw();
    };
    $("#r-next").onclick = () => {
      page++;
      draw();
    };
    result.querySelectorAll("[data-sales-day]").forEach((button) => {
      button.onclick = () => {
        const day = button.dataset.salesDay;
        const records = a.tx.filter((t) => t.date === day);
        const dialog = sessionDialog(
          ctx,
          "Transaksi " + e(day),
          recordTable(
            ["Nomor transaksi", "Toko", "Pembayaran", "Penjualan bersih"],
            records.map((t) => [
              e(t.invoiceNo || t.id),
              e(label(s, "stores", t.storeId)),
              e(t.payment || "—"),
              money(t.total),
            ]),
          ),
        );
        dialog.querySelector(".modal-actions .close")?.remove();
      };
    });
    if (retailLink && tab === "expenses") ctx.bindNavigation?.(result);
    $("#add-expense")?.addEventListener("click", () =>
      expenseDialog(s, filters.store || store, ctx),
    );
    result.querySelectorAll("[data-expense-funding]").forEach((button) => {
      button.onclick = () => {
        const row = x.rows.find((r) => r.id === button.dataset.expenseFunding);
        const dialog = ctx.modal(
          "Sumber dana pengeluaran",
          `<p>${e(row.description)} · ${money(row.amount)}</p>` +
            field(
              "Dibayar oleh",
              `<select name="funding" required>${payerOptions(s, row.storeId)}</select>`,
            ),
        );
        const request = id();
        dialog.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          if (
            await ctx.mutate("expense_funding", {
              id: request,
              expenseId: row.id,
              storeId: row.storeId,
              funding: ev.currentTarget.elements.funding.value,
            })
          ) {
            dialog.close();
            ctx.render();
          }
        };
      };
    });
    result.querySelectorAll("[data-expense-void]").forEach(
      (b) =>
        (b.onclick = () => {
          const row = x.rows.find((r) => r.id === b.dataset.expenseVoid),
            d = ctx.modal(
              "Batalkan pengeluaran",
              field(
                "Alasan",
                '<textarea name="reason" required minlength="3" maxlength="500"></textarea>',
              ),
              "Batalkan pengeluaran",
            );
          d.querySelector("form").onsubmit = async (ev) => {
            ev.preventDefault();
            if (
              await ctx.mutate("expense_void", {
                id: id(),
                expenseId: row.id,
                storeId: row.storeId,
                reason: d.querySelector("textarea").value,
              })
            ) {
              d.close();
              ctx.render();
            }
          };
        }),
    );
  };
  const changeTab = (target) => {
    if (!allowed(s, target, ctx.workspace)) return;
    filters = filter();
    selectReportTab(target);
    ctx.render();
  };
  document.querySelectorAll("[data-report-tab]").forEach((button) => {
    button.onclick = () => changeTab(button.dataset.reportTab);
  });
  $("#report-picker").onchange = (event) => changeTab(event.target.value);
  $("#report-period").onchange = () => {
    if ($("#report-period").value !== "custom") {
      const f = periodRange($("#report-period").value, today());
      $("#report-from").value = f.from;
      $("#report-to").value = f.to;
    }
    page = 0;
    draw();
  };
  for (const k of ["from", "to", "store"])
    $("#report-" + k).onchange = () => {
      if (k !== "store") $("#report-period").value = "custom";
      page = 0;
      draw();
    };
  if (tab === "deliveries") {
    const update = () => {
      page = 0;
      draw();
    };
    $("#report-delivery-query").oninput = update;
    $("#report-delivery-status").onchange = update;
  }
  $("#report-refresh").onclick = async () => {
    try {
      if (tab === "batches") await refreshBatch();
      else {
        await ctx.refresh();
        ctx.render();
      }
    } catch (err) {
      ctx.toast(err.message);
    }
  };
  const exportFilters = () =>
    tab === "batches"
      ? {
          from: $("#batch-from").value,
          to: $("#batch-to").value,
          store: $("#batch-outlet").value,
          supplier: $("#batch-supplier").value,
          status: $("#batch-status").value,
          query: $("#batch-search").value.trim(),
        }
      : filters;
  const exportSheets = (f) => {
    if (tab === "cashflow") return flowSheets;
    if (tab === "batches") return batchReportSheets(s, f);
    if (tab === "deliveries")
      return [
        deliveryReport(s, f).sheet,
        {
          name: "Filter pengiriman",
          headers: ["Filter", "Pilihan"],
          rows: [
            ["Tanggal kirim (WIB)", f.from + " — " + f.to],
            [
              "Lokasi asal atau tujuan",
              f.store ? label(s, "stores", f.store) : "Semua lokasi",
            ],
            ["Status saat ini", transferStatus[f.status] || "Semua status"],
            ["Pencarian", f.query || "Semua kiriman"],
          ],
        },
      ];
    return reportSheets(s, f, tab);
  };
  $("#report-excel").onclick = () => {
    if ((tab !== "cashflow" || flowSheets) && valid()) {
      const f = exportFilters();
      downloadWorkbook(
        exportSheets(f),
        ["Laporan", tabs[tab], f.from, f.to].filter(Boolean).join("-"),
      );
    }
  };
  // Open synchronously to keep mobile popup blockers from swallowing the print action.
  $("#report-pdf").onclick = () => {
    if ((tab !== "cashflow" || flowSheets) && valid()) {
      try {
        const f = exportFilters();
        const h = f.store
            ? s.stores.find((t) => t.id === f.store)
            : { name: "MANIAC DUREN · SEMUA TOKO" },
          sheets = exportSheets(f);
        printWindow(
          "Laporan Maniac Duren",
          reportPrint(
            sheets,
            h,
            tab === "batches"
              ? `Jejak sepanjang umur batch · penerimaan ${f.from || "sejak awal"} hingga ${f.to || "sekarang"}`
              : tabs[tab] + " · " + f.from + " — " + f.to,
          ),
          true,
        );
      } catch (err) {
        ctx.toast(err.message);
      }
    }
  };
  draw();
}
function payerOptions(s, store) {
  const warehouse = s.stores.find((st) => st.id === store)?.locationType === "warehouse";
  return (
    '<option value="">Pilih sumber dana</option>' +
    fundingOptions(warehouse)
      .map((k) => `<option value="${k}">${e(fundingNames[k])}</option>`)
      .join("")
  );
}
export function expenseDialog(s, store, ctx, retailOnly = false) {
  const modern = s.pettyCashVersion >= 130;
  const locations =
    retailOnly || s.branchStockVersion >= 132
      ? s.stores.filter((t) => t.locationType === "store")
      : s.stores;
  if (!locations.length) return ctx.toast("Belum ada toko untuk biaya operasional.");
  if (!locations.some((t) => t.id === store))
    store = ctx.workspace === "backoffice" ? "" : locations[0].id;
  const funding = (key) => {
    if (!modern) return payerOptions(s, key);
    return locations.find((t) => t.id === key)?.locationType === "warehouse"
      ? '<option value="distribution">PT Distribusi</option>'
      : `<option value="retail">Saldo PT Retail · ${money(s.retailBalance)}</option>`;
  };
  const d = ctx.modal(
    "Pengeluaran operasional",
    `<p>Pembelian stok dicatat lewat penerimaan/pembelian barang. Jangan masukkan kembali di sini.</p>${expenseFields(`${field("Tanggal", `<input type="date" name="date" value="${today()}" max="${today()}" required>`)}${field("Toko", `<select name="storeId" required>${!store ? '<option value="">Pilih cabang</option>' : ""}${locations.map((t) => `<option value="${e(t.id)}" ${t.id === store ? "selected" : ""}>${e(t.name)}</option>`).join("")}</select>`)}${s.cashFlowVersion >= 127 ? field("Dibayar oleh", `<select name="funding" required>${funding(store)}</select>`) : ""}`)}`,
  );
  const form = d.querySelector("form");
  if (form.elements.funding) {
    const sync = () => {
      form.elements.funding.innerHTML = funding(form.elements.storeId.value);
    };
    form.elements.storeId.onchange = sync;
    sync();
  }
  const requestId = id();
  d.querySelector("form").onsubmit = async (ev) => {
    ev.preventDefault();
    const p = Object.fromEntries(new FormData(ev.currentTarget));
    if (
      await ctx.mutate("expense_save", { ...p, id: requestId, amount: Number(p.amount) })
    ) {
      d.close();
      ctx.render();
    }
  };
}
