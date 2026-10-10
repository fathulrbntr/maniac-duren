import {id,today,money,num,escape as e} from './core.mjs?v=10';
import {isOwner,tableLabel,cashierQuote,checkoutTotals,findDiscountApproval,validPayment} from './cashier.mjs?v=66';
import {checkOrder} from './order-stock.mjs?v=12';
import {printReceipt} from './receipt-printer.mjs?v=64';
import {receiptHeader,fillReceiptLogo} from './store-profile.mjs?v=64';
import {readDeviceSettings} from './device-settings.mjs?v=58';
const statusName={pending:'Menunggu owner',approved:'Disetujui',rejected:'Ditolak',used:'Sudah dipakai'};
const err=(d,error)=>{d.querySelector('#form-error').textContent=error.message;};
const submitted=d=>d.querySelector('[type=submit]');
const ready=s=>{if(!(s.cashierVersion>=54))throw Error('Jalankan database/pos-cashier-controls.sql terlebih dahulu, lalu muat ulang POS.');};
const policyLabel=d=>d.name+' · '+(d.kind==='percent'?num(d.value)+'%':money(d.value));
export function cashierFields(s){return `<label class="field">Nomor meja<select id="order-table"><option value="">Tanpa meja / takeaway</option>${Array.from({length:50},(_,i)=>`<option value="${i+1}">Meja ${i+1}</option>`).join('')}</select></label><label class="field">Catatan pesanan<input id="order-note" maxlength="300" placeholder="Nama pelanggan / permintaan khusus"></label><section class="checkout-discount"><label class="field">Diskon<select id="order-discount"><option value="">Tanpa diskon</option>${(s.discounts||[]).filter(d=>d.active).map(d=>`<option value="${e(d.id)}">${e(policyLabel(d))}</option>`).join('')}</select></label><p id="discount-status" class="muted" role="status">Diskon membutuhkan persetujuan owner.</p><button id="request-discount" type="button" class="small" hidden>${isOwner(s)?'Setujui diskon untuk pesanan ini':'Minta persetujuan owner'}</button></section>`;}
export function resultPopup(ctx,{success,title,message,orderId,print=false}){
 const d=ctx.modal(title,`<div class="checkout-result ${success?'is-success':'is-cancel'}"><span aria-hidden="true">${success?'✓':'×'}</span><h3>${e(title)}</h3><p>${e(message)}</p></div>${orderId?'<button type="button" id="result-receipt">Lihat / cetak struk</button>':''}`,'Selesai');
 d.querySelector('form').onsubmit=ev=>{ev.preventDefault();d.close();};d.querySelectorAll('.modal-actions .close').forEach(b=>{b.textContent='Tutup';});
 if(orderId)d.querySelector('#result-receipt').onclick=()=>{d.close();showReceipt(ctx,orderId);};
 // Printing is opened after the successful server response, never before saving.
 if(print&&orderId){d.close();showReceipt(ctx,orderId,true,{title,message});}
 return d;
}
export function showReceipt(ctx,orderId,autoPrint=false,result){
 const s=ctx.getState(),o=s.orders.find(x=>x.id===orderId);if(!o)return ctx.toast('Pesanan tidak ditemukan');
 const outlet=s.stores.find(x=>x.id===o.store_id),logoContext={...ctx,demo:!!s.stockDemo};
 const d=ctx.modal(result?.title||'Detail / struk',`${result?`<p class="checkout-success" role="status">✓ ${e(result.message)}</p>`:''}<div class="receipt-print">${s.stockDemo?'<h3>DEMO · BUKAN TRANSAKSI NYATA</h3>':''}${receiptHeader(outlet)}${o.status==='cancelled'?'<h3>VOID / DIBATALKAN</h3>':''}<p>${e(o.business_date)}<br>#${e(o.id)}<br><b>${e(tableLabel(o.table_no))}</b><br>${e(o.note)}</p><table><thead><tr><th>Produk</th><th>Jumlah</th><th>Subtotal</th></tr></thead><tbody>${o.lines.map(l=>`<tr><td>${e(l.name)}</td><td>${num(l.qty)} ${e(l.unit)}</td><td>${money(l.qty*l.price)}</td></tr>`).join('')}</tbody></table><p>Subtotal: ${money(o.subtotal??o.total)}${o.discount?`<br>Diskon ${e(o.discount.name)}: −${money(o.discount.amount)}<br>Disetujui: ${e(o.discount.approvedName)}`:''}<br><b>Total: ${money(o.total)}</b><br>${e(o.payment)} · Diterima ${money(o.paid)}<br>Kembalian: ${money(Number(o.paid)-o.total)}</p>${o.void_meta?`<p>Alasan void: ${e(o.void_meta.reason)}<br>Pelaksana: ${e(o.void_meta.byName)}<br>Persetujuan: ${e(o.void_meta.approvedName)}</p>`:''}</div><p class="muted no-print">Transaksi sudah tersimpan. Menutup dialog printer hanya membatalkan cetak.</p><button id="print-order" type="button">Cetak struk</button>`,'Selesai');
 // The POS print stylesheet hides every body child except a receipt dialog.
 d.classList.add('receipt-dialog','cashier-receipt-dialog');
 d.querySelector('form').onsubmit=ev=>{ev.preventDefault();d.close();};d.querySelectorAll('.modal-actions .close').forEach(b=>b.textContent='Tutup');
 fillReceiptLogo(d,outlet,logoContext).catch(error=>ctx.toast(error.message));
 const button=d.querySelector('#print-order');
 const print=async()=>{
  if(button.disabled||!d.hasAttribute('open'))return;
  button.disabled=true;
  try{await fillReceiptLogo(d,outlet,logoContext);if(d.hasAttribute('open'))await printReceipt(d.querySelector('.receipt-print'));}
  catch(error){ctx.toast('Pesanan tetap tersimpan. '+error.message);}
  finally{button.disabled=false;}
 };
 button.onclick=print;
 if(autoPrint)requestAnimationFrame(print);
 return d;
}
export function bindCheckout(ctx,store,getDraft,clearDraft){
 const table=document.querySelector('#order-table'),note=document.querySelector('#order-note'),select=document.querySelector('#order-discount'),requestButton=document.querySelector('#request-discount'),status=document.querySelector('#discount-status'),save=document.querySelector('#save-order');
 if(!table||!select)return ()=>{};
 const checkout=()=>({storeId:store,date:today(),lines:structuredClone(getDraft()),tableNo:table.value?Number(table.value):null,note:note.value});
 const approval=()=>{const s=ctx.getState(),p=checkout();if(!select.value)return {s,p,a:null};const quote=cashierQuote(s,p);return {s,p,a:findDiscountApproval(s,quote,select.value)};};
 let requesting=false,lastError='';
 const update=()=>{
  const s=ctx.getState(),selected=select.value;let a=null,total=getDraft().reduce((n,l)=>n+l.qty*l.price,0),reason='Diskon membutuhkan persetujuan owner.';
  try{
   const x=approval();a=x.a;
   if(selected&&a?.status==='approved'){const t=checkoutTotals(s,{...x.p,discountApprovalId:a.id});total=t.total;reason=`Disetujui ${a.decided_name} · potongan ${money(t.discountAmount)}`;}
   else if(selected)reason=a?statusName[a.status]:'Belum ada persetujuan untuk pesanan ini.';
  }catch(error){reason=error.message;a=null;}
  status.textContent=lastError||reason;requestButton.hidden=!selected||!getDraft().length||a?.status==='approved';requestButton.disabled=requesting||a?.status==='pending';
  const stock=checkOrder(s,store,getDraft(),today());save.disabled=!getDraft().length||!stock.ok||!!(selected&&a?.status!=='approved');
  if(!(s.cashierVersion>=54)){save.disabled=true;status.textContent='Jalankan SQL kasir 054 terlebih dahulu.';}
  document.querySelector('#order-total').textContent=money(total);save.textContent=`${s.stockDemo?'Uji pembayaran':'Bayar sekarang'} · ${money(total)}`;
 };
 for(const node of [table,note,select]){node.addEventListener('change',()=>{lastError='';update();});node.addEventListener('input',()=>{lastError='';update();});}
 requestButton.onclick=async()=>{
  if(requesting)return;requesting=true;lastError='';update();
  try{const s=ctx.getState();ready(s);const p=checkout(),d=s.discounts.find(d=>d.id===select.value);cashierQuote(s,p);if(!d)throw Error('Pilih diskon');
   await ctx.mutate('cashier_approval_request',{id:id(),storeId:store,date:today(),kind:'discount',discountId:d.id,expectedVersion:d.version,checkout:p},{throwOnError:true});
  }catch(error){lastError=error.message;}finally{requesting=false;update();}
 };
 save.onclick=()=>{
  try{
   ready(ctx.getState());const {s,p,a}=approval();if(select.value&&a?.status!=='approved')throw Error('Tunggu persetujuan owner');
   if(a)p.discountApprovalId=a.id;const t=checkoutTotals(s,p);if(!checkOrder(s,store,p.lines,p.date).ok)throw Error('Stok berubah. Periksa pesanan');
   paymentDialog(ctx,{...p,id:id()},t,()=>{clearDraft();});
  }catch(error){ctx.toast(error.message);}
 };
 document.querySelector('#order-products')?.addEventListener('stock-refresh',()=>{const current=select.value;select.innerHTML='<option value="">Tanpa diskon</option>'+(ctx.getState().discounts||[]).filter(d=>d.active).map(d=>`<option value="${e(d.id)}">${e(policyLabel(d))}</option>`).join('');if(current&&![...select.options].some(o=>o.value===current))select.innerHTML+=`<option value="${e(current)}">Diskon tidak aktif — pilih ulang</option>`;select.value=current;update();});
 update();return update;
}
export function payExistingOrder(ctx,store,orderId){
 const s=ctx.getState(),o=s.orders.find(o=>o.id===orderId&&o.store_id===store);
 if(!o||o.payment_status!=='unpaid'||o.status==='cancelled')return ctx.toast('Pesanan sudah dibayar atau dibatalkan');
 paymentDialog(ctx,{id:id(),orderId,storeId:store,date:today(),tableNo:o.table_no,note:o.note,lines:o.lines},{subtotal:o.subtotal??o.total,discountAmount:o.discount?.amount||0,total:o.total},()=>{});
}
function paymentDialog(ctx,p,t,onSaved){
 const s=ctx.getState(),d=ctx.modal('Pembayaran pesanan',`<h3>${money(t.total)}</h3><p>${e(tableLabel(p.tableNo))}</p><label class="field">Metode pembayaran<select name="payment"><option>Tunai</option><option>QRIS</option><option>Transfer</option></select></label><label class="field">Uang diterima<input type="number" name="paid" min="${t.total}" step="any" value="${t.total}" required></label><p id="payment-change"></p><p class="muted">${s.stockDemo?'Simulasi pembayaran demo.':'QRIS / transfer dicatat manual. Pastikan dana sudah diterima.'}</p>`,'Lanjut konfirmasi');
 const f=d.querySelector('form'),method=f.elements.namedItem('payment'),amount=f.elements.namedItem('paid');
 const update=()=>{amount.readOnly=method.value!=='Tunai';if(amount.readOnly)amount.value=t.total;d.querySelector('#payment-change').textContent='Kembalian: '+money(Math.max(0,Number(amount.value)-t.total));};method.onchange=update;amount.oninput=update;update();
 let advanced=false,cancelled=false;const cancel=()=>{if(advanced||cancelled)return;cancelled=true;resultPopup(ctx,{success:false,title:'Pembayaran dibatalkan',message:'Pesanan belum disimpan. Keranjang tetap tersedia.'});};
 d.addEventListener('close',cancel);
 f.onsubmit=ev=>{ev.preventDefault();try{const payment={...p,payment:method.value,paid:amount.value};validPayment(payment,t.total);advanced=true;d.close();confirmPayment(ctx,payment,t,onSaved);}catch(error){err(d,error);}};
}
function confirmPayment(ctx,p,t,onSaved){
 const autoPrint=readDeviceSettings().printer.autoPrint;
 const s=ctx.getState(),d=ctx.modal('Konfirmasi pembayaran',`<p><b>${e(tableLabel(p.tableNo))}</b> · ${e(p.note||'Tanpa catatan')}</p><div class="checkout-review">${p.lines.map(l=>`<p>${e(s.products.find(x=>x.id===l.productId)?.name)} × ${num(l.qty)} <b>${money(l.qty*l.price)}</b></p>`).join('')}<hr><p>Subtotal <b>${money(t.subtotal)}</b></p><p>Diskon <b>−${money(t.discountAmount)}</b></p><p>Total dibayar <b>${money(t.total)}</b></p><p>${e(p.payment)} <b>${money(p.paid)}</b></p><p>Kembalian <b>${money(Number(p.paid)-t.total)}</b></p></div><p class="muted">${s.stockDemo?'Ini transaksi demo.':(autoPrint?'Konfirmasi menyimpan transaksi dan membuka proses cetak struk.':'Konfirmasi menyimpan transaksi. Struk dapat dicetak dari detail pesanan.')}</p><p id="confirmation-status" role="status"></p>`,autoPrint?'Konfirmasi & cetak struk':'Konfirmasi pembayaran');
 let saving=false,done=false,cancelled=false,uncertain=false;const cancel=()=>{if(done||cancelled)return;cancelled=true;resultPopup(ctx,{success:false,title:uncertain?'Status pembayaran belum pasti':'Pembayaran dibatalkan',message:uncertain?'Periksa transaksi / pengiriman tertunda sebelum mencoba pembayaran lagi.':'Pesanan belum disimpan. Keranjang tetap tersedia.'});};
 d.addEventListener('close',cancel);d.querySelectorAll('.modal-actions .close').forEach(b=>b.textContent='Cancel');
 d.querySelector('form').onsubmit=async ev=>{
  ev.preventDefault();if(saving||done)return;saving=true;submitted(d).disabled=true;let sent=false;
  try{
   const existing=p.orderId?ctx.getState().orders.find(o=>o.id===p.orderId):null;
   if(p.orderId&&(!existing||existing.payment_status!=='unpaid'||existing.status==='cancelled'))throw Error('Pesanan sudah dibayar atau dibatalkan');
   const current=existing?{total:existing.total}:checkoutTotals(ctx.getState(),p);validPayment(p,current.total);
   if(current.total!==t.total)throw Error('Total berubah. Tutup dan periksa kembali pesanan');
   sent=true;const ok=await ctx.mutate(p.orderId?'order_pay':'order_create',p,{throwOnError:true});if(!ok)throw Error('Transaksi belum tersimpan');
   done=true;onSaved();d.close();ctx.render();resultPopup(ctx,{success:true,title:'Pesanan berhasil',message:'Pembayaran tersimpan. Struk siap dicetak.',orderId:p.orderId||p.id,print:autoPrint});
  }catch(error){uncertain=uncertain||(!s.stockDemo&&sent&&!error.definitive);err(d,error);d.querySelector('#confirmation-status').textContent=uncertain?'Status belum pasti. Periksa transaksi sebelum membayar lagi.':'';}
  finally{saving=false;if(!done)submitted(d).disabled=false;}
 };
}
export function voidDialog(ctx,store,orderId){
 const s=ctx.getState();try{ready(s);}catch(error){return ctx.toast(error.message);}
 const o=s.orders.find(o=>o.id===orderId);if(!o||o.status==='cancelled')return ctx.toast('Pesanan sudah void atau tidak ditemukan');
 const approval=(s.cashierApprovals||[]).filter(a=>a.kind==='void'&&a.requested_by===s.me.id&&a.details.orderId===orderId&&a.status!=='used'&&new Date(a.expires_at)>new Date()).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
 const approved=approval?.status==='approved';
 const d=ctx.modal(approved?'Konfirmasi void':'Void pesanan',`<p>#${e(o.id.slice(0,8))} · ${e(tableLabel(o.table_no))}<br>Total pengembalian: <b>${money(o.total)}</b></p>${approved?`<p>Disetujui ${e(approval.decided_name)}<br>Alasan: ${e(approval.details.reason)}<br>${approval.details.returnStock?'Barang siap jual yang layak dikembalikan ke stok.':'Barang yang telah keluar tidak dikembalikan ke stok.'}</p>${o.payment_status==='paid'?`<label><input type="checkbox" name="refundConfirmed" required> ${s.stockDemo?'Konfirmasi simulasi refund':'Saya sudah mengembalikan pembayaran kepada pelanggan'}</label>`:''}`:`<label class="field">Alasan void<input name="reason" minlength="3" maxlength="300" required></label><label class="field">Barang siap jual<select name="returnStock"><option value="false">Tidak kembali / tidak layak jual</option><option value="true">Kembali dan masih layak jual</option></select></label>${approval?`<p>${e(statusName[approval.status])}</p>`:''}`}<p class="muted">Bahan menu yang sudah dibuat kitchen tidak kembali menjadi stok. Bahan yang belum dipakai dilepas dari cadangan.</p>`,approved?'Konfirmasi void':isOwner(s)?'Setujui void':'Minta persetujuan owner');
 if(approval?.status==='pending'){submitted(d).disabled=true;return d;}
 let saving=false,requestId=id();d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(saving)return;saving=true;
  try{const f=ev.currentTarget;let payload={id:requestId,storeId:store,date:today(),orderId};
   if(approved){payload={...payload,approvalId:approval.id,refundConfirmed:!!f.elements.namedItem('refundConfirmed')?.checked};await ctx.mutate('order_void',payload,{throwOnError:true});d.close();ctx.render();resultPopup(ctx,{success:true,title:'Pesanan dibatalkan',message:'Void tersimpan beserta alasan dan persetujuan owner.',orderId});}
   else{await ctx.mutate('cashier_approval_request',{...payload,kind:'void',reason:f.elements.namedItem('reason').value,returnStock:f.elements.namedItem('returnStock').value==='true'},{throwOnError:true});d.close();ctx.render();if(isOwner(s))voidDialog(ctx,store,orderId);else resultPopup(ctx,{success:true,title:'Permintaan void terkirim',message:'Menunggu persetujuan owner. Pesanan belum dibatalkan.'});}
  }catch(error){err(d,error);}finally{saving=false;}
 };return d;
}
export function discountsPage(s){
 if(!isOwner(s))return '<p class="error">Pengaturan dan persetujuan hanya untuk owner.</p>';
 const approvals=(s.cashierApprovals||[]).filter(a=>a.status==='pending'&&new Date(a.expires_at)>new Date());
 return `<div class="header-row"><div><h2>Diskon & Persetujuan</h2><p class="muted">Owner mengatur diskon dan menyetujui diskon / void per pesanan.</p></div><button id="new-discount" class="primary">+ Tambah diskon</button></div>${s.cashierVersion>=54?'':'<p class="error">Jalankan database/pos-cashier-controls.sql terlebih dahulu.</p>'}<section class="panel"><h3>Permintaan menunggu (${approvals.length})</h3><div class="approval-list">${approvals.map(a=>`<article class="approval-card"><div><b>${a.kind==='discount'?'Diskon '+e(a.details.name):'Void #'+e(a.details.orderId.slice(0,8))}</b><p>${e(a.requested_name)} · ${e(s.stores.find(x=>x.id===a.store_id)?.name)}</p>${a.kind==='discount'?`<p>${e(tableLabel(a.details.quote.tableNo))} · subtotal ${money(a.details.quote.subtotal)}<br>Potongan ${money(a.details.amount)}<br>${a.details.quote.lines.map(l=>e(s.products.find(x=>x.id===l.productId)?.name)+' × '+num(l.qty)).join(', ')}<br>${e(a.details.quote.note)}</p>`:`<p>${e(a.details.reason)} · refund ${money(a.details.total)}<br>${a.details.returnStock?'Barang siap jual kembali ke stok':'Stok tidak kembali'}</p>`}</div><button data-review-approval="${e(a.id)}">Periksa permintaan</button></article>`).join('')||'<p class="muted">Belum ada permintaan menunggu.</p>'}</div></section><section class="panel"><h3>Daftar diskon</h3>${(s.discounts||[]).map(d=>`<div class="discount-row"><div><b>${e(policyLabel(d))}</b><small>${d.active?'Aktif':'Nonaktif'}</small></div><button data-edit-discount="${e(d.id)}">Ubah</button></div>`).join('')||'<p class="muted">Tambahkan diskon agar kasir dapat memilihnya.</p>'}</section>`;
}
export function bindDiscounts(ctx){
 const s=ctx.getState();if(!isOwner(s))return;
 const edit=key=>{try{ready(s);}catch(error){return ctx.toast(error.message);}const old=(s.discounts||[]).find(d=>d.id===key),d=ctx.modal(old?'Ubah diskon':'Tambah diskon',`<label class="field">Nama diskon<input name="name" maxlength="80" value="${e(old?.name||'')}" required></label><label class="field">Jenis<select name="kind"><option value="percent" ${old?.kind==='percent'?'selected':''}>Persen (%)</option><option value="amount" ${old?.kind==='amount'?'selected':''}>Nominal (Rp)</option></select></label><label class="field">Nilai<input type="number" name="value" min="0.01" step="any" value="${old?.value||''}" required></label><label><input type="checkbox" name="active" ${old?.active!==false?'checked':''}> Aktif</label>`);
  const requestId=id(),discountId=old?.id||id();let saving=false;d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(saving)return;saving=true;try{const f=ev.currentTarget;await ctx.mutate('discount_save',{id:requestId,discountId,expectedVersion:old?.version||0,name:f.elements.namedItem('name').value,kind:f.elements.namedItem('kind').value,value:Number(f.elements.namedItem('value').value),active:f.elements.namedItem('active').checked},{throwOnError:true});d.close();ctx.render();}catch(error){err(d,error);}finally{saving=false;}};
 };
 document.querySelector('#new-discount')?.addEventListener('click',()=>edit());document.querySelectorAll('[data-edit-discount]').forEach(b=>b.onclick=()=>edit(b.dataset.editDiscount));
 document.querySelectorAll('[data-review-approval]').forEach(b=>b.onclick=()=>{const a=ctx.getState().cashierApprovals.find(a=>a.id===b.dataset.reviewApproval);const d=ctx.modal('Persetujuan owner',`<p>${e(a.requested_name)} meminta ${a.kind==='discount'?'diskon '+e(a.details.name)+' sebesar '+money(a.details.amount):'void '+money(a.details.total)}</p><p>${a.kind==='discount'?e(tableLabel(a.details.quote.tableNo))+' · '+e(a.details.quote.note):e(a.details.reason)}</p><label class="field">Keputusan<select name="decision"><option value="approved">Setujui</option><option value="rejected">Tolak</option></select></label><label class="field">Catatan owner<input name="note" maxlength="300"></label>`,'Konfirmasi keputusan');
  const requestId=id();let saving=false;d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(saving)return;saving=true;try{const f=ev.currentTarget;await ctx.mutate('cashier_approval_decide',{id:requestId,approvalId:a.id,decision:f.elements.namedItem('decision').value,note:f.elements.namedItem('note').value},{throwOnError:true});d.close();ctx.render();}catch(error){err(d,error);}finally{saving=false;}};
 });
}
