import { escape as e, money, num, today } from "./core.mjs";
import { pageIcon, visibleSections } from "./navigation.mjs";
import { needsKitchen } from "./order-stock.mjs";
import { transactions } from "./reports.mjs";
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
  storehome: "Dashboard",
  backoffice: "Dashboard",
  warehouse: "Dashboard",
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

function branchRow(locations, store, central) {
  const choices = central ? [{ id: "", name: "Semua cabang" }, ...locations] : locations;
  if (choices.length < 2) return "";
  return `<section class="home-panel home-locations" aria-labelledby="home-branches"><h2 id="home-branches">Lokasi</h2><div class="home-branch-list">${choices
    .map(({ id, name }) => {
      const initials = String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase();
      return `<button type="button" data-home-store="${e(id)}" aria-pressed="${id === (store || "")}"><span class="home-branch-icon" aria-hidden="true">${id ? e(initials) : pageIcon("stores")}</span><span>${e(name)}</span></button>`;
    })
    .join("")}</div></section>`;
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
  const overview = space === "store" ? "storehome" : space || "dashboard";
  const actions = [overview, central ? "reports" : "orders", "stock", "attendance"]
    .filter(has)
    .slice(0, 2);
  const place =
    locations.find((row) => row.id === store)?.name ||
    (central ? "Semua cabang" : "Lokasi belum tersedia");
  const queues = pendingWorkItems(s, store, space).filter(([view]) => has(view));
  if (has("receiving"))
    queues.push([
      "receiving",
      "Kiriman dalam perjalanan",
      (s.transfers || []).filter(
        (row) => row.targetId === store && row.status === "in_transit",
      ).length,
    ]);
  const orders = (s.orders || []).filter(
    (o) => o.store_id === store && o.payment_status === "paid",
  );
  if (has("kitchen"))
    queues.push([
      "kitchen",
      "Pesanan dapur",
      orders.filter((o) => ["queued", "preparing"].includes(o.status) && needsKitchen(o))
        .length,
    ]);
  if (has("service"))
    queues.push([
      "service",
      "Pesanan siap diantar",
      orders.filter((o) => o.status === "ready").length,
    ]);

  const day = today();
  const canSeeSales = access.reports && space !== "warehouse";
  let heading = "Selamat datang",
    value = s.me?.name || "Tim Maniac Duren",
    detail = central
      ? "Back Office"
      : space === "warehouse"
        ? "Operasional gudang"
        : "Operasional toko";
  if (canSeeSales) {
    const places = new Set(locations.map((row) => row.id));
    const paid = transactions(s).filter(
      (row) =>
        row.date === day && places.has(row.storeId) && (!store || row.storeId === store),
    );
    heading = "Omzet hari ini";
    value = money(paid.reduce((sum, row) => sum + row.total, 0));
    detail = num(paid.length) + " transaksi lunas";
  } else if (queues.length) {
    const [, task, count] = queues[0];
    heading = task;
    value = num(count);
    detail = place;
  }
  const overflow = menu.length > 8;
  const visible = overflow ? menu.slice(0, 7) : menu;
  const toggle = overflow
    ? `<button type="button" class="home-tile home-all" data-home-more aria-expanded="false" aria-controls="home-extra"><span class="home-tile-icon">${pageIcon("dashboard")}</span><span>Semua menu</span></button>`
    : "";
  return `<div class="home-page">
    <section class="home-hero" aria-labelledby="home-headline"><div class="home-hero-meta"><span>${pageIcon("stores")}${e(place)}</span><time datetime="${day}">${e(dateFormat.format(new Date(day + "T12:00:00Z")))}</time></div>
      <div class="home-hero-body" ${value.length > 12 ? "data-long-value" : ""}><div class="home-summary"><h2 id="home-headline">${e(heading)}</h2><div class="home-value-row"><strong class="home-value" ${canSeeSales && hidden ? "hidden" : ""}>${e(value)}</strong>${canSeeSales ? `<strong class="home-mask" ${hidden ? "" : "hidden"} aria-label="Omzet disembunyikan">••••</strong><button type="button" data-home-eye aria-label="Sembunyikan omzet" aria-pressed="${hidden}">${eyeIcon}</button>` : ""}</div><p>${e(detail)}</p></div>
      ${actions.length ? `<div class="home-hero-actions">${actions.map((id) => `<button type="button" data-view="${e(id)}">${pageIcon(id)}${e(label(id))}</button>`).join("")}</div>` : ""}</div></section>
    <div class="home-body"><section class="home-panel home-shortcuts" aria-labelledby="home-shortcuts"><h2 id="home-shortcuts">Akses cepat</h2><div class="home-grid">${visible.map((id) => tile(id, label(id))).join("")}${toggle}</div>${
      overflow
        ? `<div class="home-grid home-extra" id="home-extra" hidden>${menu
            .slice(7)
            .map((id) => tile(id, label(id)))
            .join("")}</div>`
        : ""
    }</section>
    ${branchRow(locations, store, central)}
    ${queues.length ? `<section class="home-work" aria-labelledby="home-work"><h2 id="home-work">Perlu ditindaklanjuti</h2><div class="home-work-grid">${queues.map(([id, text, count]) => `<button type="button" data-view="${e(id)}" class="home-work-card"><span class="home-work-top">${pageIcon(id)}${arrow}</span><strong>${num(count)}</strong><span>${e(text)}</span></button>`).join("")}</div></section>` : ""}
    </div></div>`;
}

export function bindHome({ changeStore, setHidden }) {
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
      setHidden(hide);
    };
  root.querySelectorAll("[data-home-store]").forEach((button) => {
    button.onclick = () => changeStore(button.dataset.homeStore);
  });
}
