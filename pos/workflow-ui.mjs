import { visibleSections } from './navigation.mjs';

const stages = [
  { page: 'stock', title: 'Barang masuk', detail: 'Nota, timbang & modal', views: ['stock'] },
  { page: 'orders', title: 'Penjualan', detail: 'Scan, pesanan & bayar', views: ['orders', 'shifts'] },
  { page: 'kitchen', title: 'Kitchen', detail: 'Buat & siapkan pesanan', views: ['kitchen'] },
  { page: 'reports', title: 'Laporan', detail: 'Penjualan & pergerakan stok', views: ['reports'] },
];

export function workflowNavigation(view, access) {
  if (!stages.some(stage => stage.views.includes(view))) return '';
  const allowed = new Set(visibleSections(access).flatMap(section => section.pages));
  return `<nav class="workflow-nav" aria-label="Urutan kerja operasional">${stages.map((stage, index) => {
    if (!allowed.has(stage.page)) return '';
    const active = stage.views.includes(view);
    return `<button type="button" class="workflow-stage" data-view="${stage.page}" ${active ? 'aria-current="page"' : ''}><span class="workflow-number" aria-hidden="true">${index + 1}</span><span class="workflow-copy"><strong>${stage.title}</strong><small>${stage.detail}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
  }).join('')}</nav>`;
}

export function formSection(number, title, description = '') {
  return `<div class="form-section-heading"><span class="workflow-number" aria-hidden="true">${number}</span><div><h3>${title}</h3>${description ? `<p>${description}</p>` : ''}</div></div>`;
}
