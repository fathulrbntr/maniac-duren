import { sumProducts } from "./decimal-totals.mjs";
export const supplierNoteActions = [
  "supplier_note_cancel",
  "supplier_note_correct",
  "supplier_note_payment",
  "supplier_note_payment_void",
  "supplier_note_confirm_unpaid",
];
export const noteReady = (s) => s.supplierNotesVersion >= 112 && !s.stockDemo;
export const noteOwner = (s) => noteReady(s) && s.me?.role === "owner";
export const noteCanPay = (s) =>
  noteReady(s) && !!s.access?.backoffice && !!s.access?.finance;
// Use the received batch's landed cost and original quantities. Current stock
// changes after sales/transfers; payments do not change the cost basis.
export function noteUnitCosts(batch) {
  const numeric = (value) =>
    value == null || typeof value === "boolean" || String(value).trim() === ""
      ? NaN
      : Number(value);
  const total = numeric(batch?.totalCost);
  const per = (quantity) => {
    const qty = numeric(quantity);
    const value = total / qty;
    return Number.isFinite(total) &&
      total >= 0 &&
      qty > 0 &&
      Number.isFinite(qty) &&
      Number.isFinite(value)
      ? value
      : null;
  };
  return {
    perKg: per(batch?.receivedKg),
    perPiece: Number.isInteger(numeric(batch?.receivedPieces))
      ? per(batch?.receivedPieces)
      : null,
  };
}
export function fruitBatchCosts(lot) {
  const perKg = lot.unitCost ?? noteUnitCosts(lot).perKg;
  const perPiece =
    perKg != null && lot.receivedKg > 0 && lot.receivedPieces > 0
      ? (perKg * lot.receivedKg) / lot.receivedPieces
      : null;
  return { perKg, perPiece };
}
export function cancellationBlock(note) {
  if (note.cancelled) return "Nota sudah dibatalkan.";
  if (note.receivedId || !["open", "paused"].includes(note.receiving?.status))
    return "Stok sudah dibukukan atau sesi penerimaan tidak tersedia.";
  if (note.payments?.some((p) => !p.voided))
    return "Masih ada pembayaran nota atau ongkir yang aktif.";
  if (!note.invoiceTracked || (Number(note.shippingCost) > 0 && !note.shippingTracked))
    return "Pastikan dulu status pembayaran nota dan ongkir.";
  return "";
}
export function noteBalance(note, component) {
  const total =
    component === "shipping"
      ? Number(note.shippingCost)
      : sumProducts(note.lines.map((l) => [l.purchaseCost]));
  const paid = sumProducts(
    (note.payments || [])
      .filter((p) => p.component === component && !p.voided)
      .map((p) => [p.amount]),
  );
  if (note.cancelled)
    return { total, paid, remaining: 0, status: "cancelled", label: "Dibatalkan" };
  const remaining = sumProducts([[total], [-paid]]);
  const tracked = component === "shipping" ? note.shippingTracked : note.invoiceTracked;
  const status =
    remaining < 0
      ? "overpaid"
      : total === 0
        ? "none"
        : !tracked && paid === 0
          ? "unknown"
          : remaining === 0
            ? "paid"
            : paid > 0
              ? "partial"
              : "unpaid";
  return {
    total,
    paid,
    remaining,
    status,
    label: {
      overpaid: "Lebih bayar",
      none: "Tidak ada tagihan",
      unknown: "Belum dicatat",
      paid: "Lunas",
      partial: "Sebagian",
      unpaid: "Belum dibayar",
    }[status],
  };
}
// Invoice and freight are settled separately. Credits stay with their own note.
export function branchSupplierPayable(state, locations) {
  if (!noteReady(state) || !Array.isArray(state.receiptPlans)) return null;
  const branches = new Set(
    locations.filter((st) => st.locationType !== "warehouse").map((st) => st.id),
  );
  if (!branches.size) return null;
  const remaining = [];
  for (const note of state.receiptPlans) {
    if (note.cancelled || !branches.has(note.storeId)) continue;
    if (
      !Array.isArray(note.payments) ||
      !Array.isArray(note.lines) ||
      !note.lines.length ||
      note.lines.some((line) => line.purchaseCost == null)
    )
      return null;
    const balance = noteBalance(note, "invoice");
    if (balance.status === "unknown") return null;
    remaining.push([Math.max(0, balance.remaining)]);
  }
  return sumProducts(remaining);
}
export function noteMoney(value, zero = false) {
  const n = Number(value);
  if (
    String(value).trim() === "" ||
    value == null ||
    !Number.isFinite(n) ||
    n < 0 ||
    (!zero && n === 0) ||
    n > 999999999999 ||
    Math.abs(n * 100 - Math.round(n * 100)) > 0.001
  )
    throw Error("Isi nilai rupiah yang valid, maksimal 2 desimal.");
  return n;
}
