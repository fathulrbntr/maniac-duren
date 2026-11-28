import { sumProducts } from "./decimal-totals.mjs";

export const depositActions = new Set(["cash_deposit_save", "cash_deposit_void"]);
export const canRecordDeposit = (s) =>
  !s.access || !!(s.access.sell || s.access.finance) || s.me?.role === "owner";
export const canReadDeposits = (s) => canRecordDeposit(s) || !!s.access?.reports;
export const canVoidDeposit = (s) => s.me?.role === "owner" || !!s.access?.finance;
const day = (stamp) =>
  new Date(stamp).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const scoped = (s, id) => canReadDeposits(s) && s.stores.some((x) => x.id === id);
const validNumber = (v) =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
export function depositTotals(s, store = "", rows = s.cashDepositSummary) {
  if (!(s.cashDepositVersion >= 92) || !Array.isArray(rows)) return null;
  const stores = s.stores.filter(
    (x) =>
      x.locationType !== "warehouse" && (!store || x.id === store) && scoped(s, x.id),
  );
  if (!stores.length) return null;
  const values = stores.map((x) => rows.find((r) => r.storeId === x.id));
  if (
    values.some(
      (r) => !r || ["netCash", "deposited", "pending"].some((k) => !validNumber(r[k])),
    )
  )
    return null;
  const sum = (key) => sumProducts(values.map((r) => [r[key]]));
  const current = values.every((r) => validNumber(r.netSales));
  return {
    netCash: sum("netCash"),
    netSales: current ? sum("netSales") : null,
    salesToday: values.every((r) => validNumber(r.salesToday)) ? sum("salesToday") : null,
    deposited: sum("deposited"),
    pending: current ? sum("pending") : null,
    count: sumProducts(values.map((r) => [r.count || 0])),
  };
}
// A branch with excess deposits needs reconciliation and does not settle another branch's cash.
export function outstandingBranchCash(s, stores) {
  const branches = stores
    .filter((st) => st.locationType !== "warehouse")
    .map((st) => {
      const totals = depositTotals(s, st.id);
      return {
        name: st.name,
        pending: totals?.pending ?? null,
        salesToday: totals?.salesToday ?? null,
        deposited: totals?.deposited ?? null,
      };
    });
  const complete = branches.length > 0 && branches.every((b) => b.pending !== null);
  return {
    branches,
    deposited:
      branches.length && branches.every((b) => b.deposited !== null)
        ? sumProducts(branches.map((b) => [b.deposited]))
        : null,
    salesToday:
      branches.length && branches.every((b) => b.salesToday !== null)
        ? sumProducts(branches.map((b) => [b.salesToday]))
        : null,
    total: complete ? sumProducts(branches.map((b) => [Math.max(b.pending, 0)])) : null,
  };
}
export function validateDepositInput(p) {
  if (
    Object.keys(p).some((k) => !["id", "storeId", "amount", "bank", "proof"].includes(k))
  )
    throw Error("Tanggal dan identitas setoran ditetapkan server; isian tidak dikenal");
  const amount = Number(p.amount),
    bank = String(p.bank || "").trim();
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 9e15)
    throw Error("Nilai setoran harus Rupiah bulat lebih dari nol");
  if (bank.length < 2 || bank.length > 80 || /[\u0000-\u001f\u007f]/.test(bank))
    throw Error("Isi bank tujuan setor (2–80 karakter)");
  const match = String(p.proof || "").match(
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match || match[2].length % 4 || match[2].length > 2796204)
    throw Error("Bukti struk wajib JPG, PNG, atau WebP, maksimal 2 MB");
  let raw;
  try {
    raw = atob(match[2]);
  } catch {
    throw Error("Bukti struk tidak valid");
  }
  const bytes = Array.from(raw.slice(0, 12), (c) => c.charCodeAt(0)),
    prefix = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  if (
    raw.length < 12 ||
    raw.length > 2097152 ||
    !(
      (match[1] === "png" && prefix.startsWith("89504e470d0a1a0a")) ||
      (match[1] === "jpeg" && prefix.startsWith("ffd8ff")) ||
      (match[1] === "webp" && raw.startsWith("RIFF") && raw.slice(8, 12) === "WEBP")
    )
  )
    throw Error("Isi bukti tidak sesuai format gambar");
  return { amount, bank, proof: p.proof };
}
export function refreshDepositDemo(s, now = new Date().toISOString()) {
  s.cashDepositVersion = 92;
  s.cashDepositToday = day(now);
  const orderIds = new Set((s.orders || []).map((o) => o.id));
  const refundDays = new Map();
  for (const ev of s.events || []) {
    if (["order_cancel", "order_void", "void"].includes(ev.action))
      refundDays.set(ev.payload?.orderId || ev.payload?.saleId, ev.business_date);
  }
  s.cashDepositSummary = s.stores
    .filter((st) => scoped(s, st.id) && st.locationType !== "warehouse")
    .map((st) => {
      const movements = [];
      const sale = (date, payment, total, refunded, refundDate) => {
        if (!date || date > s.cashDepositToday) return;
        movements.push({ date, payment, amount: total });
        if (refunded && (!refundDate || refundDate <= s.cashDepositToday))
          movements.push({ date: refundDate, payment, amount: -total });
      };
      for (const o of s.orders || []) {
        const refunded = o.payment_status === "refunded";
        if (
          o.store_id === st.id &&
          (refunded || (o.payment_status === "paid" && o.status !== "cancelled"))
        )
          sale(
            o.paid_date || o.business_date,
            o.payment,
            o.total,
            refunded,
            o.void_meta?.date || refundDays.get(o.id),
          );
      }
      for (const item of s.sales || []) {
        if (
          item.storeId === st.id &&
          item.sourceType !== "wholesale" &&
          !orderIds.has(item.id)
        )
          sale(
            item.date,
            item.payment,
            item.total,
            item.voided,
            refundDays.get(item.id) ||
              item.voidDate ||
              (item.voidedAt && day(item.voidedAt)),
          );
      }
      const deposits = (s.cashDeposits || []).filter(
        (x) => x.storeId === st.id && !x.voidedAt,
      );
      const sum = (rows) => sumProducts(rows.map((x) => [x.amount]));
      const netSales = sum(movements),
        salesToday = sum(movements.filter((x) => x.date === s.cashDepositToday)),
        netCash = sum(movements.filter((x) => x.payment === "Tunai")),
        deposited = sumProducts(deposits.map((x) => [x.amount]));
      return {
        storeId: st.id,
        netCash,
        netSales,
        salesToday,
        deposited,
        pending: sumProducts([[netSales], [-deposited]]),
        count: deposits.length,
      };
    });
  return s;
}
export function mutateDepositDemo(s, action, p, now = new Date().toISOString()) {
  if (!s.me?.id || !p.id) throw Error("Login dan ID operasi wajib");
  s.cashDeposits ||= [];
  s.cashDepositProofs ||= {};
  s.cashDepositEvents ||= [];
  refreshDepositDemo(s, now);
  if (action === "cash_deposit_save") {
    if (!canRecordDeposit(s) || !scoped(s, p.storeId))
      throw Error("Hak akses setoran outlet tidak tersedia");
    const input = validateDepositInput(p),
      summary = depositTotals(s, p.storeId);
    if (!summary || summary.pending == null || input.amount > summary.pending)
      throw Error("Setoran melebihi omzet yang belum disetor. Perbarui saldo.");
    s.cashDeposits.push({
      id: p.id,
      storeId: p.storeId,
      date: day(now),
      createdAt: now,
      amount: input.amount,
      bank: input.bank,
      cashierId: s.me.id,
      cashierName: s.me.name,
      hasProof: true,
      voidedAt: null,
    });
    s.cashDepositProofs[p.id] = input.proof;
  } else if (action === "cash_deposit_void") {
    if (Object.keys(p).some((k) => !["id", "depositId", "reason"].includes(k)))
      throw Error("Isian pembatalan tidak dikenal");
    const d = s.cashDeposits.find((x) => x.id === p.depositId),
      reason = String(p.reason || "").trim();
    if (!d || !scoped(s, d.storeId) || !canVoidDeposit(s))
      throw Error("Hanya pengelola keuangan yang dapat membatalkan setoran");
    if (d.voidedAt) throw Error("Setoran sudah dibatalkan");
    if (reason.length < 3 || reason.length > 300)
      throw Error("Alasan pembatalan wajib 3–300 karakter");
    Object.assign(d, {
      voidedAt: now,
      voidedName: s.me.name,
      voidReason: reason,
      voidEventId: p.id,
    });
  } else throw Error("Aksi setoran tidak dikenal");
  s.cashDepositEvents.push({ id: p.id, action });
  return refreshDepositDemo(s, now);
}
export function readDepositsDemo(s, filters = {}, now = new Date().toISOString()) {
  const st = filters.storeId || "",
    offset = Number(filters.offset || 0),
    from = filters.from || "",
    to = filters.to || "";
  if (!canReadDeposits(s) || (st && !scoped(s, st)))
    throw Error("Outlet tidak dapat diakses");
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 1000000 ||
    (from && to && from > to)
  )
    throw Error("Filter tidak valid");
  const rows = (s.cashDeposits || [])
    .filter(
      (x) =>
        scoped(s, x.storeId) &&
        (!st || x.storeId === st) &&
        (!from || x.date >= from) &&
        (!to || x.date <= to),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const copy = refreshDepositDemo({ ...s }, now);
  return {
    rows: rows.slice(offset, offset + 21),
    summary: copy.cashDepositSummary.filter((x) => !st || x.storeId === st),
    periodDeposited: sumProducts(rows.filter((x) => !x.voidedAt).map((x) => [x.amount])),
    serverDate: day(now),
    fetchedAt: now,
  };
}
export function depositProofDemo(s, id) {
  const d = (s.cashDeposits || []).find((x) => x.id === id);
  if (!d || !scoped(s, d.storeId)) throw Error("Bukti setoran tidak dapat diakses");
  return { deposit: d, proof: s.cashDepositProofs?.[id] };
}
