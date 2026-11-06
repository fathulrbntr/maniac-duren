import { visibleSections } from './navigation.mjs';

// One persistent set of operational shortcuts, in the same order for every role.
// Filtering keeps the original stage numbers and existing page permissions.
const stages = [
  { page: 'stock', label: 'Barang masuk', number: 1 },
  { page: 'orders', label: 'Penjualan', number: 2 },
  { page: 'kitchen', label: 'Kitchen', number: 3 },
  { page: 'reports', label: 'Laporan', number: 4 },
];

export function systemDock(view, access) {
  const allowed = new Set(visibleSections(access).flatMap(group => group.pages));
  const items = stages.filter(stage => allowed.has(stage.page));
  if (!items.length) return '';
  const current = ['cashier', 'shifts'].includes(view) ? 'orders' : view;
  return `<nav class="system-dock" aria-label="Alur kerja operasional" style="--dock-columns:${items.length};--dock-width:${items.length * 140 + 16}px">${items.map(({ page, label, number }) => `<button type="button" data-view="${page}" ${page === current ? 'aria-current="page"' : ''}><span class="system-dock-number" aria-hidden="true">${number}</span><span class="system-dock-label">${label}</span></button>`).join('')}</nav>`;
}
