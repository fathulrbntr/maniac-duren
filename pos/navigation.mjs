import { confirmAction } from "../shared/confirmation.mjs";
import { workspaceGroups } from "./workspaces.mjs";
export const homePageId = (id) =>
  ["dashboard", "backoffice", "storehome", "warehouse"].includes(id) ? "home" : id;
export const pageTitles = {
  home: "Beranda",
  backoffice: "Dashboard Back Office",
  warehouse: "Dashboard Gudang",
  storehome: "Dashboard Toko",
  transfers: "Pengiriman & Tagihan",
  transferPrep: "Siapkan transfer",
  receiving: "Penerimaan Kiriman",
  pricing: "Harga Jual",
  officeInventory: "Inventory",
  costPrices: "Harga Modal",
  legacyTransfers: "Dokumen distribusi lama",
  supplierNotes: "Nota Supplier",
  service: "Pelayanan Meja",
  cutting: "Tukang Potong",
  crm: "Member & Poin",
  payments: "Metode Pembayaran",
  shifts: "Shift Kasir",
  retailFunds: "Keuangan PT Retail",
  storeExpenses: "Pengeluaran Toko",
  devices: "Printer & Scanner",
  discounts: "Diskon & Persetujuan",
  dashboard: "Dashboard",
  orders: "Kasir / POS",
  kitchen: "Kitchen Display",
  products: "Master Barang",
  stock: "Stok & Penerimaan",
  losses: "Reject & Waste",
  waste: "Reject & Waste",
  batches: "Laporan Batch Supplier",
  recipes: "Master Resep",
  production: "Produksi & Persiapan",
  finance: "Petty Cash & Keuangan",
  salesreport: "Laporan Penjualan",
  trace: "Jejak Stok & Produksi",
  reports: "Laporan",
  documents: "Admin Dokumen",
  employees: "Karyawan & Akses",
  attendance: "Absensi",
  stores: "Branch Outlet & Gudang",
  suppliers: "Supplier",
  guide: "Panduan",
  cashier: "Kasir buah cepat",
};
const paths = {
  home: "M3 10.5 12 3l9 7.5 M5 9v12h5v-7h4v7h5V9",
  backoffice: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  warehouse: "M3 10l9-6 9 6v11H3z M8 21V12h8v9 M8 16h8",
  storehome:
    "M3 9l2-6h14l2 6 M3 9v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9 M5 15v6h14v-6",
  transfers:
    "M2 5h12v12H2z M14 9h4l4 5v3h-8 M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M16 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
  receiving: "M3 13v8h18v-8 M12 3v13 M7 11l5 5 5-5",
  costPrices: "M4 4h16v16H4z M8 8h8 M8 12h2 M14 12h2 M8 16h2 M14 16h2",
  pricing: "M3 3h8l10 10-8 8L3 11z M7 7h.01 M12 10l5 5 M14 9l-4 6",
  supplierNotes: "M4 3h11l5 5v13H4z M15 3v6h5 M8 13h8 M8 17h5",
  service: "M3 13h18 M5 13a7 7 0 0 1 14 0 M12 4v2 M4 17h16 M8 21h8",
  cutting: "M3 21l6-6 M7 13l4 4 10-10V3z",

  crm: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M20 8v6 M17 11h6",
  payments: "M3 5h18v14H3z M3 10h18 M6 15h5",
  storeExpenses: "M4 6h16v14H4z M4 6l11-3v3 M11 13h6 M14 10l3 3-3 3",
  shifts: "M4 4h16v16H4z M8 8h8 M8 12h3 M15 12v5 M12 15h6",
  retailFunds: "M3 7h18v13H3z M3 7l14-4v4 M15 12h6v5h-6z",
  documents: "M4 3h11l5 5v13H4z M15 3v6h5 M8 13h8 M8 17h5",
  devices: "M6 9V3h12v6 M6 17H3V9h18v8h-3 M6 14h12v7H6z M17 12h1",
  discounts:
    "M19 5L5 19 M7 7h.01 M17 17h.01 M9 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  orders: "M7 4H5v17l3-2 4 2 4-2 3 2V4h-2 M9 3h6v4H9z M8 11h8 M8 15h5",
  kitchen: "M4 4h16v17H4z M8 2v4 M16 2v4 M8 10h8 M8 14h8 M8 18h4",
  cashier: "M4 3h16v13H4z M8 20h8 M12 16v4 M7 7h10 M7 11h4",
  stock: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10 M7 5l10 5",
  production:
    "M5 10h14v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z M2 11h3 M19 11h3 M8 3v3 M12 2v4 M16 3v3",
  waste: "M8 4l3-2 3 5 M11 2L6 10 M20 11l1 4-6 1 M21 15l-5-8 M11 21l-4-1 2-5 M7 20h9",
  losses: "M3 5h18 M5 5l1 16h12l1-16 M9 5V2h6v3 M10 9v8 M14 9v8",
  salesreport: "M5 3h14v18l-3-2-4 2-4-2-3 2z M8 7h8 M8 11h8 M8 15h3",
  finance: "M3 6h18v14H3z M3 6l14-3v3 M15 11h6v5h-6z M17 13h1",
  trace: "M5 3h10v6H5z M5 15h10v6H5z M10 9v6 M15 6h4v12h-4",
  batches: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10",
  reports: "M4 20V4 M4 20h17 M8 16v-5 M13 16V7 M18 16v-9",
  employees:
    "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M2 21v-3a6 6 0 0 1 12 0v3 M17 4a4 4 0 0 1 0 8 M18 15a5 5 0 0 1 4 5v1",
  attendance: "M5 4h14v17H5z M8 2v4 M16 2v4 M5 9h14 M8 15l3 3 5-6",
  guide: "M12 5c-3-2-7-2-10-1v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1z M12 5v16",
  products: "M3 3h8l10 10-8 8L3 11z M7 7h.01",
  recipes: "M4 3h13v18H4z M7 3v18 M10 7h4 M10 11h4 M10 15h3 M17 6h3v12h-3",
  stores:
    "M3 9l2-6h14l2 6 M3 9v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9z M5 15v6h14v-6 M10 21v-5h4v5",
  suppliers:
    "M2 5h12v12H2z M14 9h4l4 5v3h-8 M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M16 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
  edit: "M14 4l6 6 M3 21l5-1L21 7l-5-5L3 15z",
  master: "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5",
};
export const pageIcon = (k) =>
  `<svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[["legacyTransfers", "transferPrep"].includes(k) ? "transfers" : k === "officeInventory" ? "stock" : k] || paths.master}"/></svg>`;

// Sidebar grouping only. Existing page IDs, permissions and transaction flow are unchanged.
export const sections = [
  { id: "utama", label: "Ringkasan", pages: ["home"] },
  {
    id: "inventory",
    label: "01 · Gudang & Penerimaan",
    pages: ["stock", "products", "suppliers"],
  },
  {
    id: "pelayanan",
    label: "02 · Pelayanan & Kasir",
    pages: ["shifts", "orders", "storeExpenses"],
  },
  { id: "kitchen", label: "03 · Kitchen", pages: ["kitchen", "production", "recipes"] },
  {
    id: "laporan",
    label: "04 · Laporan & Administrasi",
    pages: ["reports", "documents"],
  },
  { id: "potong", label: "Tukang Potong", pages: ["waste"] },
  {
    id: "manajemen",
    label: "Pengelolaan",
    pages: ["crm", "discounts", "employees", "stores"],
  },
  { id: "pengaturan", label: "Pengaturan", pages: ["payments", "devices"] },
  { id: "bantuan", label: "Karyawan & Panduan", pages: ["attendance", "guide"] },
];
export function visibleSections(access) {
  if (access?.workspace) return workspaceGroups(access);
  const allowed = access
    ? {
        home: true,
        crm: access.crmAdmin,
        payments: access.cashierOwner,
        devices: access.cashierOwner || access.sell || access.master,
        discounts: access.cashierOwner,
        salesreport: access.reports,
        orders: access.sell,
        storeExpenses: access.sell && access.cashierExpenses,
        kitchen: access.kitchen || access.sell,
        shifts: access.sell || access.reports || access.finance,
        stock: access.stock || access.produce,
        production: access.produce,
        waste: access.waste,
        losses: access.waste,
        batches: access.trace || access.finance || access.waste,
        reports: access.reports || access.finance || access.trace || access.waste,
        documents: access.finance || access.stock,
        finance: access.finance,
        trace: access.trace,
        employees: access.employees,
        attendance: access.attendance,
        products: access.master,
        recipes: access.master,
        stores: access.master,
        suppliers: access.master,
        guide: true,
      }
    : null;
  return sections
    .map((section) => ({
      ...section,
      pages: section.pages.filter((key) => !allowed || allowed[key]),
    }))
    .filter((section) => section.pages.length);
}
export function navigation(title, view, icon, access, closedGroups = {}) {
  return visibleSections(access)
    .map((section) => {
      const items = section.pages
        .map(
          (key) =>
            `<button type="button" data-view="${key}" title="${title[key]}" aria-label="${title[key]}" class="nav-item ${view === key ? "active" : ""}" ${view === key ? 'aria-current="page"' : ""}>${icon(key)}<span>${title[key]}</span></button>`,
        )
        .join("");
      if (section.standalone) return `<div class="nav-section">${items}</div>`;
      const open = section.pages.includes(view) || !closedGroups[section.id];
      return `<details class="nav-section" data-nav-group="${section.id}" ${open ? "open" : ""}><summary class="nav-heading"><span>${section.label}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5 5 5-5 5"/></svg></summary><div class="nav-items">${items}</div></details>`;
    })
    .join("");
}
export function hasUnsavedForm() {
  return !!document.querySelector('main form[data-dirty="true"]');
}
export function confirmLeave() {
  return confirmAction("Isian belum disimpan. Tinggalkan halaman ini?");
}
export function trackForms() {
  document
    .querySelectorAll(
      "main form:not(#filters):not(#catalog-filter):not([data-shift-filters]):not([role=search])",
    )
    .forEach((form) => {
      form.addEventListener("input", () => (form.dataset.dirty = "true"));
      form.addEventListener("change", () => (form.dataset.dirty = "true"));
    });
}
