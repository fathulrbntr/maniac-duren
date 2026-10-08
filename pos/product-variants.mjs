import { normalizeProduct, saveProduct } from './catalog.mjs?v=9';
export const MAX_VARIANTS = 60;
const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const key = value => clean(value).toLowerCase();
export const optionKey = options => JSON.stringify(options.map(o => [key(o.name), key(o.value)]));
export const variantName = (name, options) => [clean(name), ...options.map(o => clean(o.value))].join(' ');
export const variantLabel = options => options.map(o => clean(o.value)).join(' / ');
export function variantAxes(products) {
  const axes = [];
  for (const p of products) for (const o of p.variantOptions || []) {
    let axis = axes.find(a => key(a.name) === key(o.name));
    if (!axis) axes.push(axis = {name:o.name, values:[]});
    if (!axis.values.some(v => key(v) === key(o.value))) axis.values.push(o.value);
  }
  return axes;
}
export function combinations(axes) {
  if (!axes.length || axes.length > 3) throw Error('Isi 1–3 pilihan varian.');
  const seen = new Set();
  const normalized = axes.map(axis => {
    const name = clean(axis.name);
    if (!name || name.length > 30 || seen.has(key(name))) throw Error('Nama pilihan wajib, berbeda, dan maksimal 30 karakter.');
    seen.add(key(name));
    const values = (Array.isArray(axis.values) ? axis.values : String(axis.values).split(',')).map(clean).filter(Boolean);
    if (!values.length || values.some(v => v.length > 40)) throw Error(`Isi pilihan ${name}; setiap nilai maksimal 40 karakter.`);
    if (new Set(values.map(key)).size !== values.length) throw Error(`Ada nilai ${name} yang sama. Hapus duplikatnya.`);
    return {name, values};
  });
  if (normalized.reduce((n,a) => n*a.values.length,1) > MAX_VARIANTS) throw Error(`Maksimal ${MAX_VARIANTS} kombinasi per barang.`);
  return normalized.reduce((rows,a) => rows.flatMap(row => a.values.map(value => [...row,{name:a.name,value}])) ,[[]]);
}
export function buildVariantRows({name,axes,previous=[],existing=[],products=[],groupId}) {
  const combos = combinations(axes), wanted = new Set(combos.map(optionKey));
  if (existing.some(p => !wanted.has(optionKey(p.variantOptions)))) throw Error('Pilihan varian yang sudah tersimpan harus tetap disertakan.');
  const cache = new Map([...previous,...existing].map(p => [optionKey(p.variantOptions),p]));
  const used = new Set([...products,...previous,...existing].map(p => key(p.sku)));
  let serial = 0;
  return combos.map(variantOptions => {
    const fullName = variantName(name,variantOptions);
    if (!clean(name) || fullName.length > 100 || variantLabel(variantOptions).length > 100) throw Error('Nama barang beserta varian wajib diisi dan maksimal 100 karakter.');
    const old = cache.get(optionKey(variantOptions));
    let sku = old?.sku;
    if (!sku) {
      const prefix = clean(name).toUpperCase().replace(/[^A-Z0-9]+/g,'-').slice(0,16) || 'ITEM';
      do { sku = `${prefix}-${groupId.replace(/-/g,'').slice(0,10)}-${++serial}`; } while (used.has(key(sku)));
      used.add(key(sku));
    }
    return {...old, id:old?.id || crypto.randomUUID(), name:fullName, variant:variantLabel(variantOptions), variantOptions, sku, barcode:old?.barcode || '', existing:existing.some(p => p.id === old?.id)};
  });
}
export function variantPayload({id,groupId,name,common,rows,existing=[],products=[]}) {
  const fresh = rows.filter(p => !p.existing);
  if (!fresh.length) throw Error('Tambahkan minimal satu varian baru.');
  if (rows.length > MAX_VARIANTS) throw Error(`Maksimal ${MAX_VARIANTS} varian per barang.`);
  const skus = new Set(products.map(p => key(p.sku))), barcodes = new Set(products.map(p => key(p.barcode)).filter(Boolean));
  const variants = fresh.map(p => {
    const normalized = normalizeProduct({...common,...p,photo:''});
    if (skus.has(key(normalized.sku))) throw Error(`SKU ${normalized.sku} sudah digunakan.`);
    skus.add(key(normalized.sku));
    if (normalized.barcode && barcodes.has(key(normalized.barcode))) throw Error(`Barcode ${normalized.barcode} sudah digunakan.`);
    if (normalized.barcode) barcodes.add(key(normalized.barcode));
    return {...normalized,id:p.id,variantOptions:p.variantOptions};
  });
  return {id,groupId,name:clean(name),expectedIds:existing.map(p=>p.id).sort(),variants};
}
export function saveVariantProducts(state,payload) {
  if ((state.events || []).some(e => e.id === payload.id && e.action === 'product_variants_save')) return;
  const existing = state.products.filter(p => p.variantGroupId === payload.groupId);
  if (JSON.stringify(existing.map(p=>p.id).sort()) !== JSON.stringify([...payload.expectedIds].sort())) throw Error('Daftar varian sudah berubah. Tutup form dan perbarui data.');
  for (const p of payload.variants) {
    if (state.products.some(x => x.id === p.id)) throw Error('ID barang sudah digunakan.');
    saveProduct(state,p);
    Object.assign(state.products.find(x=>x.id === p.id),{variantGroupId:payload.groupId,variantGroupName:payload.name,variantOptions:p.variantOptions});
  }
  (state.events ||= []).push({id:payload.id,action:'product_variants_save'});
}
