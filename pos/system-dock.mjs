import { visibleSections } from './navigation.mjs';
import { sidebarIcon } from './sidebar.mjs';

const svg = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const shortcuts = [
  ['dashboard', 'Beranda', svg('<path d="m3 10 9-8 9 8v11h-6v-7H9v7H3z"/>')],
  ['orders', 'Kasir', svg('<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 6h8v3H8zM8 13h1m3 0h1m3 0h.01M8 17h1m3 0h1m3 0h.01"/>')],
  ['reports', 'Laporan', svg('<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>')],
  ['kitchen', 'Dapur', svg('<path d="M4 10h16v4a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6zM8 3v3m4-3v3m4-3v3M2 10h20"/>')],
  ['stock', 'Stok', svg('<path d="m3 7 9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>')],
  ['attendance', 'Absensi', svg('<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-12 5 3 3 5-5"/>')],
  ['guide', 'Panduan', svg('<path d="M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4zM12 6v16"/>')],
];

export function systemDock(view, access) {
  const allowed = new Set(visibleSections(access).flatMap(group => group.pages));
  const items = shortcuts.filter(([key]) => allowed.has(key)).slice(0, 2);
  const current = view === 'cashier' ? 'orders' : view;
  const menuActive = !items.some(([key]) => key === current);
  return `<nav class="system-dock" aria-label="Navigasi sistem" style="--dock-columns:${items.length + 1}"><button id="system-dock-menu" type="button" data-sidebar-toggle aria-controls="pos-sidebar" aria-expanded="false" aria-label="Buka menu sistem" ${menuActive ? 'aria-current="page"' : ''}>${sidebarIcon}<span>Menu</span></button>${items.map(([key, label, icon]) => `<button type="button" ${key === 'dashboard' && view === 'dashboard' ? 'data-dash-home' : `data-view="${key}"`} ${key === current ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('')}</nav>`;
}
