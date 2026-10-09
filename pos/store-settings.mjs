import {escape as e,id} from './core.mjs?v=60';
import {compressPhoto} from './photo-compression.mjs?v=41';
import {storeProfile,receiptHeader,loadStoreLogo} from './store-profile.mjs?v=64';
export function storesPage(state) {
  return `<div class="intro"><div><h2>Data toko</h2><p class="muted">Nama, alamat, telepon, dan logo untuk header struk tiap outlet.</p></div>${state.me?.role==='owner'?'<button class="primary" data-master="stores">Tambah toko</button>':''}</div><section class="panel"><div class="table-wrap"><table><thead><tr><th>NAMA TOKO</th><th>ALAMAT</th><th>NOMOR TELEPON</th><th>LOGO STRUK</th><th>AKSI</th></tr></thead><tbody>${state.stores.map(s=>`<tr><td><b>${e(s.name)}</b></td><td class="store-address-cell">${e(s.address??s.location??'—')}</td><td>${e(s.phone||'—')}</td><td>${s.hasLogo||s.logo?'Tersimpan':'Belum diunggah'}</td><td><button class="small" data-edit-kind="stores" data-edit-id="${e(s.id)}">Edit toko</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Belum ada toko.</td></tr>'}</tbody></table></div></section>`;
}
export function storeDialog(state,ctx,record) {
  if(!state.access?.master){ctx.toast('Hak akses master diperlukan.');return;}
  if(!state.stockDemo&&Number(state.storeProfileVersion||0)<64){ctx.toast('Jalankan SQL store-receipt-064 terlebih dahulu.');return;}
  if(!record&&state.me?.role!=='owner'){ctx.toast('Hanya owner yang dapat menambah toko.');return;}
  const initial=record||{},creating=!record,requestId=id(),storeId=initial.id||id();
  const d=ctx.modal(creating?'Tambah toko':'Edit toko',`<div class="store-editor"><div class="store-fields"><label class="field">Nama toko<input name="name" required maxlength="100" autocomplete="organization" value="${e(initial.name||'')}" placeholder="MANIAC DUREN JABABEKA"></label><label class="field">Alamat toko<textarea name="address" required maxlength="300" rows="3" autocomplete="street-address" placeholder="Alamat lengkap untuk dicetak pada struk">${e(initial.address??initial.location??'')}</textarea></label><label class="field">Nomor telepon<input name="phone" type="tel" required maxlength="40" autocomplete="tel" value="${e(initial.phone||'')}" placeholder="08… atau +62…"></label><label class="field">Logo header struk<input type="file" data-store-logo-file accept="image/png,image/jpeg,image/webp"></label><p class="form-help">PNG, JPG, atau WebP. Logo dikompres otomatis, maksimal 70 KB. Logo boleh dikosongkan.</p><p data-store-logo-status role="status"></p><button type="button" data-store-logo-remove>Hapus logo</button></div><aside class="store-preview"><b>Pratinjau header struk</b><div class="store-receipt-preview"></div><p class="form-help">Perubahan digunakan pada cetak berikutnya, termasuk cetak ulang transaksi lama.</p></aside></div>`,'Simpan toko');
  d.classList.add('store-dialog');
  const form=d.querySelector('form'),field=name=>form.querySelector(`[name="${name}"]`),preview=form.querySelector('.store-receipt-preview'),status=form.querySelector('[data-store-logo-status]'),file=form.querySelector('[data-store-logo-file]'),remove=form.querySelector('[data-store-logo-remove]'),submit=form.querySelector('[type="submit"]');
  let logo=initial.logo||'',changed=false,version=0,pending=false,saving=false,done=false;
  const values=()=>({name:field('name').value,address:field('address').value,phone:field('phone').value});
  const draw=()=>{preview.innerHTML=receiptHeader({...values(),logo});remove.hidden=!(logo||(!changed&&initial.hasLogo));};
  for(const key of ['name','address','phone'])field(key).addEventListener('input',draw);
  const photoContext={...ctx,demo:!!state.stockDemo};
  if(initial.hasLogo&&!logo){const ticket=version;loadStoreLogo(initial,photoContext).then(value=>{if(ticket!==version)return;logo=value;status.textContent=value?'Logo tersimpan.':state.stockDemo?'Unggah logo untuk mencoba pada mode demo.':'';draw();}).catch(()=>{if(ticket===version)status.textContent='Pratinjau logo belum termuat. Logo lama tetap dipertahankan saat menyimpan.';});}
  file.onchange=async()=>{
    const upload=file.files?.[0];if(!upload)return;
    const ticket=++version;pending=true;status.textContent='Memproses logo…';
    try{const result=await compressPhoto(upload,'profile');if(ticket!==version)return;logo=result.photo;changed=true;status.textContent=`Logo siap disimpan · ${Math.ceil(result.bytes/1024)} KB`;draw();}
    catch(error){if(ticket===version)status.textContent=error.message+' Logo sebelumnya tetap digunakan.';}
    finally{if(ticket===version){pending=false;file.value='';}}
  };
  remove.onclick=()=>{version++;pending=false;logo='';changed=true;file.value='';status.textContent='Logo akan dihapus setelah disimpan.';draw();};
  form.onsubmit=async ev=>{
    ev.preventDefault();if(saving||done)return;
    const error=form.querySelector('#form-error');error.textContent='';
    if(pending){error.textContent='Tunggu logo selesai diproses.';return;}
    try{
      const data=storeProfile({...values(),...(changed?{logo}:{})});
      saving=true;submit.disabled=true;
      if(await ctx.mutate('store_save',{id:requestId,storeId,creating,baseVersion:initial.profileVersion||null,...data})){
        done=true;d.close();ctx.render();ctx.toast('Data toko dan header struk tersimpan.');
      }
    }catch(err){error.textContent=err.message;}finally{saving=false;submit.disabled=false;}
  };
  draw();return d;
}
