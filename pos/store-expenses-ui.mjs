import { escape as e, id, money, today } from "./core.mjs";
import { activeShift } from "./cashier-shifts.mjs";

const field = (label, input) =>
  `<label class="field"><span>${label}</span>${input}</label>`;
const categories = [
  "Gaji",
  "Sewa",
  "Listrik & air",
  "Transportasi",
  "Operasional",
  "Lainnya",
];

// Both entry points use the same expense fields and payment methods.
export function expenseFields(contextFields = "", cashier = false) {
  return `<div class="form-grid">${contextFields}${field("Kategori", `<select name="category" required>${cashier ? '<option value="">Pilih kategori</option>' : ""}${categories.map((x) => `<option>${e(x)}</option>`).join("")}</select>`)}${field("Nominal (Rp)", '<input type="number" name="amount" min="0.01" max="1000000000000000" step="any" inputmode="decimal" required>')}${field("Pembayaran", '<select name="payment" required><option>Tunai</option><option>Transfer</option><option>QRIS</option></select>')}${field("Nomor bukti (opsional)", '<input name="reference" maxlength="100">')}</div>${field("Keterangan", '<textarea name="description" minlength="3" maxlength="500" required></textarea>')}`;
}

export function storeExpensesPage(s, store) {
  const branch = s.stores.find((x) => x.id === store && x.locationType === "store");
  if (!branch || !s.access?.sell || !(s.cashierExpenseVersion >= 128) || s.stockDemo)
    return '<p class="notice">Input pengeluaran belum tersedia di toko ini.</p>';
  const rows = (s.myStoreExpenses || []).filter((x) => x.store_id === store);
  return `<section class="panel"><h2>Catat pengeluaran</h2><p class="muted">${e(branch.name)} · ${e(s.me?.name)} · ${e(today())} WIB</p>
    <form id="store-expense-form">${expenseFields("", true)}
      <p class="muted" data-expense-source></p>
      <p class="error" role="alert" data-expense-error></p>
      <button type="submit" class="primary">Simpan pengeluaran</button>
    </form></section>
    <section class="panel"><h2>Pengeluaran terakhir Anda</h2>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Pembayaran</th><th>Nominal</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${e(r.date)}</td><td>${e(r.description)}<small>${e(r.category)}${r.reference ? " · " + e(r.reference) : ""}</small></td><td>${e(r.payment)}</td><td>${money(r.amount)}</td><td>${r.voided ? "Dibatalkan" : "Tercatat"}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty">Belum ada pengeluaran yang Anda catat di cabang ini.</p>'}</section>`;
}

export function bindStoreExpenses(s, store, ctx) {
  const form = document.querySelector("#store-expense-form");
  if (!form) return;
  const payment = form.elements.namedItem("payment"),
    submit = form.querySelector('[type="submit"]'),
    error = form.querySelector("[data-expense-error]"),
    shift = activeShift(s, store),
    requestId = id();
  const describe = () => {
    form.querySelector("[data-expense-source]").textContent =
      payment.value === "Tunai"
        ? shift
          ? "Dibayar dari laci shift Anda. Nominal mengurangi kas shift dan kas tunai toko."
          : "Dibayar dari kas tunai toko. Pengeluaran ini dicatat di luar shift kasir."
        : "Dibayar dari dana nontunai toko.";
  };
  payment.onchange = describe;
  describe();
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    error.textContent = "";
    const p = Object.fromEntries(new FormData(form));
    submit.disabled = true;
    try {
      if (
        await ctx.mutate(
          "cashier_expense_save",
          {
            ...p,
            id: requestId,
            storeId: store,
            amount: Number(p.amount),
            shiftId: p.payment === "Tunai" ? shift?.id || null : null,
          },
          { throwOnError: true },
        )
      ) {
        form.dataset.dirty = "false";
        ctx.render();
        ctx.toast("Pengeluaran toko tersimpan.");
      }
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  };
}
