import { escape as e, id, money } from "./core.mjs";
import { recordTable } from "./supply-session-ui.mjs";

const status = { pending: "Menunggu", paid: "Dicairkan", rejected: "Ditolak" };
const date = (value) =>
  new Date(value).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
export function pettyPanel(s, store, office = false) {
  const rows = (s.pettyRequests || []).filter((r) => office || r.store_id === store);
  const branch = (key) => s.stores.find((b) => b.id === key)?.name || "—";
  const pending = rows.some((r) => r.status === "pending");
  const header = office
    ? `<div class="supply-stats petty-balances"><div class="stat"><small>Saldo PT Retail</small><strong>${s.retailBalance == null ? "—" : money(s.retailBalance)}</strong></div><div class="stat"><small>Pengajuan menunggu</small><strong>${rows.filter((r) => r.status === "pending").length}</strong></div></div>
       <section class="panel"><div class="header-row"><h2>Petty cash per toko</h2><button data-pt-expense>Catat biaya operasional</button></div><div class="table-wrap petty-stores"><table><thead><tr><th>Toko</th><th class="numeric">Saldo petty cash</th></tr></thead><tbody>${Object.entries(
         s.pettyBalances || {},
       )
         .map(
           ([k, v]) =>
             `<tr><td>${e(branch(k))}</td><td class="numeric">${money(v)}</td></tr>`,
         )
         .join("")}</tbody></table></div></section>`
    : `<section class="panel"><div class="header-row"><div><h2>Saldo petty cash</h2><strong>${money(s.pettyBalances?.[store] || 0)}</strong></div>${pending ? '<span class="pill">Menunggu Back Office</span>' : '<button data-petty-action="petty_request">Ajukan pengisian dana</button>'}</div></section>`;
  const requests = rows.length
    ? recordTable(
        ["Tanggal", ...(office ? ["Toko"] : []), "Keperluan", "Jumlah", "Status"],
        rows.map((r) => [
          e(date(r.requested_at)),
          ...(office ? [e(branch(r.store_id))] : []),
          e(r.reason),
          money(r.amount),
          `${e(status[r.status])}${r.reference ? `<small>${e(r.reference)}</small>` : ""}${office && r.status === "pending" ? `<div class="toolbar"><button data-petty-action="petty_pay" data-request="${e(r.id)}">Catat pencairan</button><button data-petty-action="petty_reject" data-request="${e(r.id)}">Tolak</button></div>` : ""}`,
        ]),
      )
    : '<p class="empty">Belum ada pengajuan.</p>';
  return `${header}<section class="panel"><h3>Pengajuan petty cash</h3>${requests}</section>`;
}

export function bindPetty(s, store, ctx) {
  for (const button of document.querySelectorAll("[data-petty-action]")) {
    button.onclick = () => {
      const action = button.dataset.pettyAction;
      const request = s.pettyRequests.find((r) => r.id === button.dataset.request);
      const creating = action === "petty_request";
      if (!creating && !request) return;
      const title = creating
        ? "Ajukan pengisian petty cash"
        : action === "petty_pay"
          ? "Catat pencairan dari PT Retail"
          : "Tolak pengajuan";
      const d = ctx.modal(
        title,
        (creating
          ? '<label class="field">Jumlah pengajuan (Rp)<input name="amount" type="number" inputmode="numeric" min="1" max="1000000000000000" step="1" required></label>'
          : `<p>${e(s.stores.find((b) => b.id === request.store_id)?.name)} · ${money(request.amount)}</p>`) +
          `<label class="field">${creating ? "Keperluan / rincian biaya" : action === "petty_pay" ? "Referensi pencairan dana" : "Alasan penolakan"}<textarea name="note" minlength="3" maxlength="300" required></textarea></label><p role="alert" class="error" data-petty-error></p>`,
        title,
      );
      const form = d.querySelector("form"),
        operation = id();
      form.onsubmit = async (event) => {
        event.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        if (submit.disabled) return;
        submit.disabled = true;
        try {
          const fd = new FormData(form);
          const p = {
            id: operation,
            storeId: request?.store_id || store,
            note: fd.get("note"),
            ...(creating
              ? { amount: Number(fd.get("amount")) }
              : { requestId: request.id }),
          };
          if (await ctx.mutate(action, p, { throwOnError: true })) {
            d.close();
            ctx.render();
          }
        } catch (error) {
          form.querySelector("[data-petty-error]").textContent = error.message;
        } finally {
          submit.disabled = false;
        }
      };
    };
  }
}
