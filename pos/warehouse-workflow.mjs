export const workflowActions = [
  "receipt_expected_edit",
  "receipt_reopen",
  "receipt_scan",
  "receipt_scan_remove",
  "receipt_pause",
  "receipt_resume",
  "receipt_finish",
  "outbound_save",
  "outbound_scan",
  "outbound_scan_remove",
  "outbound_ready",
  "outbound_repack",
  "outbound_issue",
  "outbound_dispatch",
  "outbound_payment",
  "outbound_cancel",
];
export const workflowReady = (s) => s.warehouseWorkflowVersion >= 114 && !s.stockDemo;
export const backOffice = (s, space) =>
  !!s.access?.backoffice && (space === undefined || space === "backoffice");
export const receiptStatuses = {
  open: "Menunggu / sedang ditimbang",
  paused: "Dijeda",
  completed: "Penerimaan selesai",
  reopened: "Dibuka kembali",
};
export const outboundStatuses = {
  packing: "Scan penyiapan",
  ready: "Menunggu Back Office",
  approved: "Siap dikirim",
  dispatched: "Sudah dikirim",
  cancelled: "Dibatalkan",
};
export function receiptTotals(p, productId) {
  const scans = (p.receiving?.scans || []).filter(
    (x) => !productId || x.productId === productId,
  );
  return {
    kg: scans.reduce((n, x) => n + Number(x.grams), 0) / 1000,
    pieces: scans.length,
  };
}
export function receiptVariance(p, productId) {
  const actual = receiptTotals(p, productId),
    expected = p.expected?.[productId];
  const ready = p.receiving?.status === "completed";
  if (!ready || !expected || !(expected.kg > 0) || !(expected.pieces > 0))
    return {
      actual,
      expected: expected || null,
      ready,
      kg: null,
      pieces: null,
      percent: null,
    };
  const kg = Math.round((expected.kg - actual.kg) * 1000) / 1000;
  return {
    actual,
    expected,
    ready,
    kg,
    pieces: expected.pieces - actual.pieces,
    percent: (kg / expected.kg) * 100,
  };
}
export function outboundBalance(o) {
  const total = Number(o.total || 0),
    paid = Number(o.paid || 0);
  return {
    total,
    paid,
    remaining: Math.max(0, total - paid),
    label: !o.invoiceNo
      ? "Belum terbit"
      : paid >= total
        ? "Lunas"
        : paid > 0
          ? "Dibayar sebagian"
          : "Pending payment",
  };
}
const pendingKey = (s, key) =>
  `maniac-warehouse-pending-v1:${s.me?.userId || s.me?.id}:${key}`;
export function loadWorkflowPending(s, key, storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(pendingKey(s, key)) || "null");
  } catch {
    return null;
  }
}
export function clearWorkflowPending(s, key, storage = globalThis.localStorage) {
  storage.removeItem(pendingKey(s, key));
}
export async function saveWorkflow(
  s,
  key,
  ctx,
  action,
  payload,
  storage = globalThis.localStorage,
) {
  const previous = loadWorkflowPending(s, key, storage);
  const signature = (p) => JSON.stringify({ ...p, id: undefined });
  if (
    previous &&
    (previous.action !== action || signature(previous.payload) !== signature(payload))
  )
    throw Error(
      "Ada penyimpanan belum pasti. Perbarui lalu gunakan Kirim ulang terlebih dahulu.",
    );
  const request = previous || { action, payload };
  storage.setItem(pendingKey(s, key), JSON.stringify(request));
  try {
    await ctx.mutate(request.action, request.payload, { throwOnError: true });
    clearWorkflowPending(s, key, storage);
  } catch (error) {
    if (error.definitive) clearWorkflowPending(s, key, storage);
    throw error;
  }
}

// Invoice reporting uses the issue date in Jakarta, never creation/shipping/payment dates.
export const invoicePeriods = {
  all: "Semua periode",
  today: "Hari ini",
  week: "Minggu ini",
  month: "Bulan ini",
  custom: "Rentang tanggal",
};
const dateOnly = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : "";
};
export function invoiceDate(value) {
  if (!value) return "";
  if (dateOnly(value)) return value;
  // Server timestamptz must carry a timezone; don't interpret an ambiguous local time.
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
    : "";
}
export function invoicePeriod(filters, day) {
  if (filters.period === "all") return { from: "", to: "", error: "" };
  if (filters.period === "custom") {
    const from = dateOnly(filters.from),
      to = dateOnly(filters.to);
    return {
      from,
      to,
      error:
        !from || !to
          ? "Isi tanggal awal dan tanggal akhir yang valid."
          : from > to
            ? "Tanggal awal tidak boleh melewati tanggal akhir."
            : "",
    };
  }
  if (!dateOnly(day))
    return { from: "", to: "", error: "Tanggal hari ini tidak tersedia." };
  const date = new Date(day + "T00:00:00Z");
  if (filters.period === "week") {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const from = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 6);
    return { from, to: date.toISOString().slice(0, 10), error: "" };
  }
  if (filters.period === "month") {
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    return {
      from: day.slice(0, 8) + "01",
      to: date.toISOString().slice(0, 10),
      error: "",
    };
  }
  return { from: day, to: day, error: "" };
}
export function invoicePaymentStatus(o) {
  if (
    o.total == null ||
    o.paid == null ||
    !Number.isFinite(Number(o.total)) ||
    !Number.isFinite(Number(o.paid)) ||
    Number(o.total) < 0 ||
    Number(o.paid) < 0
  )
    return "unknown";
  const total = Math.round(Number(o.total) * 100),
    paid = Math.round(Number(o.paid) * 100);
  return paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
}
export function outboundInvoiceView(
  orders,
  filters,
  day,
  { finance = true, transfers = [] } = {},
) {
  const period = invoicePeriod(filters, day);
  const cancelledIds = new Set(
    transfers.filter((t) => t.status === "cancelled").map((t) => t.id),
  );
  const groups = { issued: [], drafts: [], cancelled: [] };
  for (const o of orders) {
    if (o.status === "cancelled" || cancelledIds.has(o.id)) groups.cancelled.push(o);
    else if (o.invoiceNo) groups.issued.push(o);
    else groups.drafts.push(o);
  }
  const sorted = (rows, key) =>
    [...rows].sort(
      (a, b) =>
        String(b[key] || "").localeCompare(String(a[key] || "")) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const missingDates = groups.issued.filter((o) => !invoiceDate(o.issuedAt)).length;
  const active = period.error
    ? []
    : sorted(
        groups.issued.filter((o) => {
          const date = invoiceDate(o.issuedAt);
          return (
            (!period.from && !period.to) ||
            (!!date && date >= period.from && date <= period.to)
          );
        }),
        "issuedAt",
      );
  const summary =
    finance && !period.error
      ? active.reduce(
          (sum, o) => {
            if (invoicePaymentStatus(o) === "unknown") {
              sum.incomplete = true;
              return sum;
            }
            sum.total += Math.round(Number(o.total) * 100);
            sum.paid += Math.round(Number(o.paid) * 100);
            return sum;
          },
          { total: 0, paid: 0, incomplete: false },
        )
      : null;
  if (summary) {
    summary.remaining = (summary.total - summary.paid) / 100;
    summary.total /= 100;
    summary.paid /= 100;
  }
  return {
    period,
    missingDates,
    summary,
    activeCount: active.length,
    issued: active.filter(
      (o) =>
        !finance ||
        !filters.payment ||
        filters.payment === "all" ||
        (filters.payment === "paid"
          ? invoicePaymentStatus(o) === "paid"
          : ["unpaid", "partial"].includes(invoicePaymentStatus(o))),
    ),
    drafts: sorted(groups.drafts, "createdAt"),
    cancelled: sorted(groups.cancelled, "createdAt"),
  };
}
const invoiceFilterCache = new Map();
const filterKey = (s, store, space) =>
  `maniac-invoice-filters-v1:${s.me?.userId || s.me?.id || "anonymous"}:${space || "default"}:${store}`;
const cleanInvoiceFilters = (value = {}) => ({
  period: Object.hasOwn(invoicePeriods, value?.period) ? value.period : "all",
  payment: ["all", "paid", "unpaid"].includes(value?.payment) ? value.payment : "all",
  from: dateOnly(value?.from),
  to: dateOnly(value?.to),
});
export function loadInvoiceFilters(s, store, space, storage = globalThis.sessionStorage) {
  const key = filterKey(s, store, space);
  try {
    return cleanInvoiceFilters(JSON.parse(storage.getItem(key) || "null"));
  } catch {
    return cleanInvoiceFilters(invoiceFilterCache.get(key));
  }
}
export function saveInvoiceFilters(
  s,
  store,
  space,
  filters,
  storage = globalThis.sessionStorage,
) {
  const key = filterKey(s, store, space),
    value = cleanInvoiceFilters(filters);
  invoiceFilterCache.set(key, value);
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* Keep filters in this session's memory if browser storage is disabled. */
  }
  return value;
}
