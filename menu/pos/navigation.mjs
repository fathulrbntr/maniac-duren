export const sections = [
  {
    label: "Operasional",
    pages: ["orders", "cashier", "stock", "sorting", "production", "waste", "losses"],
  },
  { label: "Laporan", pages: ["salesreport", "finance", "trace", "dashboard", "reports"] },
  { label: "Tim", pages: ["employees", "attendance"] },
  { label: "Panduan", pages: ["guide"] },
  {
    label: "Master data",
    pages: ["products", "recipes", "stores", "suppliers"],
  },
];
export function navigation(title, view, icon, access) {
  return sections
    .map(
      (section) =>
        `<div class="nav-section"><span class="nav-heading">${section.label}</span>${section.pages.filter(key=>!access||({salesreport:access.reports,orders:access.sell||access.kitchen,dashboard:access.reports,cashier:access.sell,stock:access.stock||access.produce,sorting:access.stock,production:access.produce,waste:access.waste,losses:access.waste,reports:access.reports,finance:access.finance,trace:access.trace,employees:access.employees,attendance:access.attendance,products:access.master,recipes:access.master,stores:access.master,suppliers:access.master,guide:true})[key]).map((key) => `<button data-view="${key}" class="${view === key ? "active" : ""}" ${view === key ? 'aria-current="page"' : ""}>${icon(key)}${title[key]}</button>`).join("")}</div>`,
    )
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
