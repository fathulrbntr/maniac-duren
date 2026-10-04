export const sections = [
  {
    label: "Operasional",
    pages: ["dashboard", "cashier", "stock", "production", "waste"],
  },
  { label: "Laporan", pages: ["reports"] },
  {
    label: "Master data",
    pages: ["products", "recipes", "stores", "suppliers"],
  },
];
export function navigation(title, view, icon) {
  return sections
    .map(
      (section) =>
        `<div class="nav-section"><span class="nav-heading">${section.label}</span>${section.pages.map((key) => `<button data-view="${key}" class="${view === key ? "active" : ""}" ${view === key ? 'aria-current="page"' : ""}>${icon(key)}${title[key]}</button>`).join("")}</div>`,
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
