import {id,today,money,escape as e} from './core.mjs?v=77';
import {activeShift} from './cashier-shifts.mjs?v=83';
import {showReceipt} from './cashier-ui.mjs?v=83';
const time=v=>v?new Date(v).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB':'—';
const outlet=(s,key)=>s.stores.find(x=>x.id===key)?.name||'Outlet';
const canClose=(s,sh)=>sh.cashierId===s.me?.id||s.me?.role==='owner'||s.access?.finance;
const error=(d,x)=>{d.querySelector('#form-error').textContent=x.message;};
const submit=d=>d.querySelector('[type=submit]');
const field=(label,html)=>`<label class="field">${label}${html}</label>`;
const cashInput=(name,value='')=>`<input name="${name}" type="number" min="0" max="9000000000000000" step="any" value="${e(value)}" required inputmode="decimal">`;
const noteInput=()=>'<textarea name="note" maxlength="300" rows="3" placeholder="Catatan serah terima / penjelasan selisih"></textarea>';
const summary=sh=>{
 const t=sh.summary||{};
 return `<dl class="shift-totals"><dt>Uang awal</dt><dd>${money(sh.openingCash)}</dd><dt>Penjualan (${t.salesCount||0} transaksi)</dt><dd>${money(t.sales||0)}</dd><dt>Refund (${t.refundCount||0} transaksi)</dt><dd>−${money(t.refunds||0)}</dd><dt>Tunai bersih</dt><dd>${money((t.cashSales||0)-(t.cashRefunds||0))}</dd><dt>QRIS bersih</dt><dd>${money((t.qrisSales||0)-(t.qrisRefunds||0))}</dd><dt>Transfer bersih</dt><dd>${money((t.transferSales||0)-(t.transferRefunds||0))}</dd><dt class="shift-total">Kas yang seharusnya</dt><dd class="shift-total">${money(t.expectedCash||0)}</dd>${sh.closedAt?`<dt>Kas aktual</dt><dd>${money(sh.closingCash)}</dd><dt>Selisih</dt><dd class="${t.difference?'error':''}">${money(t.difference||0)}</dd>`:''}</dl>`;
};
export function shiftBanner(s,store){
 if(s.access&&!s.access.sell)return '';
 if(!(s.cashierShiftVersion>=83))return '<aside class="shift-banner"><div><b>Shift kasir belum tersedia</b><p>Pasang database/cashier-shifts-083.sql lalu muat ulang POS.</p></div></aside>';
 const sh=activeShift(s),here=sh?.storeId===store;
 return `<aside class="shift-banner"><div><b>${sh?`<span class="shift-dot"></span> Kasir buka · ${e(sh.cashierName)}`:'Kasir belum dibuka'}</b><p>${sh?`${e(outlet(s,sh.storeId))} · sejak ${e(time(sh.openedAt))}${here?'':' · tutup shift ini sebelum membuka di outlet lain.'}`:'Isi uang awal sebelum menerima pembayaran.'}</p></div><button type="button" ${sh?`data-shift-close="${e(sh.id)}"`:'data-shift-open'} class="${sh?'':'primary'}">${sh?'Tutup kasir':'Buka kasir'}</button></aside>`;
}
export function bindShiftBanner(ctx,store,root=document){
 root.querySelectorAll('[data-shift-open]').forEach(b=>b.onclick=()=>openShiftDialog(ctx,store));
 root.querySelectorAll('[data-shift-close]').forEach(b=>b.onclick=()=>closeShiftDialog(ctx,b.dataset.shiftClose));
}
export function openShiftDialog(ctx,store){
 const s=ctx.getState();if(!(s.cashierShiftVersion>=83))return ctx.toast('Pasang SQL cashier-shifts-083 terlebih dahulu.');
 if(activeShift(s))return ctx.toast('Tutup shift sebelumnya terlebih dahulu.');
 const d=ctx.modal('Buka kasir',`<p><b>${e(s.me?.name)}</b><br>${e(outlet(s,store))}</p>${field('Uang awal di laci (Rp)',cashInput('openingCash',0))}${field('Catatan (opsional)',noteInput())}<p class="muted">Hitung uang tunai yang tersedia sebelum mulai melayani. Satu akun memiliki satu shift terbuka.</p>`,'Buka kasir');
 d.classList.add('shift-dialog');let saving=false;const requestId=id();
 d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(saving)return;saving=true;submit(d).disabled=true;
  try{const f=ev.currentTarget;await ctx.mutate('cashier_shift_open',{id:requestId,storeId:store,openingCash:f.elements.openingCash.value,note:f.elements.note.value},{throwOnError:true});d.close();ctx.render();ctx.toast('Kasir dibuka. Siap menerima pembayaran.');}catch(x){error(d,x);}finally{saving=false;submit(d).disabled=false;}
 };return d;
}
export async function closeShiftDialog(ctx,key){
 let sh;
 try{sh=(await ctx.readShifts({shiftId:key})).shift;if(!sh||sh.closedAt)throw Error('Shift sudah ditutup. Perbarui halaman.');}catch(x){return ctx.toast(x.message);}
 const d=ctx.modal('Tutup kasir',`<p><b>${e(sh.cashierName)}</b><br>${e(outlet(ctx.getState(),sh.storeId))} · ${e(time(sh.openedAt))}</p><div data-close-summary>${summary(sh)}</div><p class="muted">Kas seharusnya = uang awal + penjualan tunai − refund tunai. QRIS, transfer, dan petty cash terpisah dari laci kasir.</p><button type="button" data-recount>Perbarui perhitungan</button>${field('Uang tunai yang dihitung (Rp)',cashInput('closingCash'))}<p data-cash-difference role="status">Hitung uang tunai di laci, lalu isi jumlah aktual.</p>${field('Catatan / alasan selisih',noteInput())}<p class="muted">Catatan wajib jika ada selisih atau menutup shift kasir lain. Setelah ditutup, buka shift baru untuk pembayaran berikutnya.</p>`,'Konfirmasi tutup kasir');
 d.classList.add('shift-dialog');const f=d.querySelector('form'),actual=f.elements.closingCash,requestId=id();let saving=false,loading=false;
 const diff=()=>{d.querySelector('[data-cash-difference]').textContent=actual.value===''?'Isi jumlah uang tunai aktual.':'Selisih: '+money(Number(actual.value)-sh.summary.expectedCash);f.elements.note.required=actual.value!==''&&(Number(actual.value)!==sh.summary.expectedCash||sh.cashierId!==ctx.getState().me?.id);f.elements.note.minLength=f.elements.note.required?3:0;};actual.oninput=diff;diff();
 d.querySelector('[data-recount]').onclick=async()=>{if(saving||loading)return;loading=true;submit(d).disabled=true;
  try{const updated=(await ctx.readShifts({shiftId:key})).shift;if(!updated||updated.closedAt)throw Error('Shift sudah ditutup. Tutup dialog lalu perbarui halaman.');sh=updated;d.querySelector('[data-close-summary]').innerHTML=summary(sh);d.querySelector('#form-error').textContent='';diff();}catch(x){error(d,x);}finally{loading=false;submit(d).disabled=false;}
 };
 f.onsubmit=async ev=>{ev.preventDefault();if(saving||loading)return;saving=true;submit(d).disabled=true;
  try{await ctx.mutate('cashier_shift_close',{id:requestId,shiftId:key,expectedRevision:sh.revision,closingCash:actual.value,note:f.elements.note.value},{throwOnError:true});d.close();ctx.render();ctx.toast('Kasir ditutup. Rekap tersimpan di riwayat shift.');}catch(x){error(d,x);}finally{saving=false;submit(d).disabled=false;}
 };return d;
}
const options=(rows,selected)=>rows.map(x=>`<option value="${e(x.id)}" ${x.id===selected?'selected':''}>${e(x.name)}</option>`).join('');
const entryTable=rows=>`<div class="table-wrap"><table class="shift-log"><thead><tr><th>Waktu / transaksi</th><th>Kasir / outlet</th><th>Jenis</th><th>Pembayaran</th><th>Jumlah</th><th>Struk</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${e(time(x.createdAt))}<small>#${e(x.sourceId.slice(0,8))}</small></td><td>${e(x.cashierName)}<small>${e(x.storeName)}</small></td><td>${x.kind==='refund'?'Refund':'Penjualan'}</td><td>${e(x.payment)}</td><td>${x.kind==='refund'?'−':''}${money(x.amount)}</td><td><button type="button" class="small" data-shift-receipt="${e(x.sourceId)}" data-source="${e(x.sourceKind)}">Lihat / cetak</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Belum ada transaksi pada filter ini.</td></tr>'}</tbody></table></div>`;
const pager=(key,offset,more)=>`<div class="shift-pager"><button type="button" class="small" data-${key}-prev ${offset?'':'disabled'}>Sebelumnya</button><span>Halaman ${Math.floor(offset/20)+1}</span><button type="button" class="small" data-${key}-next ${more?'':'disabled'}>Berikutnya</button></div>`;
export function shiftsPage(s,store){
 return `<section class="shifts-page"><div class="intro"><div><h2>Shift Kasir</h2><p class="muted">Pantau kasir aktif, rekap uang, dan transaksi setiap shift.</p></div><button type="button" data-shifts-refresh>Perbarui</button></div><div data-shift-banner>${shiftBanner(s,store)}</div><p class="muted">Aktif berarti shift sudah dibuka dan belum ditutup. Status ini tetap terbuka saat logout.</p>${s.access?.reports||s.access?.finance||s.me?.role==='owner'?'':'<p class="muted">Akun kasir hanya menampilkan shift dan log miliknya sendiri.</p>'}<form data-shift-filters class="shift-filters">${field('Dari tanggal',`<input name="from" type="date" value="${today()}" required>`)}${field('Sampai tanggal',`<input name="to" type="date" value="${today()}" required>`)}${field('Outlet',`<select name="storeId"><option value="">Semua outlet</option>${options(s.stores,'')}</select>`)}${field('Kasir','<select name="cashierId"><option value="">Semua kasir</option></select>')}<button type="submit">Tampilkan</button></form><p data-shifts-status role="status">Memuat data shift…</p><div data-shifts-data></div></section>`;
}
export function bindShiftsPage(ctx,store){
 const root=document.querySelector('.shifts-page');if(!root)return;
 const form=root.querySelector('[data-shift-filters]'),host=root.querySelector('[data-shifts-data]'),status=root.querySelector('[data-shifts-status]');
 let offset=0,historyOffset=0,loading=false,filters={from:today(),to:today(),storeId:'',cashierId:''};
 bindShiftBanner(ctx,store,root);
 const refresh=async()=>{
  if(loading||!root.isConnected)return;loading=true;root.querySelector('[data-shifts-refresh]').disabled=true;
  try{
   const data=await ctx.readShifts({...filters,offset,historyOffset});if(!root.isConnected)return;
   const s=ctx.getState();root.querySelector('[data-shift-banner]').innerHTML=shiftBanner({...s,cashierShifts:data.active},store);bindShiftBanner(ctx,store,root);const active=data.active.filter(x=>(!filters.storeId||x.storeId===filters.storeId)&&(!filters.cashierId||x.cashierId===filters.cashierId));
   const people=new Map([...(s.people||[]),...(s.employees||[]),...data.active.map(x=>({id:x.cashierId,name:x.cashierName})),...data.history.map(x=>({id:x.cashierId,name:x.cashierName})),...data.entries.map(x=>({id:x.cashierId,name:x.cashierName}))].map(x=>[x.id,x]));
   const selected=form.elements.cashierId.value;for(const x of people.values())if(![...form.elements.cashierId.options].some(o=>o.value===x.id)){const option=new Option(x.name,x.id);form.elements.cashierId.add(option);}form.elements.cashierId.value=selected;
   host.innerHTML=`<section class="panel"><h3>Kasir aktif (${active.length})</h3><p class="muted">Daftar aktif mengikuti filter outlet dan kasir, tanpa batas tanggal.</p><div class="shift-cards">${active.map(sh=>`<article class="shift-card"><span class="pill"><span class="shift-dot"></span> Buka</span><h4>${e(sh.cashierName)}</h4><p>${e(outlet(s,sh.storeId))}<br><small>${e(time(sh.openedAt))}</small></p><p>Penjualan <b>${money(sh.summary.sales)}</b><br>Kas seharusnya <b>${money(sh.summary.expectedCash)}</b></p><div class="toolbar"><button type="button" class="small" data-shift-detail="${e(sh.id)}">Detail shift</button>${canClose(s,sh)?`<button type="button" class="small" data-shift-close="${e(sh.id)}">Tutup kasir</button>`:''}</div></article>`).join('')||'<p class="empty">Tidak ada kasir yang sedang buka pada filter ini.</p>'}</div></section><section class="panel"><h3>Riwayat tutup kasir</h3><div class="table-wrap"><table><thead><tr><th>Kasir / outlet</th><th>Dibuka → ditutup</th><th>Kas seharusnya</th><th>Kas aktual</th><th>Selisih</th><th>Detail</th></tr></thead><tbody>${data.history.slice(0,20).map(sh=>`<tr><td>${e(sh.cashierName)}<small>${e(outlet(s,sh.storeId))}</small></td><td>${e(time(sh.openedAt))}<small>→ ${e(time(sh.closedAt))}</small></td><td>${money(sh.summary.expectedCash)}</td><td>${money(sh.closingCash)}</td><td class="${sh.summary.difference?'error':''}">${money(sh.summary.difference)}</td><td><button type="button" class="small" data-shift-detail="${e(sh.id)}">Detail</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Belum ada shift ditutup pada tanggal ini.</td></tr>'}</tbody></table></div>${pager('history',historyOffset,data.history.length>20)}</section><section class="panel"><h3>Log transaksi kasir</h3><p class="muted">Pembayaran dan refund sejak fitur shift dipasang. Nilai sudah termasuk diskon.</p>${entryTable(data.entries.slice(0,20).map(x=>({...x,storeName:outlet(s,x.storeId)})))}${pager('entries',offset,data.entries.length>20)}</section>`;
   status.textContent='Diperbarui '+time(data.fetchedAt)+'. Tekan Perbarui untuk data terbaru.';
   bindShiftBanner(ctx,store,host);bindDetails(ctx,host);
   for(const [key,current,set] of [['history',historyOffset,n=>historyOffset=n],['entries',offset,n=>offset=n]])for(const [suffix,delta] of [['prev',-20],['next',20]])host.querySelector(`[data-${key}-${suffix}]`).onclick=()=>{if(loading)return;set(Math.max(0,current+delta));refresh();};
  }catch(x){if(root.isConnected)status.textContent=x.message;}finally{loading=false;if(root.isConnected)root.querySelector('[data-shifts-refresh]').disabled=false;}
 };
 form.onsubmit=ev=>{ev.preventDefault();if(loading)return;const values=Object.fromEntries(new FormData(form));if(values.from>values.to){status.textContent='Tanggal awal harus sebelum atau sama dengan tanggal akhir.';return;}filters=values;offset=historyOffset=0;refresh();};
 root.querySelector('[data-shifts-refresh]').onclick=refresh;refresh();
}
function bindDetails(ctx,root){
 root.querySelectorAll('[data-shift-detail]').forEach(b=>b.onclick=()=>showShiftDetail(ctx,b.dataset.shiftDetail));
 root.querySelectorAll('[data-shift-receipt]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;try{
   let s=ctx.getState();const kind=b.dataset.source,key=b.dataset.shiftReceipt;
   if(!(kind==='order'?s.orders:s.sales)?.some(x=>x.id===key)){await ctx.refresh();s=ctx.getState();}
   if(!(kind==='order'?s.orders:s.sales)?.some(x=>x.id===key))throw Error('Struk tidak tersedia untuk akun ini. Hubungi pengelola.');
   root.closest('dialog')?.close();if(kind==='order')showReceipt(ctx,key);else ctx.showLegacyReceipt(key);
  }catch(x){ctx.toast(x.message);}finally{b.disabled=false;}
 });
}
async function showShiftDetail(ctx,key){
 try{
  const data=await ctx.readShifts({shiftId:key}),sh=data.shift;if(!sh)throw Error('Shift tidak ditemukan');
  const d=ctx.modal('Detail shift kasir',`<p><b>${e(sh.cashierName)}</b> · ${sh.closedAt?'Ditutup':'Buka'}<br>${e(outlet(ctx.getState(),sh.storeId))}<br>Dibuka: ${e(time(sh.openedAt))}${sh.closedAt?`<br>Ditutup: ${e(time(sh.closedAt))}<br>Ditutup oleh: ${e(sh.closedName)}`:''}</p>${summary(sh)}<p>Catatan awal: ${e(sh.openingNote||'—')}<br>Catatan penutupan: ${e(sh.closingNote||'—')}</p><h3>Log transaksi shift</h3><div data-detail-log></div>`,'Selesai');
  d.classList.add('shift-detail-dialog');d.querySelector('form').onsubmit=ev=>{ev.preventDefault();d.close();};let offset=0,loading=false;
  const display=rows=>{const host=d.querySelector('[data-detail-log]');host.innerHTML=entryTable(rows.slice(0,20).map(x=>({...x,storeName:outlet(ctx.getState(),x.storeId)})))+pager('detail',offset,rows.length>20);bindDetails(ctx,host);for(const [suffix,delta] of [['prev',-20],['next',20]])host.querySelector(`[data-detail-${suffix}]`).onclick=async()=>{if(loading)return;loading=true;const next=Math.max(0,offset+delta);try{const fresh=await ctx.readShifts({shiftId:key,offset:next});offset=next;if(d.open)display(fresh.entries);}catch(x){error(d,x);}finally{loading=false;}};};display(data.entries);
 }catch(x){ctx.toast(x.message);}
}
