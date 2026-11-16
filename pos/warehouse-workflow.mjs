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
