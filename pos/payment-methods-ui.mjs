import {escape as e,id} from './core.mjs?v=77';
import {paymentGroups,paymentMethods,paymentSettingsFor,availablePayments,normalizePaymentSettings} from './payment-methods.mjs?v=84';
const field=(label,body)=>`<label class="field">${label}${body}</label>`;
const details=m=>m.group!=='cash';
const info=m=>[m.bank,m.accountName,m.accountNumber,m.note].filter(Boolean).join(' · ');
export function paymentOptions(s,store){
 const all=availablePayments(s,store);return paymentGroups.map(g=>{const methods=all.filter(m=>m.group===g.id);return methods.length?`<optgroup label="${e(g.name)}">${methods.map(m=>`<option value="${e(m.label)}">${e(m.label)}</option>`).join('')}</optgroup>`:'';}).join('');
}
export function paymentInfo(s,store,label){
 const m=availablePayments(s,store).find(m=>m.label===label);return m?info(m):'';
}
export function paymentsPage(s,store){
 if(s.me?.role!=='owner')return '<section class="panel"><p>Pengaturan metode pembayaran hanya untuk owner.</p></section>';
 const ready=s.paymentMethodsVersion>=84,entry=paymentSettingsFor(s,store),config=entry.config;
 return `<section class="payments-page"><div class="intro"><div><h2>Metode Pembayaran</h2><p class="muted">${e(s.stores.find(x=>x.id===store)?.name||'Pilih outlet')} · Atur metode yang ditampilkan di kasir.</p></div><span class="pill">Per outlet</span></div>${!ready?'<p class="notice">Pengaturan belum tersedia. Pasang patch database pembayaran 084, lalu muat ulang POS.</p>':''}<form id="payment-settings-form"><fieldset ${ready?'':'disabled'} class="payment-settings-body">${paymentGroups.map(g=>`<section class="payment-group" data-payment-group="${g.id}"><div class="payment-group-head"><div><h3>${e(g.name)}</h3><p class="muted">${e(g.hint)}</p></div><label class="payment-switch"><input type="checkbox" role="switch" data-group="${g.id}" aria-label="Aktifkan ${e(g.name)}" ${config.groups[g.id]?'checked':''}><span aria-hidden="true"></span></label></div><div class="payment-method-list">${paymentMethods.filter(m=>m.group===g.id).map(m=>`<div class="payment-method" data-method-row="${m.id}"><label class="payment-method-choice"><span class="payment-mark" aria-hidden="true">${e(m.label==='Tunai'?'Rp':m.label==='QRIS'?'QR':m.label.replace('Transfer ','').slice(0,2).toUpperCase())}</span><span class="payment-method-text"><b>${e(m.label)}</b><small data-method-info="${m.id}">${e(info(config.methods[m.id])||(m.group==='qris'?'Rekening penerima QRIS dapat diisi melalui Ubah':m.group==='bank'?'Detail rekening belum diisi':g.hint))}</small></span><input type="checkbox" data-method="${m.id}" aria-label="Pilih ${e(m.label)}" ${config.methods[m.id].enabled?'checked':''}></label>${details(m)?`<button type="button" class="small payment-edit" data-payment-edit="${m.id}">Ubah</button>`:''}</div>`).join('')}</div></section>`).join('')}<aside class="payment-note">Pembayaran non-tunai dikonfirmasi kasir setelah memeriksa aplikasi / mesin EDC. Pengaturan ini tidak menghubungkan akun, memverifikasi dana, atau mengatur pencairan otomatis. Transaksi QRIS cukup dicatat satu kali sebagai QRIS, meskipun pelanggan membayar memakai e-wallet.</aside><p id="payment-settings-error" class="error" role="alert"></p><footer class="payment-save"><span data-payment-count></span><button type="submit" class="primary">Simpan pengaturan</button></footer></fieldset></form></section>`;
}
export function bindPayments(ctx,store){
 const s=ctx.getState(),form=document.querySelector('#payment-settings-form');if(!form||s.me?.role!=='owner')return;
 const current=paymentSettingsFor(s,store),config=structuredClone(current.config);let saving=false;
 const refresh=()=>{
  form.querySelectorAll('[data-group]').forEach(x=>{config.groups[x.dataset.group]=x.checked;const box=x.closest('[data-payment-group]');box.classList.toggle('is-off',!x.checked);box.querySelectorAll('[data-method],[data-payment-edit]').forEach(n=>n.disabled=!x.checked);});
  form.querySelector('[data-payment-count]').textContent=paymentMethods.filter(m=>config.groups[m.group]&&config.methods[m.id].enabled).length+' metode aktif';
 };
 form.querySelectorAll('[data-group]').forEach(x=>x.onchange=refresh);
 form.querySelectorAll('[data-method]').forEach(x=>x.onchange=()=>{config.methods[x.dataset.method].enabled=x.checked;refresh();});
 form.querySelectorAll('[data-payment-edit]').forEach(b=>b.onclick=()=>{
  const m=paymentMethods.find(m=>m.id===b.dataset.paymentEdit),value=config.methods[m.id];
  const text=(name,max,placeholder)=>`<input name="${name}" value="${e(value[name])}" maxlength="${max}" placeholder="${placeholder}" autocomplete="off">`;
  const d=ctx.modal('Detail '+m.label,`<p class="muted">Detail ini membantu kasir memeriksa tujuan pembayaran. Semua kolom opsional.</p>${field(m.group==='qris'?'Bank pencairan QRIS':'Bank / penyedia',text('bank',60,'Contoh: BCA'))}${field('Nama pemilik / akun',text('accountName',100,'Nama pemilik rekening / toko'))}${field('Nomor rekening / akun',text('accountNumber',50,'Isi nomor rekening atau akun'))}${field('Catatan untuk kasir',text('note',200,'Contoh: periksa notifikasi merchant'))}`,'Gunakan detail');
  d.classList.add('payment-detail-dialog');d.querySelector('form').onsubmit=ev=>{
   ev.preventDefault();try{const values=Object.fromEntries(new FormData(ev.currentTarget));
    // Full validation is done when saving; details retain the category's current toggle state.
    for(const k of ['bank','accountName','accountNumber','note']){if(/[\u0000-\u001f\u007f]/.test(values[k]))throw Error('Detail tidak valid');value[k]=values[k].trim();}
    form.querySelector(`[data-method-info="${m.id}"]`).textContent=info(value)||'Detail belum diisi';form.dataset.dirty='true';d.close();
   }catch(error){d.querySelector('#form-error').textContent=error.message;}
  };
 });
 form.onsubmit=async ev=>{
  ev.preventDefault();if(saving)return;const button=form.querySelector('[type=submit]'),error=form.querySelector('#payment-settings-error');
  try{const clean=normalizePaymentSettings(config);saving=true;button.disabled=true;error.textContent='';await ctx.mutate('payment_settings_save',{id:id(),storeId:store,expectedRevision:current.revision,config:clean},{throwOnError:true});form.dataset.dirty='false';ctx.render();ctx.toast('Metode pembayaran outlet disimpan.');}
  catch(x){error.textContent=x.message;}finally{saving=false;button.disabled=false;}
 };refresh();
}
