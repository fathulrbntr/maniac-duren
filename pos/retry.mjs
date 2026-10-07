// Keep the same operation ID after an uncertain network result, including page reloads.
let KEY = "maniac-pos-pending-operation-v1";
let pending;
export function setRetryScope(scope) {
  KEY = "maniac-pos-pending-operation-v1:" + scope;
  try {
    pending = JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    pending = null;
  }
}
const tracked = new Set([
  "order_direct", "order_complete", "order_create", "order_start", "order_ready", "order_pay", "order_cancel", "sort", "inventory_loss", "recover", "employee_save", "attendance_in", "attendance_out", "work_hours_save",
  "sale",
  "receipt",
  "receipt_batch",
  "movement",
  "unit_receipt",
  "produce",
  "waste_process",
]);
const signature = (action, payload) =>
  JSON.stringify({ action, ...payload, id: undefined });
function persist() {
  try {
    if (pending) sessionStorage.setItem(KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* Retry remains safe during this open tab. */
  }
}
export function prepareRetry(action, payload) {
  if (!tracked.has(action)) return payload;
  const key = signature(action, payload);
  if (pending && pending.key !== key)
    throw Error(
      "Pengiriman sebelumnya belum pasti. Klik Perbarui stok untuk memeriksa status sebelum membuat transaksi berbeda.",
    );
  if (!pending) {
    pending = {
      key,
      id: payload.id,
      action,
      payload: structuredClone(payload),
    };
    persist();
  }
  return { ...payload, id: pending.id };
}
export const pendingRetry = () => pending;
export function settleRetry(action, uncertain = false) {
  if (pending?.action === action && !uncertain) {
    pending = null;
    persist();
  }
}
export function reconcileRetry(state) {
  if (!pending) return false;
  if (pending.action === 'receipt_batch') {
    if ((state.lots || []).some(row => row.shipmentId === pending.id)) {
      pending = null; persist(); return true;
    }
    return false;
  }
  const rows =
    {
      order_create: state.orders,
      sale: state.sales,
      receipt: state.lots,
      movement: state.movements,
      unit_receipt: state.unitLots,
      produce: state.productions,
      waste_process: state.wasteRuns,
    }[pending.action] || state.events || [];
  if (rows.some((row) => row.id === pending.id)) {
    pending = null;
    persist();
    return true;
  }
  return false;
}
