import {escape as e,today,money,num} from './core.mjs';
import {productPhoto} from './product-photos.mjs';
import {dashboardRange,validDashboardDates,dashboardTabs,dashboardSales,dashboardStock,dashboardRejects,dashboardCustomers} from './dashboard-data.mjs';

import {dashboardReport,financeAccess,reportAccess,inventoryAssets,loadReportCash} from './dashboard-report.mjs';
import {dashboardPrintHTML} from './dashboard-print.mjs';
import {printWindow} from './report-export.mjs';

let tab='transactions',period='day',allStores=false,custom={from:today(),to:today()};
const periods={day:'Hari ini',yesterday:'Kemarin',week:'Minggu ini',month:'Bulan ini',custom:'Pilih tanggal'};
export function resetDashboard(){tab='transactions';period='day';allStores=false;custom={from:today(),to:today()};}
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
function metric(label,value,items=[],note=''){
 return `<article class="dash-metric"><h2>${e(label)}</h2><strong class="dash-metric-value" title="${e(value)}">${e(value)}</strong>${items.length?`<dl class="dash-breakdown">${items.map(([name,value])=>`<div><dt>${e(name)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`:''}${note?`<p class="dash-metric-note">${e(note)}</p>`:''}</article>`;
}
function chart(a){
 const {bins,unknown,hourly,step}=a.timeline,max=Math.max(0,...bins.map(b=>b.total)),ceiling=max||1;
 const compact=v=>new Intl.NumberFormat('id-ID',{notation:'compact',maximumFractionDigits:1}).format(v);
 return `<section class="dash-traffic" aria-labelledby="dash-chart-title"><div class="dash-section-head"><div><h2 id="dash-chart-title">Traffic penjualan</h2><p>${hourly?'Per 4 jam · WIB':step===1?'Omzet per hari':`Omzet per ${step} hari`}</p></div><span class="dash-chart-unit">Rupiah</span></div><div class="dash-chart"><div class="dash-y-axis" aria-hidden="true"><span>${compact(max)}</span><span>${compact(max/2)}</span><span>0</span></div><div class="dash-chart-plot"><div class="dash-grid-lines" aria-hidden="true"><i></i><i></i><i></i></div><div class="dash-bars" style="--bar-count:${bins.length}">${bins.map((b,i)=>`<button type="button" class="dash-bar" data-dash-bar="${i}" data-total="${b.total}" aria-label="${e(b.detail+': '+money(b.total)+', '+num(b.count)+' transaksi')}" aria-pressed="false" title="${e(b.detail+': '+money(b.total))}"><span class="dash-bar-area"><span class="dash-bar-fill" style="height:${b.total>0?Math.max(1,b.total/ceiling*100):0}%"></span></span><span class="dash-bar-label">${e(b.label)}</span></button>`).join('')}</div>${!a.tx.length?'<span class="dash-chart-empty">Belum ada penjualan pada periode ini</span>':''}</div></div><p class="dash-chart-detail" id="dash-chart-detail" role="status">${hourly?'Jam mengikuti waktu pencatatan transaksi.':'Pilih batang untuk melihat omzet dan jumlah transaksi.'}</p>${unknown.count?`<p class="dash-note">${num(unknown.count)} transaksi (${money(unknown.total)}) belum memiliki jam yang sesuai tanggal penjualan. Tetap dihitung pada total omzet.</p>`:''}</section>`;
}
function topProducts(a){
 return `<section class="dash-panel dash-top-products">${heading('5 penjualan teratas','Berdasarkan omzet setelah diskon',link('Laporan','reports'))}${a.topProducts.length?`<ol class="dash-ranking">${a.topProducts.map((p,i)=>{const photo=p.product&&productPhoto(p.product);return `<li><span class="dash-rank">${String(i+1).padStart(2,'0')}</span><span class="dash-product-photo">${photo?`<img src="${e(photo)}" alt="" loading="lazy" decoding="async">`:`<span>${e(initials(p.name))}</span>`}</span><div class="dash-product-copy"><h3>${e(p.name)}</h3><p>${e(units(p.units))}</p><div class="dash-rank-track" aria-hidden="true"><span style="width:${a.total?Math.max(0,Math.min(100,p.revenue/a.total*100)):0}%"></span></div></div><strong class="dash-row-value">${money(p.revenue)}</strong></li>`;}).join('')}</ol>`:empty('Produk terlaris akan tampil di sini','Selesaikan transaksi POS pada toko dan periode yang dipilih.')}</section>`;
}
const financeValue=v=>v===null?'Belum lengkap':money(v);
function financialPanel(s,f){
 if(!financeAccess(s))return '';
 const m=dashboardReport(s,f).financial;
 return `<div class="dash-metrics dash-financial" aria-label="Profit, kerugian, dan aset">${metric('Profit / rugi bersih',financeValue(m.result),[['Laba kotor',financeValue(m.gross)],['Operasional',financeValue(m.operating)]],'Penjualan − HPP − waste − operasional tercatat')}${metric('Kerugian stok / waste',financeValue(m.loss),[],'Kehilangan modal tercatat; angka negatif adalah koreksi waste')}${metric('Estimasi nilai aset',financeValue(m.assets.total),m.assets.unknown?[['Nilai terhitung',money(m.assets.known)]]:[],'Modal sisa stok saat ini · termasuk bahan & reject; bukan nilai jual')}</div>${m.result===null||m.assets.unknown?'<p class="dash-note dash-finance-warning">Ada modal atau biaya yang belum lengkap. Periksa rincian pada Cetak laporan A4.</p>':''}`;
}
function transactionPanel(a,s,f){
 return `<div class="dash-metrics">${metric('Omzet',money(a.total),a.payments.map(p=>[p.name,money(p.total)]),'Penjualan lunas setelah diskon')}${metric('Transaksi',num(a.tx.length),a.payments.map(p=>[p.name,num(p.count)]),'Transaksi batal tidak dihitung')}</div>${financialPanel(s,f)}<div class="dash-sales-grid">${chart(a)}${topProducts(a)}</div>`;
}
function stockPanel(s,f){
 const a=dashboardStock(s,f.store),assets=financeAccess(s)?inventoryAssets(s,f.store):null,action=allowed(s,'stock','produce')?link('Buka stok','stock'):link('Laporan','reports');
 return `<div class="dash-metrics">${metric('Produk tersedia',num(a.available),[],'Produk fisik dengan sisa stok lebih dari nol')}${metric('Stok kosong',num(a.empty),[],'Produk fisik yang perlu diperiksa')}${assets?metric('Estimasi nilai aset',financeValue(assets.total),[],'Modal sisa stok saat ini · termasuk bahan & reject'):''}</div><section class="dash-panel">${heading('Ringkasan stok','Posisi stok saat ini · setiap satuan ditampilkan terpisah',action)}<div class="dash-unit-chips">${[...a.units].map(([unit,qty])=>`<span>${num(qty)} <small>${e(unit)}</small></span>`).join('')}</div>${a.rows.length?`<ul class="dash-records">${a.rows.slice(0,12).map(r=>`<li><div><h3>${e(r.name)}</h3><p>${r.qty>0?(r.reject?num(r.reject)+' kg termasuk reject':'Stok fisik tersedia'):'Stok kosong'}${r.pieces?' · '+num(r.pieces)+' butir':''}</p></div><strong>${num(r.qty)} <small>${e(r.unit)}</small></strong></li>`).join('')}</ul><p class="dash-note">Menampilkan ${Math.min(12,a.rows.length)} dari ${a.rows.length} produk. Produk kosong ditampilkan lebih dulu.</p>`:empty('Belum ada produk stok','Tambahkan master produk dan catat penerimaan barang.')}</section>`;
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
 return `<section class="dash-workspace" aria-label="Dashboard toko"><div class="dash-profile-row"><div class="dash-profile"><span class="dash-avatar">${person.profile_photo?`<img src="${e(person.profile_photo)}" alt="Foto ${e(name)}">`:`<span>${e(initials(name))}</span>`}</span><div><h2>${e(name)}</h2><p>${e(roles[person.role]||person.role||'Staff')}</p></div></div><label class="dash-store"><span>Store</span><select id="dash-store" aria-label="Toko dashboard"><option value="" ${!f.store?'selected':''}>Semua toko</option>${s.stores.map(st=>`<option value="${e(st.id)}" ${st.id===f.store?'selected':''}>${e(st.name)}</option>`).join('')}</select></label></div><div class="dash-tabs" style="--dash-tabs:${tabs.length}" role="group" aria-label="Ringkasan dashboard">${tabs.map(([key,label])=>`<button type="button" data-dash-tab="${key}" aria-pressed="${key===tab}">${label}</button>`).join('')}</div><div class="dash-period-row"><span class="dash-date-caption">${e(tab==='stock'?'Posisi stok saat ini':f.from===f.to?dateLabel(f.from):dateLabel(f.from)+' – '+dateLabel(f.to))}</span><div>${reportAccess(s)?'<button type="button" class="dash-print" id="dash-print">Cetak laporan A4</button>':''}<button type="button" class="dash-refresh" id="dash-refresh" aria-label="Perbarui data dashboard" title="Perbarui data">${refreshIcon}</button><label class="dash-period"><select id="dash-period" aria-label="Periode dashboard" ${tab==='stock'?'disabled':''}>${Object.entries(periods).map(([key,label])=>`<option value="${key}" ${key===period?'selected':''}>${label}</option>`).join('')}</select></label></div></div>${period==='custom'&&tab!=='stock'?`<div class="dash-custom"><label>Dari<input type="date" id="dash-from" value="${f.from}" max="${today()}" required></label><label>Sampai<input type="date" id="dash-to" value="${f.to}" max="${today()}" required></label><p id="dash-date-error" role="alert"></p></div>`:''}<div id="dash-content">${page}</div></section>`;
}
export function bindDashboard(s,activeStore,ctx){
 const $=q=>document.querySelector(q);if(!$('#dash-period'))return;
 const canChange=()=>!ctx.isBusy?.();
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
