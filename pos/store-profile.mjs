import {escape as e} from './core.mjs?v=60';
const logos = new Map();
export function storeLogo(value='') {
  const data=String(value||'');if(!data)return '';
  const match=data.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match||match[1].length%4)throw Error('Logo harus PNG, JPG, atau WebP.');
  const bytes=match[1].length*3/4-(match[1].endsWith('==')?2:match[1].endsWith('=')?1:0);
  if(bytes>70*1024)throw Error('Logo maksimal 70 KB setelah kompresi.');
  const raw=atob(match[1]);
  if(!(data.startsWith('data:image/png;')&&raw.startsWith('\x89PNG\r\n\x1a\n')||data.startsWith('data:image/jpeg;')&&raw.startsWith('\xff\xd8\xff')||data.startsWith('data:image/webp;')&&raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP'))throw Error('Isi logo tidak sesuai format gambar.');
  return data;
}
export function storeProfile(value) {
  const out={name:String(value.name||'').trim(),address:String(value.address??value.location??'').trim(),phone:String(value.phone||'').trim()};
  for(const [key,label,max] of [['name','Nama toko',100],['address','Alamat toko',300],['phone','Nomor telepon',40]])
    if(!out[key]||out[key].length>max)throw Error(`${label} wajib, maksimal ${max} karakter.`);
  if(Object.hasOwn(value,'logo'))out.logo=storeLogo(value.logo);
  return out;
}
export function receiptHeader(store={}) {
  let logo='';try{logo=storeLogo(store.logo);}catch{/* Ignore unsupported legacy image URLs. */}
  const address=String(store.address??store.location??'').trim(),phone=String(store.phone||'').trim();
  return `<header class="receipt-store-header"><div data-store-logo>${logo?`<img class="receipt-store-logo" src="${e(logo)}" alt="Logo toko">`:''}</div><h3>${e(store.name||'MANIAC DUREN')}</h3>${address?`<p class="receipt-store-address">${e(address)}</p>`:''}${phone?`<p>Telp. ${e(phone)}</p>`:''}</header>`;
}
export async function loadStoreLogo(store={},ctx={}) {
  if(Object.hasOwn(store,'logo'))return storeLogo(store.logo);
  if(!store.hasLogo)return '';
  const key=store.id+':'+store.logoVersion;
  if(logos.has(key))return logos.get(key);
  if(ctx.demo)return ''; // Demo never requests data from the live server.
  if(!ctx.loadStoreLogo)throw Error('Logo toko belum dapat dimuat. Muat ulang POS.');
  const pending=Promise.resolve().then(()=>ctx.loadStoreLogo(store.id,store.logoVersion)).then(storeLogo);
  for(const old of logos.keys())if(old.startsWith(store.id+':'))logos.delete(old);
  logos.set(key,pending);
  try{return await pending;}catch(error){logos.delete(key);throw error;}
}
export async function fillReceiptLogo(root,store,ctx) {
  const logo=await loadStoreLogo(store,ctx),slot=root.querySelector('[data-store-logo]');
  if(slot)slot.innerHTML=logo?`<img class="receipt-store-logo" src="${e(logo)}" alt="Logo toko">`:'';
}
export function saveStoreDemo(state,payload) {
  if(!state.access?.master)throw Error('Hak akses master diperlukan.');
  if(payload.creating&&state.me?.role!=='owner')throw Error('Hanya owner yang dapat menambah toko.');
  const old=state.stores.find(s=>s.id===payload.storeId);
  if(payload.creating?!!old:!old)throw Error(payload.creating?'ID toko sudah digunakan.':'Toko tidak ditemukan.');
  if(!payload.creating&&Object.hasOwn(payload,'baseVersion')&&(payload.baseVersion||null)!==(old.profileVersion||null))throw Error('Data toko berubah. Buka ulang form untuk memperbarui.');
  const profile=storeProfile(payload),record=old||{id:payload.storeId};
  Object.assign(record,profile,{location:profile.address,profileVersion:payload.id});
  if(Object.hasOwn(profile,'logo'))Object.assign(record,{hasLogo:!!profile.logo,logoVersion:payload.id});
  if(!old)state.stores.push(record);
}
