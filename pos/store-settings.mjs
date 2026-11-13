import {escape as e,id} from './core.mjs';
import {compressPhoto} from './photo-compression.mjs';
import {storeProfile,receiptHeader,loadStoreLogo} from './store-profile.mjs';
const isWarehouse=location=>location?.locationType==='warehouse';
export const locationTypeLabel=location=>isWarehouse(location)?'Gudang':'Branch Outlet';
export const locationLabel=location=>location?`${locationTypeLabel(location)} · ${location.name}`:'—';
export function locationOptions(locations,selected){
  return [false,true].map(warehouse=>{
    const rows=locations.filter(location=>isWarehouse(location)===warehouse);
    if(!rows.length)return '';
    return `<optgroup label="${warehouse?'Gudang':'Branch Outlet'}">${rows.map(location=>`<option value="${e(location.id)}" ${location.id===selected?'selected':''}>${e(locationLabel(location))}</option>`).join('')}</optgroup>`;
  }).join('');
}
const nameKey=location=>String(location.name||'').normalize('NFKC').toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]/gu,'');
const sameNameAcrossTypes=(location,locations)=>nameKey(location)&&locations.some(other=>other.id!==location.id&&isWarehouse(other)!==isWarehouse(location)&&nameKey(other)===nameKey(location));
export function storesPage(state) {
  const locations=state.stores||[],branches=locations.filter(s=>!isWarehouse(s)),warehouses=locations.filter(isWarehouse);
  const section=(rows,warehouse)=>{
    const type=warehouse?'warehouse':'branch',label=warehouse?'Gudang':'Branch Outlet';
    return `<section class="panel location-section ${type}" data-location-section="${type}" aria-labelledby="location-heading-${type}"><header class="location-section-head"><div class="location-section-title"><span class="location-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${warehouse?'M3 10l9-6 9 6v11H3z M8 21V12h8v9 M8 16h8':'M3 9l2-6h14l2 6 M3 9v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9 M5 15v6h14v-6'}"/></svg></span><div><h2 id="location-heading-${type}">${label} <span class="location-count" aria-label="${rows.length} lokasi">${rows.length}</span></h2><p>${warehouse?'Pusat penerimaan supplier dan pengiriman barang ke branch.':'Cabang penjualan, pelayanan pelanggan, dan penerimaan kiriman gudang.'}</p></div></div>${!warehouse&&state.me?.role==='owner'?'<button type="button" class="primary" data-master="stores">Tambah branch outlet</button>':''}</header><div class="table-wrap"><table class="location-table"><thead><tr><th>${warehouse?'NAMA GUDANG':'NAMA BRANCH OUTLET'}</th><th>ALAMAT</th><th>NOMOR TELEPON</th><th>LOGO</th><th>AKSI</th></tr></thead><tbody>${rows.map(location=>`<tr data-location-kind="${type}"><td><span class="location-type ${type}">${label}</span><b>${e(location.name)}</b>${sameNameAcrossTypes(location,locations)?`<small class="location-name-note">Nama sama dengan ${warehouse?'branch outlet':'gudang'}.</small>`:''}</td><td class="store-address-cell">${e(location.address||location.location||'Belum diisi')}</td><td>${e(location.phone||'Belum diisi')}</td><td>${location.hasLogo||location.logo?'Tersimpan':'Belum diunggah'}</td><td><button type="button" class="small" data-edit-kind="stores" data-edit-id="${e(location.id)}">${warehouse?'Edit gudang':'Edit branch'}</button></td></tr>`).join('')||`<tr><td colspan="5" class="empty">${warehouse?'Belum ada gudang pada daftar lokasi ini.':'Belum ada branch outlet.'}</td></tr>`}</tbody></table></div></section>`;
  };
  return `<div class="location-directory"><div class="location-directory-intro"><h2>Kelola lokasi</h2><p>Branch outlet dan gudang ditampilkan terpisah sesuai fungsi operasionalnya.</p></div>${locations.some(location=>sameNameAcrossTypes(location,locations))?'<aside class="location-name-notice" role="note"><b>Periksa nama lokasi</b><p>Ada branch outlet dan gudang dengan nama yang sama. Periksa nama branch agar lokasi mudah dikenali saat dipilih.</p></aside>':''}${section(branches,false)}${section(warehouses,true)}</div>`;
}
export function storeDialog(state,ctx,record) {
  if(!state.access?.master){ctx.toast('Hak akses master diperlukan.');return;}
  if(!state.stockDemo&&Number(state.storeProfileVersion||0)<64){ctx.toast('Jalankan SQL store-receipt-064 terlebih dahulu.');return;}
  if(!record&&state.me?.role!=='owner'){ctx.toast('Hanya owner yang dapat menambah toko.');return;}
  const initial=record||{},creating=!record,requestId=id(),storeId=initial.id||id(),warehouse=isWarehouse(initial);
  const label=warehouse?'gudang':'branch outlet',previewTitle=warehouse?'Pratinjau identitas gudang':'Pratinjau header struk';
  const d=ctx.modal(`${creating?'Tambah':'Edit'} ${label}`,`<p class="store-kind-summary"><span class="location-type ${warehouse?'warehouse':'branch'}">${locationTypeLabel(initial)}</span>${warehouse?'Pusat penerimaan dan distribusi barang.':'Cabang penjualan dan pelayanan pelanggan.'}</p><div class="store-editor"><div class="store-fields"><label class="field">Nama ${label}<input name="name" required maxlength="100" autocomplete="organization" value="${e(initial.name||'')}" placeholder="${warehouse?'PT. ALTARA RASA NUSANTARA':'MANIAC DUREN JABABEKA'}"></label><label class="field">Alamat ${label}<textarea name="address" required maxlength="300" rows="3" autocomplete="street-address" placeholder="Alamat lengkap lokasi">${e(initial.address??initial.location??'')}</textarea></label><label class="field">Nomor telepon<input name="phone" type="tel" required maxlength="40" autocomplete="tel" value="${e(initial.phone||'')}" placeholder="08… atau +62…"></label><label class="field">${warehouse?'Logo lokasi':'Logo header struk'}<input type="file" data-store-logo-file accept="image/png,image/jpeg,image/webp"></label><p class="form-help">PNG, JPG, atau WebP. Logo dikompres otomatis, maksimal 70 KB. Logo boleh dikosongkan.</p><p data-store-logo-status role="status"></p><button type="button" data-store-logo-remove>Hapus logo</button></div><aside class="store-preview"><b>${previewTitle}</b><div class="store-receipt-preview"></div><p class="form-help">${warehouse?'Nama, alamat, dan telepon digunakan pada invoice dan surat jalan baru. Dokumen yang sudah terbit mempertahankan identitas saat pengiriman.':'Perubahan digunakan pada cetak berikutnya, termasuk cetak ulang transaksi lama.'}</p></aside></div>`,warehouse?'Simpan gudang':'Simpan branch');
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
        done=true;d.close();ctx.render();ctx.toast(warehouse?'Profil gudang tersimpan.':'Data branch outlet dan header struk tersimpan.');
      }
    }catch(err){error.textContent=err.message;}finally{saving=false;submit.disabled=false;}
  };
  draw();return d;
}
