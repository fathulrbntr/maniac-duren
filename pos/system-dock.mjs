import { visibleSections } from './navigation.mjs';

// Compact operational shortcuts; labels remain available to assistive technology
// and as native tooltips without taking up space in the dock.
const stages = [
  { page: 'stock', label: 'Barang masuk', path: 'M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10 M7 5l10 5' },
  { page: 'orders', label: 'Penjualan', path: 'M7 4H5v17l3-2 4 2 4-2 3 2V4h-2 M9 3h6v4H9z M8 11h8 M8 15h5' },
  { page: 'products', action: 'scan', label: 'Scan barcode produk', path: 'M7 3H3v4 M17 3h4v4 M3 17v4h4 M21 17v4h-4 M7 8v8 M10 8v8 M14 8v8 M17 8v8' },
  { page: 'kitchen', label: 'Kitchen', path: 'M5 10h14v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z M2 11h3 M19 11h3 M8 3v3 M12 2v4 M16 3v3' },
  { page: 'reports', label: 'Laporan', path: 'M4 20V4 M4 20h17 M8 16v-5 M13 16V7 M18 16v-9' },
];

export function systemDock(view, access) {
  const allowed = new Set(visibleSections(access).flatMap(group => group.pages));
  const items = stages.filter(stage => allowed.has(stage.page));
  if (!items.length) return '';
  const current = ['cashier', 'shifts'].includes(view) ? 'orders' : view;
  return `<nav class="system-dock" aria-label="Alur kerja operasional" style="--dock-columns:${items.length};--dock-width:${items.length * 56 + 12}px">${items.map(({ page, action, label, path }) => `<button type="button" ${action === 'scan' ? 'data-dock-scan' : `data-view="${page}"`} aria-label="${label}" title="${label}" ${!action && page === current ? 'aria-current="page"' : ''}><svg class="system-dock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg></button>`).join('')}</nav>`;
}
