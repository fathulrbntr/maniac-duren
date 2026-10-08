export const sections = [
  { id: 'utama', label: 'Utama', pages: ['dashboard', 'orders', 'kitchen'] },
  { id: 'inventory', label: 'Inventory', pages: ['products', 'stock', 'losses', 'waste'] },
  { id: 'produksi', label: 'Produksi', pages: ['recipes', 'production'] },
  { id: 'laporan', label: 'Keuangan & Laporan', pages: ['finance', 'salesreport', 'trace', 'reports'] },
  { id: 'manajemen', label: 'Manajemen', pages: ['discounts', 'employees', 'attendance', 'stores', 'suppliers'] },
  { id: 'pengaturan', label: 'Pengaturan', pages: ['devices'] },
  { id: 'bantuan', label: 'Bantuan', pages: ['guide'] },
];
export function visibleSections(access) {
  const allowed = access ? {
    devices: access.cashierOwner || access.sell || access.master, discounts: access.cashierOwner, salesreport: access.reports, orders: access.sell, kitchen: access.kitchen || access.sell,
    dashboard: access.reports, stock: access.stock || access.produce,
    production: access.produce, waste: access.waste, losses: access.waste,
    reports: access.reports, finance: access.finance, trace: access.trace,
    employees: access.employees, attendance: access.attendance, products: access.master,
    recipes: access.master, stores: access.master, suppliers: access.master, guide: true,
  } : null;
  return sections.map(section => ({ ...section, pages: section.pages.filter(key => !allowed || allowed[key]) })).filter(section => section.pages.length);
}
export function navigation(title, view, icon, access, closedGroups = {}) {
  return visibleSections(access).map(section => {
    const open = section.pages.includes(view) || !closedGroups[section.id];
    return `<details class="nav-section" data-nav-group="${section.id}" ${open ? 'open' : ''}><summary class="nav-heading"><span>${section.label}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5 5 5-5 5"/></svg></summary><div class="nav-items">${section.pages.map(key => `<button type="button" data-view="${key}" class="nav-item ${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${title[key]}</span></button>`).join('')}</div></details>`;
  }).join('');
}
export function mayLeave(busy) {
  if (busy) return false;
  const dirty = document.querySelector('main form[data-dirty="true"]');
  return !dirty || confirm('Isian belum disimpan. Tinggalkan halaman ini?');
}
export function trackForms() {
  document.querySelectorAll('main form:not(#filters):not(#catalog-filter)').forEach(form => {
    form.addEventListener('input', () => (form.dataset.dirty = 'true'));
    form.addEventListener('change', () => (form.dataset.dirty = 'true'));
  });
}
