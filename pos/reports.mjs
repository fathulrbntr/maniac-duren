import { invoiceDate } from "./warehouse-workflow.mjs";
import { batchLocationRows, transferStatus } from "./warehouse-flow.mjs";
import { fruitStatus } from "./scale-label.mjs";
import { batchProfit } from "./batch-profit.mjs";
import { batchMetrics, batchStockCosts } from "./batch-metrics.mjs";
// One read-only reporting model shared by screen, Excel and PDF.
import { batchReports } from "./batch-report.mjs";
import { sources, financialSummary } from "./finance.mjs";
export const label = (s, key, id) =>
  s[key]?.find((x) => x.id === id)?.name || "Belum terpetakan";
export const isPaid = (o) =>
  o.status !== "cancelled" &&
  (o.payment_status === "paid" || (!o.payment_status && o.status === "paid"));
const n = (v) => Number(v) || 0;
const within = (d, f) => !!d && d >= f.from && d <= f.to;
const scope = (st, f) => !f.store || st === f.store;
export function periodRange(period, date) {
  const d = new Date(date + "T12:00:00Z");
  let from = date,
    to = date;
  if (period === "week") {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    from = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 6);
    to = d.toISOString().slice(0, 10);
  }
  if (period === "month") {
    from = date.slice(0, 8) + "01";
    d.setUTCMonth(d.getUTCMonth() + 1, 0);
    to = d.toISOString().slice(0, 10);
  }
  return { from, to };
}
export function transactions(s) {
  const rows = (s.orders || []).filter(isPaid).map((o) => ({
    id: o.id,
    date: o.paid_date || o.business_date,
    storeId: o.store_id,
    total: n(o.total),
    payment: o.payment,
    kind: "order",
    order: o,
    lines: o.lines.map((l) => ({
      ...l,
      name: l.name || label(s, "products", l.productId),
      total: n(l.qty) * n(l.price),
    })),
  }));
  const seen = new Set((s.orders || []).map((o) => o.id));
  for (const sale of s.sales || [])
    if (!sale.voided && !seen.has(sale.id)) {
      seen.add(sale.id);
      rows.push({
        ...sale,
        kind: "sale",
        lines: sale.lines.map((l) => ({
          ...l,
          name: label(s, "products", l.productId),
          qty: l.unit === "KG" ? n(l.kg) : n(l.pieces),
          unit: l.unit === "KG" ? "kg" : "butir",
        })),
      });
    }
  for (const t of rows) {
    const gross = t.lines.reduce((a, l) => a + n(l.total), 0);
    let allocated = 0;
    t.lines = t.lines.map((l, i) => {
      const revenue =
        i === t.lines.length - 1
          ? t.total - allocated
          : gross
            ? Math.round(((t.total * n(l.total)) / gross) * 100) / 100
            : 0;
      allocated += revenue;
      return { ...l, revenue };
    });
  }
  return rows;
}
export function salesReport(s, f) {
  const tx = transactions(s).filter((t) => scope(t.storeId, f) && within(t.date, f)),
    products = new Map(),
    stores = new Map(),
    days = new Map(),
    suppliers = new Map(),
    payments = new Map();
  const supplier = (key, amount, method) => {
    const k = (key || "unknown") + "|" + method;
    const r = suppliers.get(k) || {
      supplierId: key,
      name: key ? label(s, "suppliers", key) : "Belum terpetakan",
      method,
      revenue: 0,
    };
    r.revenue += amount;
    suppliers.set(k, r);
  };
  for (const t of tx) {
    const key = t.payment || "Tidak tercatat",
      pay = payments.get(key) || { name: key, total: 0, count: 0 };
    pay.total += t.total;
    pay.count++;
    payments.set(key, pay);
    const st = stores.get(t.storeId) || {
      id: t.storeId,
      name: label(s, "stores", t.storeId),
      total: 0,
      count: 0,
    };
    st.total += t.total;
    st.count++;
    stores.set(t.storeId, st);
    const day = days.get(t.date) || { date: t.date, total: 0, count: 0 };
    day.total += t.total;
    day.count++;
    days.set(t.date, day);
    for (const l of t.lines) {
      const unit = l.unit === "KG" ? "kg" : l.unit === "BUTIR" ? "butir" : l.unit;
      const key = l.productId + "|" + unit,
        r = products.get(key) || {
          id: l.productId,
          name: l.name,
          unit,
          qty: 0,
          kg: 0,
          pieces: 0,
          revenue: 0,
        };
      r.qty += n(l.qty);
      r.kg += n(l.kg);
      r.pieces += n(l.pieces);
      r.revenue += l.revenue;
      products.set(key, r);
      const lot = s.lots?.find((x) => x.id === l.lotId);
      if (t.kind === "sale" || l.itemType === "fruit") {
        supplier(l.supplierId || lot?.supplierId, l.revenue, "Langsung");
        continue;
      }
      const consumption = (t.order?.consumption || []).filter(
        (c) => c.lineId === l.lineId,
      );
      const origins = consumption.flatMap((c) => sources(s, c.lotId, n(c.qty)));
      if (!consumption.length || !origins.length) {
        supplier(null, l.revenue, "Belum terpetakan");
        continue;
      }
      const ids = new Set(origins.map((x) => x.supplierId));
      if (l.itemType !== "recipe" && ids.size === 1 && origins[0].supplierId) {
        supplier(origins[0].supplierId, l.revenue, "Langsung");
        continue;
      }
      const base = origins.reduce((a, x) => a + n(x.cost), 0);
      if (base <= 0 || origins.some((x) => x.cost == null)) {
        supplier(null, l.revenue, "Belum terpetakan");
        continue;
      }
      let part = 0;
      origins.forEach((x, i) => {
        const amount =
          i === origins.length - 1
            ? l.revenue - part
            : Math.round(((l.revenue * n(x.cost)) / base) * 100) / 100;
        part += amount;
        supplier(x.supplierId, amount, "Alokasi bahan");
      });
    }
  }
  return {
    tx,
    payments: [...payments.values()].sort((a, b) => b.total - a.total),
    total: tx.reduce((a, t) => a + t.total, 0),
    products: [...products.values()].sort((a, b) => b.revenue - a.revenue),
    stores: [...stores.values()].sort((a, b) => b.total - a.total),
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    suppliers: [...suppliers.values()].sort((a, b) => b.revenue - a.revenue),
  };
}
export function deliveryReport(s, f) {
  const notes = new Map(
    (s.branchNotes || [])
      .filter((note) => note.transferId)
      .map((note) => [note.transferId, note.number]),
  );
  const rows = [];
  const counts = { in_transit: 0, received: 0, cancelled: 0 };
  const query = (f.query || "").trim().toLowerCase();
  for (const transfer of s.transfers || []) {
    const sent = invoiceDate(transfer.createdAt);
    if (
      !within(sent, f) ||
      (f.store && transfer.sourceId !== f.store && transfer.targetId !== f.store)
    )
      continue;
    const status = transfer.status;
    if (f.status && status !== f.status) continue;
    const row = {
      id: transfer.id,
      sent,
      received: invoiceDate(transfer.receivedAt),
      note: notes.get(transfer.id) || "",
      document: transfer.deliveryNo,
      origin: transfer.origin?.name || label(s, "stores", transfer.sourceId),
      destination: transfer.destination?.name || label(s, "stores", transfer.targetId),
      status: transferStatus[status] || "Perlu diperiksa",
    };
    if (
      query &&
      ![row.document, row.note, row.origin, row.destination].some((v) =>
        v?.toLowerCase().includes(query),
      )
    )
      continue;
    if (Object.hasOwn(counts, status)) counts[status]++;
    rows.push(row);
  }
  rows.sort(
    (a, b) =>
      b.sent.localeCompare(a.sent) ||
      String(b.document).localeCompare(String(a.document)),
  );
  const sheet = {
    name: "Pengiriman",
    headers: [
      "Dikirim",
      "Surat jalan",
      "Nota transfer",
      "Asal",
      "Tujuan",
      "Status saat ini",
      "Diterima",
    ],
    rows: rows.map((r) => [
      r.sent,
      r.document,
      r.note,
      r.origin,
      r.destination,
      r.status,
      r.received,
    ]),
  };
  return { sheet, counts };
}
export function expenseReport(s, f) {
  const rows = [];
  for (const l of [...(s.lots || []), ...(s.unitLots || [])]) {
    if (
      l.sourceLotId ||
      !scope(l.storeId, f) ||
      !within(l.date, f) ||
      (l.receivedQty !== undefined && l.kind !== "purchase")
    )
      continue;
    const cost =
      l.totalCost ??
      (l.unitCost == null ? null : n(l.receivedQty ?? l.receivedKg) * n(l.unitCost));
    rows.push({
      id: l.id,
      date: l.date,
      storeId: l.storeId,
      category: "Pembelian barang",
      description: label(s, "products", l.productId),
      supplier: label(s, "suppliers", l.supplierId),
      amount: cost,
      reference: l.note || "",
      kind: "purchase",
    });
  }
  for (const x of s.expenses || [])
    if (!x.voided && scope(x.store_id, f) && within(x.date, f))
      rows.push({ ...x, storeId: x.store_id, kind: "expense" });
  return {
    rows: rows.sort((a, b) => b.date.localeCompare(a.date)),
    purchases: rows
      .filter((x) => x.kind === "purchase")
      .reduce((a, x) => a + n(x.amount), 0),
    operating: rows
      .filter((x) => x.kind === "expense")
      .reduce((a, x) => a + n(x.amount), 0),
    unknown: rows.filter((x) => x.amount == null).length,
    total: rows.reduce((a, x) => a + n(x.amount), 0),
  };
}
const actionLabels = {
  transfer_dispatch: "Dikirim dari lokasi asal",
  wholesale_sale: "Penjualan grosir",
  transfer_receive: "Diterima toko",
  transfer_cancel: "Pengiriman dibatalkan",
  receipt: "Barang datang",
  unit_receipt: "Barang datang",
  movement: "Transfer",
  unit_transfer: "Transfer",
  sale: "Terjual",
  order_create: "Terjual",
  order_direct: "Terjual",
  order_start: "Terjual / bahan pesanan",
  void: "Retur penjualan",
  order_void: "Retur / waste",
  reject_mark: "Reject",
  reject_process: "Olah reject",
  reject_coral: "Olah Coral",
  reject_loss: "Waste",
  inventory_loss: "Waste / susut",
  produce: "Produksi",
  production_void: "Batal produksi",
  reject_void: "Batal reject",
  waste_process: "Olah reject",
  recover: "Olah reject",
};
// One reject_mark can contain three fruit movements: -source, +reject,
// and -reject when processed immediately. Only -source marks new reject.
// Metadata wins over the lot's current quality; journal quality is the fallback.
function rejectMovement(j, events, lotById, records, voids) {
  const q = n(j.qty),
    event = events.get(j.event_id),
    undo = j.action === "reject_void";
  if (!["reject_mark", "reject_process", "reject_void"].includes(j.action))
    return { delta: 0, label: actionLabels[j.action] || j.action };
  const record = undo
    ? voids.get(j.event_id) || records.get(event?.payload?.recordId)
    : records.get(j.event_id);
  const original = undo ? events.get(record?.id || event?.payload?.recordId) : event;
  const payload = original?.payload || {},
    action = undo ? original?.action : j.action;
  const isMark = ["mark", "direct"].includes(record?.kind) || action === "reject_mark";
  const isProcess = record?.kind === "process" || action === "reject_process";
  const source = record?.sourceLotId || payload.sourceLotId,
    target = record?.rejectLotId || payload.rejectLotId;
  const lot = lotById.get(j.lot_id),
    quality = j.quality ?? lot?.quality;
  const isSource = source ? j.lot_id === source : ["ready", "unripe"].includes(quality);
  const isReject = target ? j.lot_id === target : quality === "reject";
  if (isMark) {
    if (isSource && (undo ? q > 0 : q < 0))
      return {
        delta: -q,
        label: undo ? "Batal penandaan reject" : "Ditandai reject (stok asal)",
      };
    if (isReject)
      return {
        delta: 0,
        label: undo
          ? q < 0
            ? "Batal masuk stok reject"
            : "Bahan olahan kembali ke reject"
          : q > 0
            ? "Masuk stok reject"
            : "Reject dipakai untuk olahan",
      };
    if (undo ? q < 0 : q > 0)
      return {
        delta: 0,
        label: undo ? "Batal hasil olahan reject" : "Hasil olahan reject",
      };
    return { delta: 0, label: "Reject — periksa asal pergerakan", unknown: true };
  }
  if (isProcess)
    return {
      delta: 0,
      label: undo
        ? q > 0
          ? "Bahan olahan kembali ke reject"
          : "Batal hasil olahan reject"
        : q < 0
          ? "Reject dipakai untuk olahan"
          : "Hasil olahan reject",
    };
  return {
    delta: 0,
    label: actionLabels[j.action] || j.action,
    unknown: undo && !record && !original,
  };
}
export function stockReport(s, f) {
  const events = new Map((s.events || []).map((x) => [x.id, x])),
    lots = [...(s.lots || []), ...(s.unitLots || [])],
    groups = new Map(),
    details = [];
  const lotById = new Map(lots.map((l) => [l.id, l])),
    records = new Map((s.rejectRecords || []).map((r) => [r.id, r])),
    voids = new Map(
      (s.rejectRecords || []).filter((r) => r.voidEventId).map((r) => [r.voidEventId, r]),
    );
  let rejectUnclassified = 0;
  const row = (productId, storeId, unit) => {
    const key = [productId, storeId, unit].join("|");
    if (!groups.has(key))
      groups.set(key, {
        productId,
        storeId,
        name: label(s, "products", productId),
        store: label(s, "stores", storeId),
        unit,
        opening: 0,
        incoming: 0,
        sold: 0,
        rejected: 0,
        loss: 0,
        transferIn: 0,
        transferOut: 0,
        other: 0,
        closing: 0,
        current: 0,
        rejectCurrent: 0,
        pieces: 0,
      });
    return groups.get(key);
  };
  const journal = (s.journal || []).map((j) => ({
    ...j,
    date: j.date || events.get(j.event_id)?.business_date || "",
    action: j.action || events.get(j.event_id)?.action || "unknown",
  }));
  const recordedLots = new Set(journal.map((j) => j.lot_id));
  const positiveLots = new Set(journal.filter((j) => j.qty > 0).map((j) => j.lot_id));
  // Older lots might precede the stock journal. Backfill only missing receipt entries.
  for (const l of lots) {
    if (!scope(l.storeId, f)) continue;
    const unit = l.kg !== undefined ? "kg" : l.unit;
    const r = row(l.productId, l.storeId, unit);
    r.current += n(l.kg ?? l.qty);
    r.pieces += n(l.pieces);
    if (l.quality === "reject") r.rejectCurrent += n(l.kg);
    if (!positiveLots.has(l.id)) {
      const movement = (s.movements || []).find((m) => m.id === l.id),
        date = movement?.date || l.date;
      journal.push({
        lot_id: l.id,
        product_id: l.productId,
        store_id: l.storeId,
        supplier_id: l.supplierId,
        qty: n(l.receivedKg ?? l.receivedQty),
        pieces: n(l.receivedPieces),
        unit,
        date,
        action: l.sourceLotId
          ? "movement"
          : l.kg !== undefined || l.kind === "purchase"
            ? "receipt"
            : "opening",
      });
    }
  }
  for (const j of journal) {
    if (!scope(j.store_id, f)) continue;
    const r = row(j.product_id, j.store_id, j.unit),
      q = n(j.qty);
    if (j.date > f.to) r.closing -= q;
    if (within(j.date, f)) {
      let bucket = "other";
      if (["receipt", "unit_receipt"].includes(j.action))
        bucket = q > 0 ? "incoming" : "other";
      else if (j.action === "transfer_dispatch" || j.action === "transfer_cancel")
        bucket = "transferOut";
      else if (j.action === "transfer_receive") bucket = "transferIn";
      else if (["movement", "unit_transfer"].includes(j.action))
        bucket = q > 0 ? "transferIn" : "transferOut";
      else if (
        [
          "sale",
          "wholesale_sale",
          "order_create",
          "order_direct",
          "order_start",
          "void",
          "order_void",
        ].includes(j.action)
      )
        bucket = "sold";
      else if (["inventory_loss", "reject_loss"].includes(j.action)) bucket = "loss";
      // Count marking once, and reverse it on the cancellation date. Processing
      // still affects the stock balance through its original signed journal rows.
      const reject = rejectMovement(j, events, lotById, records, voids);
      r.rejected += reject.delta;
      if (reject.unknown) rejectUnclassified++;
      r[bucket] +=
        bucket === "sold" || bucket === "loss" || bucket === "transferOut" ? -q : q;
      details.push({
        ...j,
        product: label(s, "products", j.product_id),
        store: label(s, "stores", j.store_id),
        supplier: label(s, "suppliers", j.supplier_id),
        label: reject.label,
      });
    }
  }
  for (const r of groups.values()) {
    r.closing += r.current;
    const delta = r.incoming - r.sold - r.loss + r.transferIn - r.transferOut + r.other;
    r.opening = r.closing - delta;
  }
  return {
    rows: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
    details: details.sort((a, b) => b.date.localeCompare(a.date)),
    rejectUnclassified,
    incomplete:
      journal.some((j) => scope(j.store_id, f) && !j.date) ||
      lots.some((l) => scope(l.storeId, f) && !recordedLots.has(l.id)),
  };
}

export function marginReport(s, f) {
  const places = new Set((s.stores || []).map((row) => row.id));
  const tx = transactions(s).filter(
    (t) => places.has(t.storeId) && scope(t.storeId, f) && within(t.date, f),
  );
  const { lines, totals } = financialSummary(s, f, tx);
  const rows = lines.map(({ transaction: t, line, cost }) => {
    const used = line?.lineId
      ? (t.order?.consumption || []).filter((c) => c.lineId === line.lineId)
      : [];
    return {
      date: t.date,
      storeId: t.storeId,
      name: line?.name || "Transaksi tanpa rincian produk",
      revenue: line?.revenue ?? t.total,
      cost,
      recovered: used.some((c) =>
        sources(s, c.lotId, c.qty).some((origin) => origin.recovered),
      ),
    };
  });
  return {
    rows,
    unknown: totals.unknownCogs + totals.unknownLoss + totals.unknownOperating,
    revenue: tx.reduce((sum, t) => sum + t.total, 0),
    cogs: totals.knownCogs,
    loss: totals.knownLoss,
    operating: totals.operating,
    result: totals.result,
  };
}

export function reportSheets(s, f, selected = "summary") {
  const all = selected === "summary";
  const sheets = [];
  let st;
  const add = (name, headers, rows) => sheets.push({ name, headers, rows });
  if (
    (!s.access || s.access.reports) &&
    (all || ["products", "stores", "suppliers", "payments"].includes(selected))
  ) {
    const a = salesReport(s, f);
    if (all)
      add(
        "Ringkasan",
        ["Tanggal", "Transaksi", "Penjualan bersih"],
        a.days.map((r) => [r.date, r.count, r.total]),
      );
    if (all || selected === "products")
      add(
        "Produk",
        ["Produk", "Satuan", "Jumlah", "Kg aktual", "Butir aktual", "Penjualan bersih"],
        a.products.map((r) => [r.name, r.unit, r.qty, r.kg, r.pieces, r.revenue]),
      );
    if (all || selected === "stores")
      add(
        "Toko",
        ["Toko", "Transaksi", "Penjualan bersih"],
        a.stores.map((r) => [r.name, r.count, r.total]),
      );
    if (all || selected === "suppliers")
      add(
        "Supplier",
        ["Supplier", "Metode", "Penjualan bersih"],
        a.suppliers.map((r) => [r.name, r.method, r.revenue]),
      );
    if (all || selected === "payments")
      add(
        "Pembayaran",
        ["Metode pembayaran", "Transaksi", "Penjualan bersih"],
        a.payments.map((r) => [r.name, r.count, r.total]),
      );
    if (all)
      add(
        "Transaksi",
        ["Tanggal", "ID transaksi", "Toko", "Pembayaran", "Penjualan bersih"],
        a.tx.map((t) => [
          t.date,
          t.id,
          label(s, "stores", t.storeId),
          t.payment,
          t.total,
        ]),
      );
  }
  if (
    all &&
    s.warehouseVersion >= 107 &&
    !s.stockDemo &&
    (s.access?.trace || s.access?.reports)
  )
    sheets.push(deliveryReport(s, f).sheet);
  if ((!s.access || s.access.trace) && (all || selected === "stock")) {
    st = stockReport(s, f);
    add(
      "Stok",
      [
        "Produk",
        "Toko",
        "Satuan",
        "Awal periode*",
        "Barang datang",
        "Terjual/bahan pesanan",
        "Reject ditandai**",
        "Waste",
        "Transfer masuk",
        "Transfer keluar",
        "Produksi/koreksi",
        "Akhir periode*",
        "Stok sekarang",
        "Reject sekarang",
        "Butir sekarang",
      ],
      st.rows.map((r) => [
        r.name,
        r.store,
        r.unit,
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
        r.pieces,
      ]),
    );
    add(
      "Jejak stok",
      [
        "Tanggal",
        "Kegiatan",
        "Produk",
        "Toko",
        "Supplier",
        "Lot",
        "Perubahan",
        "Butir",
        "Satuan",
      ],
      st.details.map((r) => [
        r.date,
        r.label,
        r.product,
        r.store,
        r.supplier,
        r.lot_id,
        n(r.qty),
        n(r.pieces),
        r.unit,
      ]),
    );
  }
  if ((!s.access || s.access.finance) && (all || selected === "margin")) {
    const m = marginReport(s, f);
    add(
      "HPP dan hasil",
      [
        "Penjualan",
        "HPP tercatat",
        "Waste tercatat",
        "Operasional",
        "Hasil setelah biaya",
        "Biaya belum lengkap",
      ],
      [
        [
          m.revenue,
          m.cogs,
          m.loss,
          m.operating ?? "Belum lengkap",
          m.result ?? "Belum lengkap",
          m.unknown,
        ],
      ],
    );
    add(
      "Margin produk",
      [
        "Tanggal",
        "Toko",
        "Produk",
        "Penjualan",
        "HPP",
        "Laba kotor",
        "Memakai olahan reject",
      ],
      m.rows.map((r) => [
        r.date,
        label(s, "stores", r.storeId),
        r.name,
        r.revenue,
        r.cost ?? "Belum diketahui",
        r.cost == null ? "Belum diketahui" : r.revenue - r.cost,
        r.recovered ? "Ya" : "Tidak",
      ]),
    );
  }
  if ((!s.access || s.access.finance) && (all || selected === "expenses"))
    add(
      "Pengeluaran",
      ["Tanggal", "Toko", "Kategori", "Keterangan", "Supplier", "Nominal", "Referensi"],
      expenseReport(s, f).rows.map((r) => [
        r.date,
        label(s, "stores", r.storeId),
        r.category,
        r.description,
        r.supplier || "",
        r.amount ?? "Belum diketahui",
        r.reference,
      ]),
    );
  add(
    "Keterangan",
    ["Keterangan", "Nilai"],
    [
      ["Periode", f.from + " s.d. " + f.to],
      ["Toko", f.store ? label(s, "stores", f.store) : "Semua toko yang dapat diakses"],
      [
        "Penjualan",
        "Transaksi penjualan aktif, termasuk wholesale terkirim yang belum lunas, setelah diskon; pembatalan dikeluarkan dari periode penjualan asal.",
      ],
      [
        "Supplier",
        "Alokasi bahan memakai proporsi modal; belum terpetakan tetap ditampilkan.",
      ],
      [
        "Pengeluaran",
        "Biaya pembelian termasuk ongkir + operasional. PO, invoice, transfer, HPP, dan waste tidak dijumlahkan ulang. Bukan laporan arus kas pembayaran utang.",
      ],
      [
        "Stok *",
        "Awal/akhir direkonstruksi dari stok sekarang dan jurnal. Riwayat sebelum jurnal atau koreksi lama yang tidak tercatat perlu rekonsiliasi.",
      ],
      [
        "Reject **",
        "Buah yang ditandai reject, dikurangi pembatalan pada periode ini. Perubahan kualitas dihitung sekali; pemakaian untuk olahan tidak dihitung ulang. Bisa berasal dari stok awal. Nilai negatif berarti pembatalan melebihi penandaan pada periode ini.",
      ],
      ...(st
        ? [
            [
              "Kelengkapan reject",
              st.rejectUnclassified
                ? st.rejectUnclassified + " baris belum terpetakan; periksa jejak stok."
                : "Pergerakan reject terpetakan.",
            ],
          ]
        : []),
      [
        "Stok fisik",
        "Terjual/bahan pesanan mengikuti tanggal pemotongan stok, dapat berbeda dari tanggal pembayaran.",
      ],
    ],
  );
  return sheets;
}

export function batchReportSheets(s, f = {}) {
  const rows = batchReports(s).filter(
    (r) =>
      (!f.store || r.relatedStores.has(f.store)) &&
      (!f.supplier || r.root.supplierId === f.supplier) &&
      (!f.from || r.root.date >= f.from) &&
      (!f.to || r.root.date <= f.to) &&
      (!f.status || r.status === f.status) &&
      (!f.query ||
        [label(s, "products", r.root.productId), r.root.note, r.root.id]
          .join(" ")
          .toLowerCase()
          .includes(f.query.toLowerCase())),
  );
  const finance = !s.access || s.access.finance;
  const sheets = [
    {
      name: "Batch supplier",
      headers: [
        "Batch",
        "Tanggal masuk",
        "Produk",
        "Supplier",
        "Kg diterima",
        "Butir diterima",
        "Siap kg",
        "Dalam perjalanan kg",
        "Reject kg",
        "Terjual kg",
        "Terjual butir",
        "Stok ekuivalen asal",
        "Selisih belum terjelaskan",
        "Status",
        ...(finance
          ? ["Penjualan langsung", "Alokasi penjualan olahan", "Modal awal"]
          : []),
      ],
      rows: rows.map((r) => [
        r.root.id,
        r.root.date,
        label(s, "products", r.root.productId),
        label(s, "suppliers", r.root.supplierId),
        r.root.receivedKg,
        r.root.receivedPieces,
        r.readyKg,
        r.transitKg || 0,
        r.rejectKg,
        r.soldKg,
        r.soldPieces,
        r.remainingEquivalent,
        r.untraced,
        {
          scope: "Lintas akses toko",
          review: "Perlu diperiksa",
          active: "Aktif",
          closed: "Selesai",
        }[r.status],
        ...(finance
          ? [
              r.fruitRevenue,
              r.revenueIncomplete ? "Belum lengkap" : r.allocatedRevenue,
              r.totalCost ?? "Belum diketahui",
            ]
          : []),
      ]),
    },
    {
      name: "Keterangan",
      headers: ["Keterangan", "Nilai"],
      rows: [
        ["Periode penerimaan", (f.from || "Awal") + " s.d. " + (f.to || "Sekarang")],
        [
          "Cakupan",
          "Jejak sepanjang umur batch yang tanggal penerimaannya masuk filter.",
        ],
        [
          "Stok ekuivalen",
          "Perkiraan bagian buah asal pada produk turunan; bukan satuan stok fisik produk turunan.",
        ],
        [
          "Alokasi olahan",
          "Menurut proporsi modal; angka yang belum lengkap tidak dianggap nol.",
        ],
        [
          "Rasio berat",
          "Persentase dari berat aktual penerimaan. Indikator saling beririsan: reject dapat diolah, hasil/kulit adalah rincian input pengolahan. Seluruh persentase tidak untuk dijumlahkan.",
        ],
        [
          "Kulit / sisa",
          "Selisih input dan hasil pengolahan buah; bukan berat kulit yang ditimbang secara terpisah. Biji/sisa Coral ditampilkan terpisah.",
        ],
        [
          "Modal satuan produk",
          "Biaya seluruh bahan produk per satuan; modal bagian batch hanya kontribusi batch asal. Belum termasuk biaya operasional.",
        ],
      ],
    },
  ];
  const known = (v) => (v == null ? "Belum diketahui" : v);
  if (s.warehouseVersion)
    sheets.splice(sheets.length - 1, 0, {
      name: "Lokasi barcode batch",
      headers: ["Batch asal", "Produk", "Lokasi / rute", "Status", "Kg", "Butir"],
      rows: rows.flatMap((r) =>
        batchLocationRows(s, r.root.id).map((x) => [
          r.root.id,
          label(s, "products", r.root.productId),
          x.place,
          fruitStatus[x.status] || x.status,
          x.kg,
          x.pieces,
        ]),
      ),
    });
  sheets.splice(1, 0, {
    name: "Rasio batch",
    headers: [
      "Batch",
      "Produk asal",
      "Indikator",
      "Berat kg",
      "Dasar kg",
      "Persentase (%)",
      "Keterangan",
    ],
    rows: rows.flatMap((r) => {
      const m = batchMetrics(r),
        prefix = [r.root.id, label(s, "products", r.root.productId)];
      return [
        ...m.rows.map((x) => [
          ...prefix,
          x.label,
          known(x.kg),
          known(m.baseKg),
          known(x.percent),
          x.hint + (r.scopeIncomplete ? " Cakupan outlet belum lengkap." : ""),
        ]),
        ...(m.processedKg > 0
          ? [
              [
                ...prefix,
                "Rendemen hasil olahan buah",
                known(m.outputKg),
                m.processedKg,
                known(m.yieldPercent),
                "Dasar: buah masuk pengolahan.",
              ],
              [
                ...prefix,
                "Rasio kulit / sisa pengolahan",
                known(m.skinKg),
                m.processedKg,
                known(m.skinPercent),
                "Dasar: buah masuk pengolahan.",
              ],
            ]
          : []),
        ...(m.coralKg > 0
          ? [
              [
                ...prefix,
                "Hasil daging dari Coral",
                known(m.fleshKg),
                m.coralKg,
                known(m.fleshPercent),
                "Tahap kedua; dasar input Coral.",
              ],
              [
                ...prefix,
                "Biji / sisa Coral",
                known(m.seedKg),
                m.coralKg,
                known(m.seedPercent),
                "Tahap kedua; dasar input Coral.",
              ],
            ]
          : []),
      ];
    }),
  });
  sheets.splice(2, 0, {
    name: "Stok turunan batch",
    headers: [
      "Batch asal",
      "Produk",
      "Outlet",
      "Lot",
      "Sisa fisik",
      "Satuan",
      "Campuran",
      ...(finance ? ["Modal per satuan produk", "Modal bagian batch"] : []),
    ],
    rows: rows.flatMap((r) =>
      r.stock.map((stock) => {
        const l = stock.lot,
          c = batchStockCosts(r, stock);
        return [
          r.root.id,
          label(s, "products", l.productId),
          l.locationLabel || label(s, "stores", l.storeId),
          l.id,
          l.kg ?? l.qty,
          c.unit,
          stock.mixed ? "Ya" : "Tidak",
          ...(finance ? [known(c.unitCost), known(c.batchCost)] : []),
        ];
      }),
    ),
  });
  if (finance) {
    const profits = rows.map((r) => ({ r, p: batchProfit(s, r) }));
    sheets.splice(sheets.length - 1, 0, {
      name: "Laba rugi batch",
      headers: [
        "Batch",
        "Produk asal",
        "Penjualan bersih bagian batch",
        "Modal terjual",
        "Waste tercatat",
        "Laba rugi berjalan",
        "Status hasil",
        "Modal stok tersisa",
        "Modal reject menunggu",
        "Estimasi omzet stok",
        "Estimasi laba rugi stok",
        "Estimasi hasil akhir batch",
        "Keterangan",
      ],
      rows: profits.map(({ r, p }) => [
        r.root.id,
        label(s, "products", r.root.productId),
        known(p.revenue),
        known(p.cogs),
        known(p.loss),
        p.realized ?? "Belum lengkap",
        p.status,
        known(p.capital),
        known(p.rejectCapital),
        known(p.stockRevenue),
        p.stockProfit ?? "Belum lengkap",
        p.projected ?? "Belum lengkap",
        [
          ...p.issues,
          ...(p.missingPrices ? [p.missingPrices + " lot belum dapat diestimasi."] : []),
        ].join(" "),
      ]),
    });
    sheets.splice(sheets.length - 1, 0, {
      name: "Estimasi stok batch",
      headers: [
        "Batch",
        "Produk",
        "Outlet",
        "Lot",
        "Jumlah",
        "Satuan",
        "Harga jual master per satuan",
        "Modal bagian batch",
        "Estimasi omzet bagian batch",
        "Estimasi laba rugi bagian batch",
        "Keterangan",
      ],
      rows: profits.flatMap(({ r, p }) =>
        p.stocks.map((x) => [
          r.root.id,
          label(s, "products", x.lot.productId),
          label(s, "stores", x.lot.storeId),
          x.lot.id,
          known(x.quantity),
          x.unit,
          known(x.price),
          known(x.batchCost),
          known(x.revenue),
          x.profit ?? "Belum lengkap",
          x.reason,
        ]),
      ),
    });
    sheets
      .at(-1)
      .rows.push(
        [
          "Laba/rugi berjalan",
          "Penjualan bersih bagian batch − modal terjual − waste tercatat. Stok tersisa tetap menjadi persediaan; bukan otomatis kerugian. Belum termasuk operasional.",
        ],
        [
          "Estimasi stok",
          "Harga master saat laporan diperbarui: buah per kg, olahan per satuan stok. Tanpa diskon, operasional atau susut di masa depan. Bahan mentah dan reject menunggu tidak dianggap barang siap jual.",
        ],
        [
          "Estimasi hasil akhir",
          "Laba/rugi berjalan + estimasi laba/rugi stok tersisa. Bukan laba aktual. Modal produk campuran dialokasikan ke batch menurut kontribusi modal bahan.",
        ],
        [
          "Susut proses",
          "Kulit/susut sudah diserap modal hasil olahan; tidak dikurangi lagi sebagai waste jika masih menghasilkan stok.",
        ],
      );
  }

  return sheets;
}
