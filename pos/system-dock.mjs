import { escape as e } from "./core.mjs";
import { pageTitles, pageIcon, visibleSections, homePageId } from "./navigation.mjs";

const standardPages = ["home", "stock", "orders", "scan", "kitchen", "reports"];
const workspaceDefaults = {
  store: ["home", "orders", "stock", "kitchen", "cutting", "service", "reports"],
  backoffice: ["home", "retailFunds", "reports", "officeInventory", "supplierNotes"],
  warehouse: ["home", "supplierNotes", "transfers", "stock"],
};
const captions = {
  stock: "Stok",
  officeInventory: "Inventori",
  orders: "Kasir",
  reports: "Laporan",
  retailFunds: "Keuangan",
  supplierNotes: "Nota",
  transfers: "Transfer",
  receiving: "Kiriman",
  kitchen: "Dapur",
  scan: "Timbang",
  salesreport: "Penjualan",
  cutting: "Periksa buah",
  waste: "Reject",
  service: "Pelayanan",
  products: "Barang",
};
const temporary = new Map();
const svg = (path) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
const scanner = svg(
  "M7 3H3v4 M17 3h4v4 M3 17v4h4 M21 17v4h-4 M7 8v8 M10 8v8 M14 8v8 M17 8v8",
);
const settingsIcon = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;

function readSelection(key) {
  if (!key) return null;
  if (temporary.has(key)) return temporary.get(key);
  try {
    return JSON.parse(globalThis.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function dockModel(access, { titles = pageTitles, userId, demo = false }) {
  const groups = visibleSections(access);
  const store = access?.workspace === "store";
  const pages = new Map();
  for (const group of groups) {
    for (const id of group.pages) {
      pages.set(id, titles[id] || id);
      if (id === "stock" && !store && (!access || access.stock))
        pages.set("scan", "Scan timbang durian");
    }
  }
  const key = userId
    ? `maniac-pos-dock-v1:${encodeURIComponent(userId)}:${demo ? "demo" : access?.workspace || "pos"}`
    : null;
  const preferred = workspaceDefaults[access?.workspace];
  const fallback = preferred
    ? preferred.filter((id) => pages.has(id)).slice(0, 3)
    : standardPages.filter((id) => pages.has(id));
  const saved = readSelection(key);
  const selected = Array.isArray(saved)
    ? [...new Set(saved.map(homePageId).filter((id) => pages.has(id)))]
    : fallback;
  return { groups, pages, key, selected };
}

function pageButtons(view, selected, pages) {
  const active =
    view === "cashier" || (view === "shifts" && !selected.includes("shifts"))
      ? "orders"
      : view;
  return selected
    .map((id) => {
      const label = e(pages.get(id));
      return `<button type="button" ${id === "scan" ? "data-dock-scan" : `data-view="${e(id)}"`} aria-label="${label}" title="${label}" ${id === active ? 'aria-current="page"' : ""}><span class="dock-symbol">${id === "scan" ? pageIcon("receiving") : pageIcon(id)}</span><span class="dock-caption">${e(captions[id] || pages.get(id))}</span></button>`;
    })
    .join("");
}

function revealActivePage(track) {
  if (!(track.scrollWidth > track.clientWidth)) return;
  const active = track.querySelector('[aria-current="page"]');
  if (!active) return;
  const bounds = track.getBoundingClientRect();
  const button = active.getBoundingClientRect();
  if (button.right > bounds.right) track.scrollLeft += button.right - bounds.right;
  else if (button.left < bounds.left) track.scrollLeft -= bounds.left - button.left;
}

export function systemDock(view, access, options = {}) {
  const { pages, selected } = dockModel(access, options);
  const split = Math.ceil((selected.length + 1) / 2);
  return `<nav class="system-dock" aria-label="Pintasan halaman"><div class="dock-inner">
    <div class="dock-pages" data-dock-left>${pageButtons(view, selected.slice(0, split), pages)}</div>
    <button type="button" class="dock-lookup" data-item-lookup aria-label="Pindai barang" aria-haspopup="dialog"><span class="dock-lens">${scanner}</span><span class="dock-caption">Pindai</span></button>
    <div class="dock-right"><div class="dock-pages" data-dock-right>${pageButtons(view, selected.slice(split), pages)}</div><button type="button" class="dock-settings" data-dock-settings aria-haspopup="dialog" aria-label="Atur dock" title="Atur dock">${settingsIcon}</button></div>
  </div></nav>`;
}

export function bindDockSettings(
  view,
  access,
  options,
  { modal, bindNavigation, toast },
) {
  const dock = document.querySelector(".system-dock");
  const opener = dock?.querySelector("[data-dock-settings]");
  if (!opener) return;
  const tracks = [
    dock.querySelector("[data-dock-left]"),
    dock.querySelector("[data-dock-right]"),
  ];
  tracks.forEach(revealActivePage);
  opener.onclick = () => {
    const { groups, pages, key, selected } = dockModel(access, options);
    const choice = (id) =>
      `<label><input type="checkbox" name="shortcut" value="${e(id)}" ${selected.includes(id) ? "checked" : ""}><span>${e(pages.get(id))}</span></label>`;
    const dialog = modal(
      "Atur dock",
      `<div class="dock-picker">${groups
        .map(
          (group) =>
            `<fieldset><legend>${e(group.label)}</legend>${group.pages.map((id) => choice(id) + (id === "stock" && pages.has("scan") ? choice("scan") : "")).join("")}</fieldset>`,
        )
        .join("")}</div>`,
    );
    dialog.setAttribute("aria-label", "Atur dock");
    dialog.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      if (!dock.isConnected) return dialog.close();
      const checked = new Set(new FormData(event.currentTarget).getAll("shortcut"));
      const next = [...new Set([...selected, ...pages.keys()])].filter((id) =>
        checked.has(id),
      );
      if (key) {
        try {
          globalThis.localStorage.setItem(key, JSON.stringify(next));
          temporary.delete(key);
        } catch {
          temporary.set(key, next);
          toast("Penyimpanan perangkat tidak tersedia. Pilihan berlaku selama sesi ini.");
        }
      }
      const split = Math.ceil((next.length + 1) / 2);
      [next.slice(0, split), next.slice(split)].forEach((ids, i) => {
        tracks[i].innerHTML = pageButtons(view, ids, pages);
        bindNavigation(tracks[i]);
        revealActivePage(tracks[i]);
      });
      dialog.close();
      opener.focus({ preventScroll: true });
    };
  };
}
