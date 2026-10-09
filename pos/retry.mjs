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
  "reject_mark", "reject_process", "reject_coral", "reject_loss", "reject_void",
  "order_void", "discount_save", "cashier_approval_request", "cashier_approval_decide",
  "product_variants_save", "pos_category_save",
  "order_direct", "order_complete", "order_create", "order_start", "order_ready", "order_pay", "order_cancel", "sort", "inventory_loss", "recover", "employee_save", "attendance_in", "attendance_out", "work_hours_save",
  "sale",
  "receipt",
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
  const rows =
    {
      order_create: state.orders,
      sale: state.sales,
      receipt: state.lots,
      movement: state.movements,
      unit_receipt: state.unitLots,
      produce: state.productions,
      waste_process: state.wasteRuns,
      reject_mark: state.rejectRecords, reject_process: state.rejectRecords, reject_coral: state.rejectRecords, reject_loss: state.rejectRecords,
      cashier_approval_request: state.cashierApprovals,
    }[pending.action] || state.events || [];
  if (rows.some((row) => row.id === pending.id) || (pending.action==='reject_void'&&(state.rejectRecords||[]).some(r=>r.voidEventId===pending.id)) || (['order_void','order_cancel'].includes(pending.action)&&(state.orders||[]).some(o=>o.void_meta?.eventId===pending.id))) {
    pending = null;
    persist();
    return true;
  }
  return false;
}
