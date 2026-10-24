import {escape as e,id,num,money} from './core.mjs?v=77';
import {crmAdmin,consentText,normalizeMember,normalizeRule,pointsFor,contactsCsv} from './crm.mjs?v=85';
const field=(label,body)=>`<label class="field">${label}${body}</label>`;
const when=v=>v?new Date(v).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'—';
const read=(ctx,p)=>ctx.crmRead(p);
export function memberFields(s){
 if(!(s.crmVersion>=85))return '<p class="muted">Member & poin tersedia setelah patch database CRM 085 dipasang.</p>';
 return `<section class="checkout-member" data-member-picker><div class="crm-heading"><b>Customer / member</b><span class="pill">Opsional</span></div><div class="crm-search"><input data-member-search aria-label="Cari member" autocomplete="off" placeholder="Cari nama / nomor telepon"><button type="button" data-member-find>Cari</button></div><div data-member-results class="member-results" role="status"></div><div data-member-selected class="member-selected" hidden></div><div class="crm-actions"><button type="button" class="small" data-member-new>+ Member baru</button><button type="button" class="small" data-member-clear hidden>Tanpa member</button></div><p class="muted" data-member-points>Transaksi dapat dilanjutkan tanpa member.</p></section>`;
}
export function memberDialog(ctx,member,onSaved){
 const m=member||{name:'',phone:'',email:'',waOptIn:false,active:true,revision:0},memberId=m.id||id(),eventId=id();
 const d=ctx.modal(member?'Ubah member':'Tambah member',`<p class="muted">Nama dan nomor telepon wajib. Email boleh dikosongkan.</p>${field('Nama customer',`<input name="name" value="${e(m.name)}" minlength="2" maxlength="100" autocomplete="name" required>`)}${field('Nomor telepon / WhatsApp',`<input name="phone" value="${e(m.phone)}" type="tel" maxlength="30" placeholder="081234567890" autocomplete="tel" required>`)}${field('Alamat email (opsional)',`<input name="email" type="email" value="${e(m.email)}" maxlength="254" autocomplete="email">`)}<label class="crm-consent"><input name="waOptIn" type="checkbox" ${m.waOptIn?'checked':''}><span>${consentText}</span></label><p class="muted">Centang hanya setelah pelanggan menyatakan setuju. Persetujuan dicatat beserta waktu dan petugas.</p>${member?`<label class="crm-consent"><input name="active" type="checkbox" ${m.active?'checked':''}><span>Member aktif</span></label>`:''}`,'Simpan member');
 let saving=false;const f=d.querySelector('form');
 // A new phone needs fresh consent. Keep it unchecked until the customer agrees.
 f.elements.phone.addEventListener('input',()=>{if(member)f.elements.waOptIn.checked=false;});
 f.onsubmit=async ev=>{ev.preventDefault();if(saving)return;const btn=f.querySelector('[type=submit]');try{
  const p=normalizeMember({...Object.fromEntries(new FormData(f)),waOptIn:f.elements.waOptIn.checked,active:member?f.elements.active.checked:true});
  saving=true;btn.disabled=true;await ctx.mutate('crm_member_save',{...p,id:eventId,memberId,expectedRevision:m.revision},{throwOnError:true});
  d.close();onSaved?.({...m,...p,id:memberId,revision:m.revision+1});ctx.toast('Member tersimpan.');
 }catch(error){d.querySelector('#form-error').textContent=error.message;}finally{saving=false;btn.disabled=false;}};return d;
}
export function bindMemberPicker(ctx,root=document,getLines=()=>[]){
 const box=root.querySelector('[data-member-picker]');if(!box)return {get:()=>null,refresh:()=>{}};
 const search=box.querySelector('[data-member-search]'),results=box.querySelector('[data-member-results]'),selected=box.querySelector('[data-member-selected]'),clear=box.querySelector('[data-member-clear]');
 let member=null,seq=0,timer;
 const refresh=()=>{try{box.querySelector('[data-member-points]').textContent=member?`Perkiraan +${num(pointsFor(ctx.getState(),getLines()).points)} poin · dihitung saat pembayaran tersimpan.`:'Transaksi dapat dilanjutkan tanpa member.';}catch(error){box.querySelector('[data-member-points]').textContent=error.message;}};
 const choose=m=>{member=m;seq++;results.replaceChildren();selected.hidden=!m;clear.hidden=!m;selected.textContent=m?`${m.name} · ${m.phone}${m.balance!==undefined?' · Saldo '+num(m.balance)+' poin':''}`:'';search.value=m?m.name:'';refresh();};
 const lookup=async()=>{const ticket=++seq,q=search.value.trim();if(q.length<2){results.textContent='Ketik minimal 2 karakter nama atau nomor.';return;}results.textContent='Mencari member…';
  try{const data=await read(ctx,{query:q,activeOnly:true});if(ticket!==seq||!box.isConnected)return;
   results.innerHTML=data.members.map(m=>`<button type="button" data-pick-member="${e(m.id)}"><b>${e(m.name)}</b><span>${e(m.phone)} · ${num(m.balance)} poin</span></button>`).join('')||'<p>Belum ditemukan. Tambahkan member baru di bawah.</p>';
   if(data.total>data.members.length)results.insertAdjacentHTML('beforeend','<p>Persempit nama / nomor untuk hasil lainnya.</p>');
   results.querySelectorAll('[data-pick-member]').forEach(b=>b.onclick=()=>choose(data.members.find(m=>m.id===b.dataset.pickMember)));
  }catch(error){if(ticket===seq&&box.isConnected)results.textContent='Pencarian gagal: '+error.message;}
 };
 search.addEventListener('input',()=>{member=null;seq++;selected.hidden=true;clear.hidden=true;refresh();clearTimeout(timer);timer=setTimeout(lookup,300);});
 search.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();clearTimeout(timer);lookup();}});
 box.querySelector('[data-member-find]').onclick=()=>{clearTimeout(timer);lookup();};clear.onclick=()=>choose(null);
 box.querySelector('[data-member-new]').onclick=()=>memberDialog(ctx,null,choose);
 return {get:()=>member,refresh};
}
export const memberReceipt=o=>o.customer?`<p>Member: ${e(o.customer.name)}<br>${o.pointsReversed?'Poin dibatalkan':'Poin diperoleh'}: ${num(o.pointsEarned||0)}</p>`:'';
export function crmPage(s){
 if(!crmAdmin(s))return '<section class="panel">CRM hanya untuk owner / manager.</section>';
 const ready=s.crmVersion>=85;
 return `<section class="crm-page"><header class="crm-heading"><div><h2>Member & Poin</h2><p class="muted">Kenali pelanggan, lihat pembelian, dan atur poin loyalitas.</p></div><button type="button" id="crm-new" class="primary" ${ready?'':'disabled'}>+ Member baru</button></header>${ready?'':'<p class="notice">Pasang database/crm-loyalty-085.sql lalu muat ulang.</p>'}<div class="crm-tabs" role="group" aria-label="Tampilan CRM"><button data-crm-tab="members" aria-pressed="true">Database member</button>${s.me.role==='owner'?'<button data-crm-tab="rules" aria-pressed="false">Aturan poin produk</button>':''}<button data-crm-tab="whatsapp" aria-pressed="false">Promosi WhatsApp</button></div><section data-crm-panel="members"><div class="panel"><div class="crm-toolbar"><label class="field">Cari member<input id="crm-query" placeholder="Nama / nomor telepon" autocomplete="off"></label><button id="crm-search" type="button" ${ready?'':'disabled'}>Cari</button><label class="crm-consent"><input type="checkbox" id="crm-optin"><span>Setuju promosi saja</span></label></div><div id="crm-members" aria-live="polite"></div><div class="crm-pagination"><button id="crm-prev" type="button">Sebelumnya</button><span id="crm-page-label"></span><button id="crm-next" type="button">Berikutnya</button></div></div></section><section data-crm-panel="rules" hidden>${rulesBody(s)}</section><section data-crm-panel="whatsapp" hidden><article class="panel"><span class="pill">Belum terhubung ke WhatsApp</span><h3>Kontak promosi dengan persetujuan</h3><p>Ekspor member aktif yang setuju menerima promosi. Nomor tersimpan dalam format internasional, misalnya 62812…</p><p>Untuk broadcast otomatis, hubungkan WhatsApp Business Platform / penyedia API resmi, template promosi yang disetujui, dan webhook status serta berhenti berlangganan.</p><p class="muted">Ekspor ini tidak mengirim pesan. Perbarui persetujuan sebelum kampanye; daftar lama mungkin memuat pelanggan yang sudah berhenti.</p><button type="button" id="crm-export" ${ready?'':'disabled'}>Ekspor kontak promosi CSV</button><p data-export-status role="status"></p></article></section><p id="crm-error" class="error" role="alert"></p></section>`;
}
function rulesBody(s){
 const products=s.products.filter(p=>!['raw','prep'].includes(p.itemType));
 return `<article class="panel"><h3>Poin per produk / varian</h3><p class="muted">Belum diatur = 0 poin. Jumlah produk yang sama dijumlahkan dalam satu transaksi, lalu dibulatkan ke bawah per kelipatan. Poin hanya masuk untuk member setelah lunas; void membatalkan poin semula. Belum termasuk penukaran poin.</p><label class="field">Cari produk<input id="crm-rule-query" placeholder="Nama produk / varian"></label><div class="crm-rule-list">${products.map(p=>{const r=s.pointRules?.find(r=>r.productId===p.id);return `<div class="crm-rule-row" data-rule-name="${e(p.name.toLowerCase())}"><div><b>${e(p.name)}</b><small>${r&&r.active?`${num(r.points)} poin / ${num(r.stepQty)} ${e(r.unit)}`:'Tidak menghasilkan poin'}</small></div><button type="button" data-point-rule="${e(p.id)}" ${s.crmVersion>=85?'':'disabled'}>Atur poin</button></div>`;}).join('')||'<p>Belum ada produk.</p>'}</div></article>`;
}
function ruleDialog(ctx,productId){
 const s=ctx.getState(),p=s.products.find(x=>x.id===productId),r=s.pointRules?.find(x=>x.productId===productId)||{revision:0,stepQty:1,points:0,unit:p.stockUnit==='kg_butir'?'kg':p.stockUnit,active:true};
 const d=ctx.modal('Atur poin produk',`<h3>${e(p.name)}</h3>${field('Poin setiap kelipatan',`<input name="points" type="number" min="0" max="1000000" step="1" value="${r.points}" required>`)}${field('Jumlah produk',`<input name="stepQty" type="number" min="0.000001" max="1000000" step="any" value="${r.stepQty}" required>`)}${field('Satuan perhitungan',`<select name="unit">${(p.stockUnit==='kg_butir'?['kg','butir']:[p.stockUnit]).map(u=>`<option value="${e(u)}" ${u===r.unit?'selected':''}>${e(u)}</option>`).join('')}</select>`)}<label class="crm-consent"><input name="active" type="checkbox" ${r.active?'checked':''}><span>Aturan aktif</span></label><p class="muted">Buah dihitung dari berat aktual / jumlah butir, termasuk saat cara jualnya berbeda. Aturan baru berlaku untuk pembayaran berikutnya.</p>`,'Simpan aturan');
 let saving=false;const eventId=id();d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(saving)return;const f=ev.currentTarget,btn=f.querySelector('[type=submit]');try{
  const v=normalizeRule(s,{...Object.fromEntries(new FormData(f)),productId,active:f.elements.active.checked});saving=true;btn.disabled=true;
  await ctx.mutate('crm_rule_save',{id:eventId,...v,expectedRevision:r.revision},{throwOnError:true});d.close();ctx.render();document.querySelector('[data-crm-tab=rules]')?.click();ctx.toast('Aturan poin disimpan.');
 }catch(error){d.querySelector('#form-error').textContent=error.message;}finally{saving=false;btn.disabled=false;}};
}
async function memberDetail(ctx,m){
 const d=ctx.modal('Detail member',`<h3>${e(m.name)}</h3><p>${e(m.phone)}${m.email?'<br>'+e(m.email):''}</p><p><b>${num(m.balance)} poin</b> · ${m.active?'Aktif':'Nonaktif'}</p><p>Promosi WhatsApp: ${m.waOptIn?'Setuju':'Tidak setuju'}<br><small>Dicatat: ${e(when(m.consentAt))}</small></p><button type="button" data-member-edit>Ubah data / persetujuan</button><h3>Riwayat transaksi & poin</h3><p class="muted">Saldo mencakup seluruh outlet. Riwayat menampilkan outlet yang dapat Anda akses.</p><div data-member-history role="status">Memuat…</div><div class="crm-pagination"><button type="button" data-history-prev>Sebelumnya</button><span data-history-page></span><button type="button" data-history-next>Berikutnya</button></div>`,'Tutup');
 d.querySelector('form').onsubmit=ev=>{ev.preventDefault();d.close();};d.querySelector('[data-member-edit]').onclick=()=>{d.close();memberDialog(ctx,m,()=>ctx.render());};
 let offset=0,busy=false;
 const load=async()=>{if(busy)return;busy=true;const box=d.querySelector('[data-member-history]');try{const data=await read(ctx,{memberId:m.id,detail:true,offset});
  if(!d.open)return;box.innerHTML=data.ledger.map(x=>`<article class="crm-ledger"><div><b>${x.kind==='refund'?'Void / pengembalian':'Pembelian'} #${e(x.sourceId.slice(0,8))}</b><small>${e(when(x.createdAt))} · ${e(ctx.getState().stores.find(y=>y.id===x.storeId)?.name||'Outlet')} · ${money(x.total)}</small><small>${(x.breakdown||[]).map(b=>`${e(b.name)}: ${num(b.qty)} ${e(b.unit)} → ${num(b.awarded)} poin`).join('<br>')||'Produk tanpa poin'}</small></div><strong>${x.points>0?'+':''}${num(x.points)}</strong></article>`).join('')||'<p>Belum ada transaksi member pada outlet yang dapat diakses.</p>';
  d.querySelector('[data-history-prev]').disabled=offset===0;d.querySelector('[data-history-next]').disabled=offset+data.limit>=data.ledgerTotal;d.querySelector('[data-history-page]').textContent=`${data.ledgerTotal} catatan`;
 }catch(error){box.textContent=error.message;}finally{busy=false;}};
 d.querySelector('[data-history-prev]').onclick=()=>{if(!busy){offset=Math.max(0,offset-50);load();}};d.querySelector('[data-history-next]').onclick=()=>{if(!busy){offset+=50;load();}};await load();
}
export function bindCrm(ctx){
 const root=document.querySelector('.crm-page');if(!root||!crmAdmin(ctx.getState()))return;let offset=0,seq=0;
 root.querySelectorAll('[data-crm-tab]').forEach(b=>b.onclick=()=>{root.querySelectorAll('[data-crm-tab]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));root.querySelectorAll('[data-crm-panel]').forEach(p=>p.hidden=p.dataset.crmPanel!==b.dataset.crmTab);});
 root.querySelector('#crm-new').onclick=()=>memberDialog(ctx,null,()=>ctx.render());
 const load=async()=>{const ticket=++seq,box=root.querySelector('#crm-members');box.textContent='Memuat member…';try{
  const data=await read(ctx,{query:root.querySelector('#crm-query').value,optInOnly:root.querySelector('#crm-optin').checked,offset});if(ticket!==seq||!root.isConnected)return;
  box.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Member</th><th>Telepon / email</th><th>Poin</th><th>Promosi WA</th><th></th></tr></thead><tbody>${data.members.map(m=>`<tr><td><b>${e(m.name)}</b><small>${m.active?'Aktif':'Nonaktif'}</small></td><td>${e(m.phone)}<small>${e(m.email||'—')}</small></td><td>${num(m.balance)}</td><td>${m.waOptIn&&m.active?'Setuju':'Tidak diikutkan'}</td><td><button type="button" data-member-detail="${e(m.id)}">Detail</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Belum ada member yang sesuai.</td></tr>'}</tbody></table></div>`;
  root.querySelector('#crm-page-label').textContent=`${data.total} member · halaman ${Math.floor(offset/50)+1}`;root.querySelector('#crm-prev').disabled=offset===0;root.querySelector('#crm-next').disabled=offset+data.limit>=data.total;
  box.querySelectorAll('[data-member-detail]').forEach(b=>b.onclick=()=>memberDetail(ctx,data.members.find(x=>x.id===b.dataset.memberDetail)));
 }catch(error){if(ticket===seq)box.textContent=error.message;}};
 root.querySelector('#crm-search').onclick=()=>{offset=0;load();};root.querySelector('#crm-query').onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();offset=0;load();}};root.querySelector('#crm-optin').onchange=()=>{offset=0;load();};
 root.querySelector('#crm-prev').onclick=()=>{offset=Math.max(0,offset-50);load();};root.querySelector('#crm-next').onclick=()=>{offset+=50;load();};
 root.querySelectorAll('[data-point-rule]').forEach(b=>b.onclick=()=>ruleDialog(ctx,b.dataset.pointRule));const rq=root.querySelector('#crm-rule-query');if(rq)rq.oninput=()=>root.querySelectorAll('[data-rule-name]').forEach(r=>r.hidden=!r.dataset.ruleName.includes(rq.value.trim().toLowerCase()));
 root.querySelector('#crm-export').onclick=async ev=>{const btn=ev.currentTarget,status=root.querySelector('[data-export-status]');btn.disabled=true;try{
  const rows=[];let offset=0;while(true){const data=await read(ctx,{export:true,offset});rows.push(...data.members);offset+=data.limit;if(offset>=data.total)break;}
  const unique=[...new Map(rows.map(m=>[m.id,m])).values()];if(!unique.length)throw Error('Belum ada member aktif yang menyetujui promosi.');
  const url=URL.createObjectURL(new Blob([contactsCsv(unique)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='kontak-promosi-member.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent=`${unique.length} kontak diekspor. Belum ada pesan yang dikirim.`;
 }catch(error){status.textContent=error.message;}finally{btn.disabled=false;}};
 if(ctx.getState().crmVersion>=85)load();
}
