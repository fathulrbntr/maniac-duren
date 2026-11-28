import { escape as e, money, num, today } from "./core.mjs";
import { pageIcon, visibleSections } from "./navigation.mjs";
import { serviceOrders } from "./order-stock.mjs";
import { outstandingBranchCash, canReadDeposits } from "./cash-deposits.mjs";
import { accountProfile } from "./account-profile.mjs";
import { companyName } from "./cash-flow.mjs";
import { branchSupplierPayable } from "./supplier-notes.mjs";
import { depositButtons } from "./cash-deposits-ui.mjs";
import { dashboardTabs } from "./dashboard-data.mjs";
import { dashboardStorePicker } from "./dashboard-ui.mjs";
import { pendingWorkItems } from "./warehouse-workflow.mjs";

const preferred = {
  backoffice: [
    "supplierNotes",
    "transfers",
    "officeInventory",
    "products",
    "pricing",
    "retailFunds",
    "employees",
  ],
  warehouse: [
    "supplierNotes",
    "transfers",
    "stock",
    "waste",
    "reports",
    "attendance",
    "devices",
  ],
  store: [
    "orders",
    "receiving",
    "stock",
    "waste",
    "kitchen",
    "salesreport",
    "attendance",
  ],
};
const shortLabels = {
  orders: "Kasir",
  products: "Master barang",
  officeInventory: "Stok cabang",
  supplierNotes: "Nota supplier",
  transfers: "Transfer stok",
  employees: "Karyawan",
  pricing: "Harga jual",
  retailFunds: "Keuangan PT",
  salesreport: "Penjualan",
  stock: "Stok",
  receiving: "Terima kiriman",
  waste: "Reject",
  kitchen: "Dapur",
};
const eyeIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/><path class="home-eye-slash" d="M3 3l18 18"/></svg>';
const arrow =
  '<svg class="home-arrow" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m8 5 5 5-5 5"/></svg>';
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Jakarta",
});
const tile = (id, label) =>
  `<button type="button" class="home-tile" data-view="${e(id)}"><span class="home-tile-icon">${pageIcon(id)}</span><span>${e(label)}</span></button>`;

function balanceText(amount) {
  return amount == null || amount === "" || !Number.isFinite(Number(amount))
    ? "Belum tersedia"
    : money(amount);
}
function maskedAmount(amount, hidden) {
  return `<span data-home-amount ${hidden ? "hidden" : ""}>${e(balanceText(amount))}</span><span data-home-mask ${hidden ? "" : "hidden"}>••••</span>`;
}
function branchDeposits(s, cash, central, store, hidden) {
  const buttons = depositButtons(s, central ? "" : store);
  if (!central && !buttons) return "";
  const rows = central
    ? cash.branches
        .map((branch) => {
          const note = branch.pending < 0 ? "<small>Periksa selisih setoran</small>" : "";
          return `<div><dt>${e(branch.name)}${note}</dt><dd>${maskedAmount(branch.pending, hidden)}</dd></div>`;
        })
        .join("")
    : "";
  return `<section class="home-panel home-deposits" aria-labelledby="home-deposits">
    <h3 id="home-deposits">${central ? "Belum disetor per cabang" : "Setoran cabang"}</h3>
    ${central ? (rows ? `<dl aria-label="Omzet belum disetor per cabang">${rows}</dl>` : "<p>Belum ada cabang.</p>") : `<dl><div><dt>Omzet hari ini</dt><dd>${maskedAmount(cash.branches[0]?.salesToday, hidden)}</dd></div></dl>`}
    ${buttons}
  </section>`;
}

export function homePage(s, store, access, titles, locations, hidden) {
  const space = access.workspace;
  const central = space === "backoffice";
  const pages = visibleSections(access)
    .flatMap((group) => group.pages)
    .filter((id) => id !== "home");
  const has = (id) => pages.includes(id);
  const menu = [...new Set([...(preferred[space] || preferred.store), ...pages])].filter(
    has,
  );
  const label = (id) =>
    id === "supplierNotes" && space === "store"
      ? titles[id]
      : shortLabels[id] || titles[id];
  const showSales =
    space !== "warehouse" &&
    (space
      ? dashboardTabs(s, space).some(([key]) => key === "transactions")
      : access.reports);
  const actions = (central ? ["reports"] : ["orders", "stock", "attendance"])
    .filter(has)
    .slice(0, 2);
  const place =
    locations.find((row) => row.id === store)?.name ||
    (central ? "Semua cabang" : "Lokasi belum tersedia");
  const queues = pendingWorkItems(s, store, space).filter(([view]) => has(view));
  const orders = serviceOrders(s, store);
  if (has("kitchen"))
    queues.push([
      "kitchen",
      "Pesanan dapur",
      orders.filter((o) => ["queued", "preparing"].includes(o.status)).length,
    ]);
  if (has("service"))
    queues.push([
      "service",
      "Pesanan siap diantar",
      orders.filter((o) => o.status === "ready").length,
    ]);

  const day = today();
  const showCompany = central && !!access.finance;
  const showCash =
    showCompany || (!central && space !== "warehouse" && canReadDeposits(s) && !!store);
  const cash = showCash
    ? outstandingBranchCash(
        s,
        showCompany ? locations : locations.filter((st) => st.id === store),
      )
    : null;
  let heading = "Lokasi aktif",
    value = place,
    detail = central
      ? "Back Office"
      : space === "warehouse"
        ? "Operasional gudang"
        : "Operasional toko";
  if (cash) {
    const amount = showCompany ? s.retailBalance : cash.branches[0]?.pending;
    heading = showCompany ? "Saldo perusahaan" : "Omzet cabang belum disetor";
    value = balanceText(amount);
    detail = showCompany
      ? `Dana tersedia di ${companyName} setelah pengeluaran.`
      : amount < 0
        ? "Periksa selisih pada riwayat setoran."
        : "Penjualan tunai dan nontunai setelah pengembalian dana, dikurangi setoran ke PT.";
  } else if (queues.length) {
    const [, task, count] = queues.find(([, , amount]) => amount > 0) || queues[0];
    heading = task;
    value = num(count);
    detail = place;
  }
  const deposits = cash ? branchDeposits(s, cash, showCompany, store, hidden) : "";
  const queueCards = queues
    .map(
      ([id, text, count]) =>
        `<button type="button" data-view="${e(id)}" class="home-work-card"${count > 0 ? ' data-progress="pending"' : ""}><span class="home-work-top">${pageIcon(id)}${arrow}</span><strong>${num(count)}</strong><span>${e(text)}</span></button>`,
    )
    .join("");
  const figures = showCompany
    ? [
        ["Belum disetor", cash.total],
        ["Tagihan supplier", branchSupplierPayable(s, locations)],
        ["Omzet hari ini", s.cashDepositToday === day ? cash.salesToday : null],
      ]
    : [];
  const overflow = menu.length > 8;
  const visible = overflow ? menu.slice(0, 7) : menu;
  const toggle = overflow
    ? `<button type="button" class="home-tile home-all" data-home-more aria-expanded="false" aria-controls="home-extra"><span class="home-tile-icon">${pageIcon("dashboard")}</span><span>Semua menu</span></button>`
    : "";
  return `<div class="home-page">
    <section class="home-hero" aria-labelledby="home-headline"><div class="home-hero-meta">${accountProfile(s)}<div class="home-context"><span>${pageIcon("stores")}${e(showCompany ? "Seluruh cabang" : place)}</span><time datetime="${day}">${e(dateFormat.format(new Date(day + "T12:00:00Z")))}</time></div></div>
      <div class="home-hero-body" ${value.length > 12 ? "data-long-value" : ""}><div class="home-summary"><h2 id="home-headline">${e(heading)}</h2><div class="home-value-row"><strong class="home-value" ${showCash && hidden ? "hidden" : ""}>${e(value)}</strong>${showCash ? `<strong class="home-mask" ${hidden ? "" : "hidden"} aria-label="Saldo disembunyikan">••••</strong><button type="button" data-home-eye aria-label="${hidden ? "Tampilkan saldo" : "Sembunyikan saldo"}" aria-pressed="${hidden}">${eyeIcon}</button>` : ""}</div><p>${e(detail)}</p></div>
      ${
        actions.length || showSales
          ? `<div class="home-hero-actions">${showSales ? '<button type="button" data-home-sales>Lihat omzet</button>' : ""}${actions
              .slice(0, showSales ? 1 : 2)
              .map(
                (id) =>
                  `<button type="button" data-view="${e(id)}">${pageIcon(id)}${e(label(id))}</button>`,
              )
              .join("")}</div>`
          : ""
      }</div>
      ${figures.length ? `<dl class="home-financials" aria-label="Ringkasan keuangan seluruh cabang">${figures.map(([label, amount]) => `<div><dt>${e(label)}</dt><dd>${maskedAmount(amount, hidden)}</dd></div>`).join("")}</dl>` : ""}
    </section>
    <div class="home-body"><section class="home-panel home-shortcuts" aria-labelledby="home-shortcuts"><h2 id="home-shortcuts">Akses cepat</h2><div class="home-grid">${visible.map((id) => tile(id, label(id))).join("")}${toggle}</div>${
      overflow
        ? `<div class="home-grid home-extra" id="home-extra" hidden>${menu
            .slice(7)
            .map((id) => tile(id, label(id)))
            .join("")}</div>`
        : ""
    }</section>
    ${locations.length ? `<div class="home-scope">${dashboardStorePicker(s, store, space, locations)}</div>` : ""}
    ${
      queueCards || deposits
        ? `<section class="home-work" aria-labelledby="home-work"><h2 id="home-work">Perlu ditindaklanjuti</h2>
      ${queueCards ? `<div class="home-work-grid">${queueCards}</div>` : ""}
      ${deposits}
    </section>`
        : ""
    }
    </div></div>`;
}

export function bindHome({ setHidden }) {
  const root = document.querySelector(".home-page");
  if (!root) return;
  const more = root.querySelector("[data-home-more]");
  if (more)
    more.onclick = () => {
      const extra = root.querySelector("#home-extra");
      extra.hidden = !extra.hidden;
      more.setAttribute("aria-expanded", String(!extra.hidden));
      more.lastElementChild.textContent = extra.hidden ? "Semua menu" : "Ringkas";
    };
  const eye = root.querySelector("[data-home-eye]");
  if (eye)
    eye.onclick = () => {
      const hide = eye.getAttribute("aria-pressed") !== "true";
      eye.setAttribute("aria-pressed", String(hide));
      root.querySelector(".home-value").hidden = hide;
      root.querySelector(".home-mask").hidden = !hide;
      eye.setAttribute("aria-label", hide ? "Tampilkan saldo" : "Sembunyikan saldo");
      for (const el of root.querySelectorAll("[data-home-amount]")) el.hidden = hide;
      for (const el of root.querySelectorAll("[data-home-mask]")) el.hidden = !hide;
      setHidden(hide);
    };
}
