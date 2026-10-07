export const sections = [
  { label: "Kasir & pelayanan", pages: ["orders", "kitchen"] },
  { label: "Stok & penerimaan", pages: ["stock", "losses"] },
  { label: "Kitchen & produksi", pages: ["production", "waste"] },
  { label: "Laporan", pages: ["salesreport", "finance", "trace", "dashboard", "reports"] },
  { label: "Tim", pages: ["employees", "attendance"] },
  { label: "Pengaturan", pages: ["products", "recipes", "stores", "suppliers", "guide"] },
];
export function visiblePages(access) {
  if (!access) return Object.fromEntries(sections.flatMap(s => s.pages.map(key => [key, true])));
  return {
    orders: access.sell, kitchen: access.kitchen || access.sell,
    stock: access.stock || access.produce || access.finance,
    losses: access.waste, production: access.produce, waste: access.produce && access.waste,
    salesreport: access.reports, finance: access.finance, trace: access.trace,
    dashboard: access.reports, reports: access.reports,
    employees: access.employees, attendance: access.attendance,
    products: access.master, recipes: access.master, stores: access.master,
    suppliers: access.master, guide: true,
  };
}
export function navigation(title, view, icon, access) {
  const visible = visiblePages(access);
  return sections.map(section => ({...section, pages: section.pages.filter(key => visible[key])}))
    .filter(section => section.pages.length)
    .map(section => `<section class="nav-section" aria-label="${section.label}"><span class="nav-heading">${section.label}</span>${section.pages.map(key => `<button type="button" data-view="${key}" class="${view === key ? "active" : ""}" ${view === key ? 'aria-current="page"' : ""}>${icon(key)}<span class="nav-label">${title[key]}</span></button>`).join("")}</section>`)
    .join("");
}
export function mayLeave(busy) {
  if (busy) return false;
  const dirty = document.querySelector('main form[data-dirty="true"]');
  return !dirty || confirm("Isian belum disimpan. Tinggalkan halaman ini?");
}
export function trackForms() {
  document
    .querySelectorAll("main form:not(#filters):not(#catalog-filter)")
    .forEach((form) => {
      form.addEventListener("input", () => (form.dataset.dirty = "true"));
      form.addEventListener("change", () => (form.dataset.dirty = "true"));
    });
}
