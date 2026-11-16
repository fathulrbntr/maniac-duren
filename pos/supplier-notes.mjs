import { sumProducts } from "./decimal-totals.mjs";
export const supplierNoteActions = [
  "supplier_note_correct",
  "supplier_note_payment",
  "supplier_note_payment_void",
  "supplier_note_confirm_unpaid",
];
export const noteReady = (s) => s.supplierNotesVersion >= 112 && !s.stockDemo;
export const noteOwner = (s) => noteReady(s) && s.me?.role === "owner";
export const noteCanPay = (s) =>
  noteReady(s) && !!s.access?.backoffice && !!s.access?.finance;
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
