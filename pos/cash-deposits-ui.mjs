import {id,today,money,escape as e} from './core.mjs';
import {compressPhoto} from './photo-compression.mjs';
import {canReadDeposits,canRecordDeposit,canVoidDeposit,depositTotals,validateDepositInput} from './cash-deposits.mjs';
const ready=s=>s.cashDepositVersion>=92;
const field=(label,html)=>`<label class="field">${label}${html}</label>`;
const time=stamp=>new Date(stamp).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB';
const bankNames=['Bank Mandiri','BCA','BRI','BNI','BSI','CIMB Niaga','Bank Permata','BTN','Bank Danamon'];
export function depositButtons(s,store=''){
 if(!ready(s)||!canReadDeposits(s))return '';
 return `<div class="cash-deposit-actions">${store&&canRecordDeposit(s)?`<button type="button" data-cash-deposit="${e(store)}">Setoran tunai</button>`:''}<button type="button" data-deposit-history="${e(store)}">Riwayat setoran</button></div>`;
}
export function depositPanel(s,store=''){
 if(!canReadDeposits(s))return '';
 if(!ready(s))return '<p class="dash-note">Ringkasan setoran tunai belum aktif. Hubungi admin untuk mengaktifkan fitur ini.</p>';
 const v=depositTotals(s,store),fmt=x=>x==null?'Belum tersedia':money(x);
 return `<section class="cash-deposit-panel" aria-label="Setoran tunai"><div class="dash-section-head"><div><h2>Setoran tunai</h2><p>Saldo akumulasi outlet saat ini · tidak dibatasi filter tanggal penjualan</p></div>${depositButtons(s,store)}</div><div class="dash-metrics"><article class="dash-metric"><h2>Cash belum disetor</h2><strong class="dash-metric-value">${fmt(v?.pending)}</strong><p class="dash-metric-note">Penjualan tunai setelah refund − setoran tercatat</p>${v?.pending<0?'<p class="cash-deposit-warning">Saldo negatif: periksa refund setelah setoran atau koreksi setoran yang keliru.</p>':''}</article><article class="dash-metric"><h2>Cash sudah disetor</h2><strong class="dash-metric-value">${fmt(v?.deposited)}</strong><p class="dash-metric-note">${v?v.count:0} setoran aktif · berdasarkan bukti yang diunggah kasir</p></article></div><p class="dash-note">Uang awal kembalian dan petty cash tidak termasuk saldo setoran. Setoran tidak mengubah omzet atau profit.</p></section>`;
}
const fail=(d,error)=>{const el=d.querySelector('#form-error');if(el)el.textContent=error.message;};
export function bindDeposits(ctx,root=document){
 root.querySelectorAll('[data-cash-deposit]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await openDepositDialog(ctx,b.dataset.cashDeposit);}catch(x){ctx.toast(x.message);}finally{b.disabled=false;}});
 root.querySelectorAll('[data-deposit-history]').forEach(b=>b.onclick=()=>showDepositHistory(ctx,b.dataset.depositHistory).catch(x=>ctx.toast(x.message)));
}
export async function openDepositDialog(ctx,store){
 const s=ctx.getState();if(!ready(s)||!canRecordDeposit(s)||!s.stores.some(x=>x.id===store))throw Error('Setoran belum tersedia untuk outlet ini.');
 const data=await ctx.readCashDeposits({storeId:store}),balance=depositTotals(s,store,data.summary);
 if(!balance||!/^\d{4}-\d{2}-\d{2}$/.test(data.serverDate||''))throw Error('Saldo atau tanggal server belum tersedia. Perbarui halaman.');
 if(balance.pending<1)throw Error('Tidak ada cash yang dapat disetor pada outlet ini.');
 const d=ctx.modal('Input setoran tunai',`<p><b>${e(s.stores.find(x=>x.id===store).name)}</b><br>Kasir: ${e(s.me?.name)}</p><div class="deposit-balance">Cash belum disetor <strong>${money(balance.pending)}</strong></div><div class="form-grid">${field('Tanggal setor · otomatis WIB',`<input name="depositDate" type="date" value="${e(data.serverDate)}" readonly aria-readonly="true">`)}${field('Nilai setoran (Rp)',`<input name="amount" type="number" inputmode="numeric" min="1" max="${Math.floor(balance.pending)}" step="1" required placeholder="Masukkan nilai setoran">`)}</div>${field('Bank tujuan setor',`<input name="bank" list="deposit-bank-list" required minlength="2" maxlength="80" autocomplete="off" placeholder="Contoh: Bank Mandiri"><datalist id="deposit-bank-list">${bankNames.map(b=>`<option value="${e(b)}"></option>`).join('')}</datalist>`)}${field('Bukti struk setoran bank · wajib','<input name="proof" type="file" accept="image/jpeg,image/png,image/webp" required>')}<p class="muted">JPG, PNG, atau WebP, maksimal 2 MB. Pastikan tanggal, bank, dan nominal pada struk terbaca.</p><p data-proof-status role="status"></p><img data-proof-preview class="deposit-proof-preview" alt="Pratinjau struk setoran" hidden><p class="muted">Tanggal mengikuti waktu server saat disimpan. Catat setelah uang disetor ke bank. Untuk uang dari laci aktif, selesaikan penghitungan/tutup kasir terlebih dahulu.</p>`,'Simpan setoran');
 d.classList.add('cash-deposit-dialog');
 const form=d.querySelector('form'),file=form.querySelector('[name="proof"]'),preview=d.querySelector('[data-proof-preview]'),status=d.querySelector('[data-proof-status]'),button=d.querySelector('[type="submit"]'),requestId=id();
 let proof='',uploading=false,saving=false,version=0;
 file.onchange=async()=>{
  if(saving)return;const ticket=++version,input=file.files?.[0];proof='';preview.hidden=true;preview.removeAttribute('src');status.textContent='';if(!input){uploading=false;button.disabled=false;return;}
  uploading=true;button.disabled=true;
  try{
   if(!['image/jpeg','image/png','image/webp'].includes(input.type)||input.size>2097152||!input.size)throw Error('Pilih gambar JPG, PNG, atau WebP maksimal 2 MB.');
   status.textContent='Menyiapkan bukti struk…';
   const result=await (ctx.compressDepositProof||((f)=>compressPhoto(f,'bankReceipt')))(input);
   if(ticket!==version)return;
   proof=result.photo;preview.src=proof;preview.hidden=false;status.textContent='Bukti siap · '+Math.ceil(result.bytes/1024)+' KB. Periksa keterbacaan sebelum menyimpan.';
  }catch(x){if(ticket===version){proof='';file.value='';status.textContent=x.message;}}
  finally{if(ticket===version){uploading=false;button.disabled=false;}}
 };
 form.onsubmit=async ev=>{
  ev.preventDefault();if(saving||uploading)return;
  const payload={id:requestId,storeId:store,amount:form.querySelector('[name="amount"]').value,bank:form.querySelector('[name="bank"]').value,proof};
  try{
   validateDepositInput(payload);saving=true;button.disabled=true;
   await ctx.mutate('cash_deposit_save',payload,{throwOnError:true});d.close();ctx.render();ctx.toast('Setoran tunai tersimpan. Saldo dashboard diperbarui.');
  }catch(x){fail(d,x);}finally{saving=false;button.disabled=false;}
 };return d;
}
export async function showDepositHistory(ctx,store=''){
 const s=ctx.getState();if(!ready(s)||!canReadDeposits(s))throw Error('Riwayat setoran belum tersedia.');
 const d=ctx.modal('Riwayat setoran tunai',`<div class="deposit-history-filters">${field('Dari tanggal',`<input type="date" data-deposit-from value="${today().slice(0,8)}01">`)}${field('Sampai tanggal',`<input type="date" data-deposit-to value="${today()}">`)}<button type="button" data-deposits-filter>Tampilkan</button></div><p data-deposits-status role="status">Memuat setoran…</p><div data-deposit-rows></div><div class="shift-pager"><button type="button" data-deposit-prev disabled>Sebelumnya</button><span data-deposit-page>Halaman 1</span><button type="button" data-deposit-next disabled>Berikutnya</button></div>`,'Selesai');
 d.classList.add('cash-deposit-history');d.querySelector('form').onsubmit=ev=>{ev.preventDefault();d.close();};
 let offset=0,loading=false,filters={storeId:store,from:today().slice(0,8)+'01',to:today()};
 const status=d.querySelector('[data-deposits-status]'),host=d.querySelector('[data-deposit-rows]');
 const load=async()=>{
  if(loading)return;loading=true;
  try{
   const data=await ctx.readCashDeposits({...filters,offset});if(d.closed||d.open===false)return;
   if(!Array.isArray(data.rows))throw Error('Riwayat setoran belum lengkap.');
   host.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Tanggal / kasir</th><th>Outlet / bank</th><th>Nominal</th><th>Status / bukti</th></tr></thead><tbody>${data.rows.slice(0,20).map(r=>`<tr><td>${e(r.date)}<small>${e(r.cashierName)}</small></td><td>${e(s.stores.find(x=>x.id===r.storeId)?.name||'Outlet')}<small>${e(r.bank)}</small></td><td>${money(r.amount)}</td><td>${r.voidedAt?`<span>Dibatalkan</span><small>${e(r.voidReason)}</small>`:'<span>Tercatat</span>'}<button type="button" data-deposit-proof="${e(r.id)}">Lihat bukti</button>${!r.voidedAt&&canVoidDeposit(ctx.getState())?`<button type="button" class="danger" data-deposit-void="${e(r.id)}">Batalkan</button>`:''}</td></tr>`).join('')||'<tr><td colspan="4">Belum ada setoran pada periode ini.</td></tr>'}</tbody></table></div>`;
   status.textContent='Setoran aktif pada periode ini: '+money(data.periodDeposited)+'. Saldo dashboard tetap akumulatif.';
   d.querySelector('[data-deposit-page]').textContent='Halaman '+(offset/20+1);d.querySelector('[data-deposit-prev]').disabled=offset===0;d.querySelector('[data-deposit-next]').disabled=data.rows.length<=20;
   host.querySelectorAll('[data-deposit-proof]').forEach(b=>b.onclick=()=>showDepositProof(ctx,b.dataset.depositProof).catch(x=>fail(d,x)));
   host.querySelectorAll('[data-deposit-void]').forEach(b=>b.onclick=()=>voidDepositDialog(ctx,b.dataset.depositVoid,load));
  }catch(x){fail(d,x);status.textContent='Riwayat belum berhasil dimuat.';}finally{loading=false;}
 };
 d.querySelector('[data-deposits-filter]').onclick=()=>{
  if(loading)return;const from=d.querySelector('[data-deposit-from]').value,to=d.querySelector('[data-deposit-to]').value;
  if(!from||!to||from>to){fail(d,Error('Isi rentang tanggal yang valid.'));return;}filters={storeId:store,from,to};offset=0;load();
 };
 for(const [key,delta] of [['prev',-20],['next',20]])d.querySelector('[data-deposit-'+key+']').onclick=()=>{if(loading)return;offset=Math.max(0,offset+delta);load();};
 await load();return d;
}
export async function showDepositProof(ctx,key){
 const data=await ctx.readDepositProof(key),r=data.deposit;
 if(!r||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.proof||''))throw Error('Bukti struk belum tersedia.');
 const d=ctx.modal('Bukti setoran bank',`<p><b>${money(r.amount)}</b> · ${e(r.bank)}<br>${e(r.cashierName)} · ${e(time(r.createdAt))}${r.voidedAt?`<br>Dibatalkan oleh ${e(r.voidedName)}: ${e(r.voidReason)}`:''}</p><img class="deposit-proof-full" src="${e(data.proof)}" alt="Struk bukti setoran bank">`,'Selesai');
 d.classList.add('cash-deposit-dialog');d.querySelector('form').onsubmit=ev=>{ev.preventDefault();d.close();};return d;
}
function voidDepositDialog(ctx,key,reload){
 const d=ctx.modal('Batalkan pencatatan setoran',`${field('Alasan pembatalan','<textarea name="reason" required minlength="3" maxlength="300"></textarea>')}<p class="muted">Hanya membatalkan catatan yang keliru. Tindakan ini tidak menarik uang dari bank. Bukti dan riwayat tetap disimpan.</p>`,'Batalkan pencatatan');
 let saving=false;const requestId=id();d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(saving)return;saving=true;try{await ctx.mutate('cash_deposit_void',{id:requestId,depositId:key,reason:d.querySelector('[name="reason"]').value},{throwOnError:true});d.close();ctx.render();await reload();}catch(x){fail(d,x);}finally{saving=false;}};
}
