import {escape as e,today,money,num} from './core.mjs';
import {productPhoto} from './product-photos.mjs';
import {dashboardRange,validDashboardDates,dashboardTabs,dashboardSales,dashboardStock,dashboardRejects,dashboardCustomers,filterDashboardStock,stockCategoryButtons,stockSortOptions} from './dashboard-data.mjs';

import {dashboardReport,financeAccess,reportAccess,inventoryAssets,loadReportCash} from './dashboard-report.mjs';
import {dashboardPrintHTML} from './dashboard-print.mjs';
import {printWindow} from './report-export.mjs';

let tab='transactions',period='day',allStores=false,custom={from:today(),to:today()},stockCategory='all',stockSort='ready';
const periods={day:'Hari ini',yesterday:'Kemarin',week:'Minggu ini',month:'Bulan ini',custom:'Pilih tanggal'};
export function resetDashboard(){tab='transactions';period='day';allStores=false;custom={from:today(),to:today()};stockCategory='all';stockSort='ready';}
export function followDashboardStore(){allStores=false;}
const allowed=(s,...keys)=>!s.access||keys.some(k=>s.access[k]);
const filter=(s,activeStore)=>({...dashboardRange(period,custom),store:allStores?'':s.stores.find(x=>x.id===activeStore)?.id||s.stores[0]?.id||''});
const initials=name=>String(name||'MD').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const svg=(path)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const arrow=svg('<path d="M5 12h14m-5-5 5 5-5 5"/>');
const refreshIcon=svg('<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 2M4 16l2 2a7 7 0 0 0 12-1"/>');
const empty=(title,detail)=>`<div class="dash-empty"><span class="dash-empty-mark" aria-hidden="true">${svg('<path d="M5 20V4m0 16h15M9 16v-4m5 4V8m5 8v-6"/>')}</span><strong>${e(title)}</strong><p>${e(detail)}</p></div>`;
const units=map=>[...map].map(([unit,qty])=>num(qty)+' '+unit).join(' · ');
const dateLabel=day=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));
const link=(label,view)=>`<button type="button" class="dash-link" data-view="${view}">${e(label)}${arrow}</button>`;
const heading=(title,subtitle,action='')=>`<div class="dash-section-head"><div><h2>${e(title)}</h2>${subtitle?`<p>${e(subtitle)}</p>`:''}</div>${action}</div>`;
const metricIcons={
 'Omzet':'<path d="M4 17V9m5 8V4m5 13v-6m5 6V7"/>',
 'Transaksi':'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6m-6 4h6"/>',
 'Rata-rata transaksi':'<path d="M4 17 9 12l4 3 7-10m-5 0h5v5"/>',
 'Profit / rugi bersih':'<path d="M12 3v18m5-14H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6"/>',
 'Kerugian stok / waste':'<path d="m12 3 10 17H2Z"/><path d="M12 9v4m0 3v1"/>',
 'Estimasi nilai aset':'<path d="m12 3 9 5v9l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5m-9 5v9"/>'
};
function metric(label,value,items=[],note=''){
 return `<article class="dash-metric"><div class="dash-metric-heading"><span class="dash-metric-icon">${svg(metricIcons[label]||'<path d="M4 19V5h16v14ZM8 15v-4m4 4V8m4 7v-5"/>')}</span><h2>${e(label)}</h2></div><strong class="dash-metric-value" title="${e(value)}">${e(value)}</strong>${items.length?`<dl class="dash-breakdown">${items.map(([name,value])=>`<div><dt>${e(name)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`:''}${note?`<p class="dash-metric-note">${e(note)}</p>`:''}</article>`;
}
function chart(a){
 const {bins,unknown,hourly,step}=a.timeline,max=Math.max(0,...bins.map(b=>b.total)),ceiling=max||1;
 const compact=v=>new Intl.NumberFormat('id-ID',{notation:'compact',maximumFractionDigits:1}).format(v);
 const points=bins.map((b,i)=>[bins.length===1?300:i/(bins.length-1)*600,160-b.total/ceiling*140]);
 const line=points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
 return `<section class="dash-panel dash-traffic" aria-labelledby="dash-chart-title"><div class="dash-section-head"><div><h2 id="dash-chart-title">Traffic penjualan</h2><p>${hourly?'Omzet per 4 jam · WIB':step===1?'Omzet per hari':`Omzet per ${step} hari`}</p></div><span class="dash-chart-legend"><i></i>Omzet</span></div><div class="dash-chart"><div class="dash-y-axis" aria-hidden="true"><span>${compact(max)}</span><span>${compact(max/2)}</span><span>0</span></div><div class="dash-chart-plot"><svg class="dash-line-chart" viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--chart-1)" stop-opacity=".22"/><stop offset="100%" stop-color="var(--chart-1)" stop-opacity="0"/></linearGradient></defs><path class="dash-grid-line" d="M0 20H600 M0 90H600 M0 160H600"/><path d="${line} L600,180 L0,180 Z" fill="url(#dash-area)"/><path d="${line}" fill="none" stroke="var(--chart-1)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg><div class="dash-bars" style="--bar-count:${bins.length}">${bins.map((b,i)=>`<button type="button" class="dash-bar" style="--point-x:${bins.length===1?50:i/(bins.length-1)*100}%" data-dash-bar="${i}" data-total="${b.total}" aria-label="${e(b.detail+': '+money(b.total)+', '+num(b.count)+' transaksi')}" aria-pressed="false" title="${e(b.detail+': '+money(b.total))}"><span class="dash-bar-dot" style="--point-y:${points[i][1]/180*100}%"></span><span class="dash-bar-label">${e(b.label)}</span></button>`).join('')}</div>${!a.tx.length?'<span class="dash-chart-empty">Belum ada penjualan pada periode ini</span>':''}</div></div><p class="dash-chart-detail" id="dash-chart-detail" role="status">Pilih titik grafik untuk melihat omzet dan jumlah transaksi.</p>${unknown.count?`<p class="dash-note">${num(unknown.count)} transaksi (${money(unknown.total)}) tanpa jam yang sesuai tanggal penjualan tetap dihitung pada total omzet.</p>`:''}</section>`;
}
function topProducts(a){
 return `<section class="dash-panel dash-top-products">${heading('5 penjualan teratas','Berdasarkan omzet setelah diskon',link('Laporan','reports'))}${a.topProducts.length?`<ol class="dash-ranking">${a.topProducts.map((p,i)=>{const photo=p.product&&productPhoto(p.product);return `<li><span class="dash-rank">${String(i+1).padStart(2,'0')}</span><span class="dash-product-photo">${photo?`<img src="${e(photo)}" alt="" loading="lazy" decoding="async">`:`<span>${e(initials(p.name))}</span>`}</span><div class="dash-product-copy"><h3>${e(p.name)}</h3><p>${e(units(p.units))}</p><div class="dash-rank-track" aria-hidden="true"><span style="width:${a.total?Math.max(0,Math.min(100,p.revenue/a.total*100)):0}%"></span></div></div><strong class="dash-row-value">${money(p.revenue)}</strong></li>`;}).join('')}</ol>`:empty('Produk terlaris akan tampil di sini','Selesaikan transaksi POS pada toko dan periode yang dipilih.')}</section>`;
}
const financeValue=v=>v===null?'Belum lengkap':money(v);
function financialMetrics(m){
 return `${metric('Profit / rugi bersih',financeValue(m.result),[],'Setelah HPP & biaya tercatat')}${metric('Kerugian stok / waste',financeValue(m.loss),[],'Modal stok yang hilang')}${metric('Estimasi nilai aset',financeValue(m.assets.total),[],'Modal sisa stok saat ini')}`;
}
function paymentPanel(a){
 const colors=['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)','var(--chart-5)'];
 const methods=a.payments.map((p,i)=>({...p,color:colors[i%colors.length]}));
 let cursor=0;const segments=methods.filter(p=>p.total>0).map(p=>{const from=cursor;cursor+=a.total>0?p.total/a.total*100:0;return `${p.color} ${from}% ${cursor}%`;});
 return `<section class="dash-panel dash-payments">${heading('Metode pembayaran','Komposisi omzet lunas')}<div class="dash-payment-layout"><div class="dash-donut" style="--donut:conic-gradient(${segments.length?segments.join(','):'var(--line) 0% 100%'})" aria-hidden="true"><span><strong>${num(a.tx.length)}</strong><small>transaksi</small></span></div><dl class="dash-payment-list">${methods.filter(p=>p.count>0).map(p=>`<div><dt><i style="background:${p.color}"></i>${e(p.name)}<small>${num(p.count)} transaksi</small></dt><dd>${money(p.total)}</dd></div>`).join('')||'<div><dt>Belum ada pembayaran</dt><dd>—</dd></div>'}</dl></div></section>`;
}
function stockOverview(s,f){
 if(!allowed(s,'stock','trace','produce'))return '';
 const a=dashboardStock(s,f.store),total=a.available+a.empty,percent=total?Math.round(a.available/total*100):0;
 return `<section class="dash-panel dash-stock-overview">${heading('Ketersediaan produk','Stok fisik saat ini',allowed(s,'stock','produce')?link('Stok','stock'):link('Laporan','reports'))}<strong class="dash-overview-value">${num(a.available)}<small> / ${num(total)} produk</small></strong><div class="dash-stock-track" role="img" aria-label="${percent}% produk tersedia"><span style="width:${percent}%"></span></div><div class="dash-stock-key"><span><i></i>Tersedia <b>${num(a.available)}</b></span><span><i></i>Kosong <b>${num(a.empty)}</b></span></div><p class="dash-note">${a.empty?'Periksa produk kosong sebelum menerima pesanan.':'Ketersediaan mengikuti sisa stok setiap produk.'}</p></section>`;
}
function financeOverview(m){
 return `<section class="dash-panel dash-finance-overview">${heading('Rincian keuangan','Mengikuti periode yang dipilih')}<dl class="dash-finance-list"><div><dt>Laba kotor</dt><dd>${financeValue(m.gross)}</dd></div><div><dt>Biaya operasional</dt><dd>${financeValue(m.operating)}</dd></div><div><dt>Kerugian stok / waste</dt><dd>${financeValue(m.loss)}</dd></div></dl><p class="dash-note">${m.result===null||m.assets.unknown?'Ada modal atau biaya belum lengkap. Periksa Cetak laporan A4.':'Profit = penjualan − HPP − waste − biaya operasional.'}</p>${m.assets.unknown?`<p class="dash-note">Aset terhitung: ${money(m.assets.known)}; sebagian modal belum diketahui.</p>`:''}</section>`;
}
function recentTransactions(a,s){
 const stamp=t=>t.order?.paid_at||t.paid_at||t.order?.created_at||t.created_at||'';
 const rows=[...a.tx].sort((x,y)=>String(y.date).localeCompare(String(x.date))||stamp(y).localeCompare(stamp(x))||String(y.id).localeCompare(String(x.id))).slice(0,6);
 return `<section class="dash-panel dash-recent">${heading('Transaksi terbaru','Penjualan lunas pada outlet dan periode terpilih',link('Semua transaksi','reports'))}${rows.length?`<div class="table-wrap"><table><caption class="sr-only">Enam transaksi lunas terbaru</caption><thead><tr><th>Transaksi</th><th>Outlet</th><th>Pembayaran</th><th>Status</th><th>Tanggal</th><th class="dash-numeric">Total</th></tr></thead><tbody>${rows.map(t=>`<tr><td><strong title="${e(t.id)}">#${e(String(t.id).slice(-8).toUpperCase())}</strong><small>${e(t.lines[0]?.name||'Penjualan POS')}${t.lines.length>1?' +'+(t.lines.length-1):''}</small></td><td>${e(s.stores.find(st=>st.id===t.storeId)?.name||'—')}</td><td>${e(t.payment||'Belum tercatat')}</td><td><span class="dash-paid"><i></i>Lunas</span></td><td>${e(dateLabel(t.date))}</td><td class="dash-numeric"><strong>${money(t.total)}</strong></td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada transaksi lunas','Transaksi yang sudah dibayar akan tampil sesuai outlet dan periode yang dipilih.')}</section>`;
}
function transactionPanel(a,s,f){
 const m=financeAccess(s)?dashboardReport(s,f).financial:null;
 return `<div class="dash-metrics dash-summary-metrics">${metric('Omzet',money(a.total),[],'Penjualan lunas setelah diskon')}${metric('Transaksi',num(a.tx.length),[],'Transaksi lunas aktif')}${metric('Rata-rata transaksi',money(a.tx.length?a.total/a.tx.length:0),[],'Omzet ÷ transaksi')}${m?financialMetrics(m):''}</div><div class="dash-sales-grid">${chart(a)}${topProducts(a)}</div><div class="dash-insights">${paymentPanel(a)}${stockOverview(s,f)}${m?financeOverview(m):''}</div>${recentTransactions(a,s)}`;
}
function stockPanel(s,f){
 const a=dashboardStock(s,f.store),filtered=filterDashboardStock(s,a,{category:stockCategory,sort:stockSort}),assets=financeAccess(s)?inventoryAssets(s,f.store):null,action=allowed(s,'stock','produce')?link('Buka stok','stock'):link('Laporan','reports');
 const categoryName=stockCategoryButtons.find(([key])=>key===filtered.category)?.[1]||'';
 return `<div class="dash-metrics">${metric('Produk tersedia',num(a.available),[],'Produk fisik dengan sisa stok lebih dari nol')}${metric('Stok kosong',num(a.empty),[],'Produk fisik yang perlu diperiksa')}${assets?metric('Estimasi nilai aset',financeValue(assets.total),[],'Modal sisa stok saat ini · termasuk bahan & reject'):''}</div><section class="dash-panel dash-stock-panel">${heading('Ringkasan stok','Posisi stok saat ini · setiap satuan ditampilkan terpisah',action)}<div class="dash-stock-controls"><div class="dash-stock-categories" role="group" aria-label="Kategori stok">${stockCategoryButtons.map(([key,label])=>`<button type="button" data-dash-stock-category="${key}" aria-pressed="${key===filtered.category}">${label}</button>`).join('')}</div><label class="dash-stock-sort">Urutkan<select id="dash-stock-sort">${Object.entries(stockSortOptions).map(([key,label])=>`<option value="${key}" ${key===filtered.sort?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="dash-unit-chips">${[...filtered.units].map(([unit,qty])=>`<span>${num(qty)} <small>${e(unit)}</small></span>`).join('')}</div>${filtered.rows.length?`<ul class="dash-records">${filtered.rows.slice(0,12).map(r=>`<li data-dash-stock-product="${e(r.id)}"><div><h3>${e(r.name)}</h3><p>${r.qty>0?(r.reject?num(r.reject)+' kg termasuk reject':'Stok fisik tersedia'):'Stok kosong'}${r.pieces?' · '+num(r.pieces)+' butir':''}</p></div><strong>${num(r.qty)} <small>${e(r.unit)}</small></strong></li>`).join('')}</ul><p class="dash-note">Menampilkan ${Math.min(12,filtered.rows.length)} dari ${filtered.rows.length} produk sesuai filter.</p>`:empty(filtered.category==='all'?'Belum ada produk stok':'Belum ada produk '+categoryName,'Tambahkan produk ke kategori yang sesuai di Master Barang.')}</section>`;
}
function supplierPanel(a){
 const known=a.supplierRows.filter(r=>r.id),unknown=a.supplierRows.filter(r=>!r.id).reduce((n,r)=>n+r.revenue,0);
 return `<div class="dash-metrics">${metric('Omzet terhubung',money(known.reduce((n,r)=>n+r.revenue,0)),[],known.length+' supplier dalam periode ini')}${metric('Belum terpetakan',money(unknown),[],'Penjualan tanpa asal supplier yang dapat ditelusuri')}</div><section class="dash-panel">${heading('Penjualan per supplier','Berdasarkan asal barang dan alokasi bahan',link('Laporan','reports'))}${a.supplierRows.length?`<ul class="dash-records">${a.supplierRows.slice(0,12).map(r=>`<li><div><h3>${e(r.name)}</h3><p>${e([...r.methods].join(' · '))}</p></div><strong>${money(r.revenue)}</strong></li>`).join('')}</ul>`:empty('Belum ada penjualan supplier','Data mengikuti penjualan dan sumber stok pada periode ini.')}</section>`;
}
function rejectPanel(s,f){
 const a=dashboardRejects(s,f),labels={mark:'Catat reject',direct:'Reject & langsung olah',process:'Olah reject',legacy:'Olah reject',coral:'Olah Coral',loss:'Waste / dibuang'};
 return `<div class="dash-metrics">${metric('Reject tercatat',num(a.markedKg)+' kg',[],'Buah yang ditandai reject pada periode ini')}${metric('Reject diolah',num(a.processedKg)+' kg',[],'Berat buah yang masuk proses pengolahan')}</div><section class="dash-panel">${heading('Aktivitas reject & waste',a.rows.length+' pencatatan aktif',allowed(s,'waste')?link('Buka reject','waste'):link('Laporan','reports'))}${a.rows.length?`<ul class="dash-records">${a.rows.slice(0,10).map(r=>`<li><div><h3>${e(r.sourceName||s.products.find(p=>p.id===r.sourceProductId)?.name||labels[r.kind]||'Reject')}</h3><p>${e(labels[r.kind]||r.kind)} · ${e(dateLabel(r.date))}</p><p>${e(r.reason||'')}</p></div><strong>${num(r.kg??r.qty)} <small>${e(r.unit||'kg')}</small></strong></li>`).join('')}</ul>`:empty('Belum ada pencatatan reject','Pencatatan yang dibatalkan tidak ditampilkan.')}</section>`;
}
function customerPanel(s,a){
 const data=dashboardCustomers(s,a.tx);
 return `<div class="dash-metrics">${metric('Nama pada invoice',num(data.rows.length),[],data.matched+' transaksi memiliki invoice bernama')}${metric('Belum bernama',num(data.anonymous),[],'Transaksi POS tanpa invoice bernama')}</div><section class="dash-panel">${heading('Customer','Dikelompokkan berdasarkan nama penerima pada invoice',link('Admin Dokumen','documents'))}${data.rows.length?`<ul class="dash-records">${data.rows.slice(0,12).map(r=>`<li><div><h3>${e(r.name)}</h3><p>${num(r.count)} transaksi terkait</p></div><strong>${money(r.total)}</strong></li>`).join('')}</ul>`:empty('Belum ada nama pelanggan','Buat invoice dari transaksi POS dan isi nama pelanggan di Admin Dokumen.')}<p class="dash-note">Nama yang sama digabung. Jumlah ini bukan jumlah pengunjung atau pelanggan unik.</p></section>`;
}
export function dashboardPage(s,activeStore){
 const tabs=dashboardTabs(s);if(!tabs.some(x=>x[0]===tab))tab=tabs[0]?.[0]||'transactions';
 if(!tabs.length)return empty('Dashboard tidak tersedia','Akun ini belum memiliki akses laporan.');
 const f=filter(s,activeStore),a=['transactions','suppliers','customers'].includes(tab)?dashboardSales(s,f):null;
 const person=s.employees?.find(p=>p.id===s.me?.id)||s.me||{},name=person.name||'Akun login',roles={owner:'Owner',manager:'Manager',cashier:'Kasir',kitchen:'Kitchen',warehouse:'Gudang',staff:'Staff'};
 const page=tab==='transactions'?transactionPanel(a,s,f):tab==='stock'?stockPanel(s,f):tab==='suppliers'?supplierPanel(a):tab==='reject'?rejectPanel(s,f):customerPanel(s,a);
 return `<section class="dash-workspace" aria-label="Dashboard toko"><div class="dash-profile-row"><div class="dash-profile"><span class="dash-avatar">${person.profile_photo?`<img src="${e(person.profile_photo)}" alt="Foto ${e(name)}">`:`<span>${e(initials(name))}</span>`}</span><div><h2>Ringkasan operasional</h2><p>Selamat datang, ${e(name)} <span class="dash-role">· ${e(roles[person.role]||person.role||'Staff')}</span></p></div></div><label class="dash-store"><span>Outlet</span><select id="dash-store" aria-label="Toko dashboard"><option value="" ${!f.store?'selected':''}>Semua toko</option>${s.stores.map(st=>`<option value="${e(st.id)}" ${st.id===f.store?'selected':''}>${e(st.name)}</option>`).join('')}</select></label></div><div class="dash-tabs" style="--dash-tabs:${tabs.length}" role="group" aria-label="Ringkasan dashboard">${tabs.map(([key,label])=>`<button type="button" data-dash-tab="${key}" aria-pressed="${key===tab}">${label}</button>`).join('')}</div><div class="dash-period-row"><span class="dash-date-caption">${e(tab==='stock'?'Posisi stok saat ini':f.from===f.to?dateLabel(f.from):dateLabel(f.from)+' – '+dateLabel(f.to))}</span><div>${reportAccess(s)?'<button type="button" class="dash-print" id="dash-print">Cetak laporan A4</button>':''}<button type="button" class="dash-refresh" id="dash-refresh" aria-label="Perbarui data dashboard" title="Perbarui data">${refreshIcon}</button><label class="dash-period"><select id="dash-period" aria-label="Periode dashboard" ${tab==='stock'?'disabled':''}>${Object.entries(periods).map(([key,label])=>`<option value="${key}" ${key===period?'selected':''}>${label}</option>`).join('')}</select></label></div></div>${period==='custom'&&tab!=='stock'?`<div class="dash-custom"><label>Dari<input type="date" id="dash-from" value="${f.from}" max="${today()}" required></label><label>Sampai<input type="date" id="dash-to" value="${f.to}" max="${today()}" required></label><p id="dash-date-error" role="alert"></p></div>`:''}<div id="dash-content">${page}</div></section>`;
}
export function bindDashboard(s,activeStore,ctx){
 const $=q=>document.querySelector(q);if(!$('#dash-period'))return;
 const canChange=()=>!ctx.isBusy?.();
 document.querySelectorAll('[data-dash-stock-category]').forEach(b=>b.onclick=()=>{if(!canChange())return;stockCategory=b.dataset.dashStockCategory;ctx.render();});
 $('#dash-stock-sort')?.addEventListener('change',ev=>{if(!canChange()){ev.target.value=stockSort;return;}stockSort=ev.target.value;ctx.render();});
 document.querySelectorAll('[data-dash-tab]').forEach(b=>b.onclick=()=>{if(!canChange())return;tab=b.dataset.dashTab;ctx.render();});
 $('#dash-period').onchange=ev=>{if(!canChange()){ev.target.value=period;return;}custom=dashboardRange(period,custom);period=ev.target.value;ctx.render();};
 $('#dash-store').onchange=ev=>{
  if(!canChange()){ev.target.value=filter(s,activeStore).store;return;}
  if(!ev.target.value){allStores=true;ctx.render();}
  else if(!ctx.changeStore(ev.target.value))ev.target.value=filter(s,activeStore).store;
 };
 for(const key of ['from','to'])$('#dash-'+key)?.addEventListener('change',()=>{
  const next={from:$('#dash-from').value,to:$('#dash-to').value};
  if(!validDashboardDates(next.from,next.to)){$('#dash-date-error').textContent='Isi tanggal yang valid, berurutan, dan tidak melewati hari ini.';return;}
  if(!canChange())return;custom=next;ctx.render();
 });
 $('#dash-refresh').onclick=async ev=>{if(!canChange())return;const b=ev.currentTarget;b.disabled=true;b.setAttribute('aria-busy','true');try{await ctx.refresh();ctx.render();}catch(error){ctx.toast(error.message);}finally{b.disabled=false;b.removeAttribute('aria-busy');}};
 $('[data-dash-home]')?.addEventListener('click',()=>{if(!canChange())return;tab='transactions';ctx.render();});
 $('#dash-print')?.addEventListener('click',async ev=>{
  if(!canChange()||!reportAccess(s))return;
  const f=filter(s,activeStore);
  if(period==='custom'&&tab!=='stock'&&!validDashboardDates($('#dash-from')?.value,$('#dash-to')?.value)){ctx.toast('Perbaiki tanggal sebelum mencetak laporan.');return;}
  const b=ev.currentTarget;b.disabled=true;
  let w;
  try{
   // Open during the click, before awaiting history, to support popup blockers.
   const snapshot=structuredClone(s),r=dashboardReport(snapshot,f);
   w=printWindow('Laporan Dashboard Maniac Duren','<div id="dashboard-print-content" role="status">Menyiapkan laporan...</div>');
   const printButton=w.document.getElementById('print');printButton.disabled=true;
   if(snapshot.cashierShiftVersion>=83&&ctx.readShifts){
    try{r.cash=await loadReportCash(ctx.readShifts,f);}catch(error){r.cashError='Riwayat kas tidak dapat dimuat: '+error.message;}
   }
   if(w.closed)return;
   w.document.getElementById('dashboard-print-content').innerHTML=dashboardPrintHTML(snapshot,r);
   printButton.disabled=false;
  }catch(error){if(w&&!w.closed)w.close();ctx.toast(error.message);}
  finally{b.disabled=false;}
 });
 const bars=document.querySelectorAll('[data-dash-bar]');
 bars.forEach(b=>b.onclick=()=>{bars.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('#dash-chart-detail').textContent=b.getAttribute('aria-label');});
}
