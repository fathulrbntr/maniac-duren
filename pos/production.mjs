const SCALE=1000000;
export const unitLabel={g:'gram',ml:'ml',pcs:'pcs',porsi:'porsi'};
export const outputTypes=['prep','finished','recipe'];
export const inputTypes=['raw','prep','direct','finished'];
export const scalar=p=>!!p&&Object.hasOwn(unitLabel,p.stockUnit);
export function quantity(value,unit){
 const n=Number(value),scaled=Math.round(n*SCALE);
 if(!Number.isFinite(n)||n<=0||n>9000000000||!Number.isSafeInteger(scaled)||Math.abs(n*SCALE-scaled)>0.0001)throw Error('Jumlah harus positif, maksimal 6 angka desimal');
 if(['pcs','porsi'].includes(unit)&&!Number.isInteger(n))throw Error('Pcs dan porsi harus bilangan bulat');
 return scaled/SCALE;
}
const plus=(a,b)=>(Math.round(a*SCALE)+Math.round(b*SCALE))/SCALE;
const product=(s,id)=>{const p=s.products.find(x=>x.id===id);if(!scalar(p))throw Error('Pilih item bersatuan gram, ml, pcs atau porsi');return p;};
const date=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)throw Error('Tanggal tidak valid');};
export function stockQty(s,productId,storeId,asOf){return(s.unitLots||[]).filter(l=>l.productId===productId&&l.storeId===storeId&&(!asOf||l.date<=asOf)&&(!asOf||!l.expiry||l.expiry>=asOf)).reduce((a,l)=>plus(a,l.qty),0);}
export function recipeValues(s,p){
 const name=String(p.name||'').trim();if(!name||name.length>100)throw Error('Nama resep wajib, maksimal 100 karakter');
 const output=product(s,p.outputId);if(!outputTypes.includes(output.itemType))throw Error('Hasil resep harus bahan produksi, produk jadi, atau menu resep');
 const yieldQty=quantity(p.yieldQty,output.stockUnit);
 if(!Array.isArray(p.ingredients)||!p.ingredients.length||p.ingredients.length>50)throw Error('Isi 1–50 bahan resep');
 const seen=new Set();
 const ingredients=p.ingredients.map(line=>{const item=product(s,line.productId);if(!inputTypes.includes(item.itemType)||item.id===output.id||seen.has(item.id))throw Error('Bahan tidak valid, sama dengan hasil, atau terduplikasi');seen.add(item.id);return{productId:item.id,name:item.name,unit:item.stockUnit,qty:quantity(line.qty,item.stockUnit)};});
 return{name,outputId:output.id,outputName:output.name,outputUnit:output.stockUnit,yieldQty,ingredients};
}
export function productionPreview(s,recipe,storeId,batches,asOf){
 const count=Number(batches);if(!Number.isInteger(count)||count<1||count>10000)throw Error('Jumlah resep harus 1–10.000 kali');
 const r=recipeValues(s,recipe);
 return{...r,batches:count,expectedQty:quantity(r.yieldQty*count,r.outputUnit),ingredients:r.ingredients.map(l=>({...l,qty:quantity(l.qty*count,l.unit),available:stockQty(s,l.productId,storeId,asOf)}))};
}
export function productionAction(s,action,p){
 s.recipes??=[];s.unitLots??=[];s.productions??=[];
 if(action==='recipe_save'){
  const r=recipeValues(s,p),i=s.recipes.findIndex(x=>x.id===p.id);
  if(i<0){if(p.version!==0)throw Error('Resep belum tersimpan. Muat ulang');s.recipes.push({id:p.id,...r,version:1});}
  else{if(s.recipes[i].version!==p.version)throw Error('Resep berubah. Muat ulang sebelum menyimpan');s.recipes[i]={id:p.id,...r,version:p.version+1};}return;
 }
 if(action==='unit_receipt'){
  if(s.unitLots.some(x=>x.id===p.id))return;
  const item=product(s,p.productId);date(p.date);if(p.expiry){date(p.expiry);if(p.expiry<p.date)throw Error('Kedaluwarsa sebelum tanggal masuk');}
  if(!s.stores.some(x=>x.id===p.storeId))throw Error('Store tidak ditemukan');
  if(!['purchase','opening'].includes(p.kind))throw Error('Jenis penerimaan tidak valid');
  if(p.kind==='purchase'&&(!['raw','direct'].includes(item.itemType)||!s.suppliers.some(x=>x.id===p.supplierId)))throw Error('Pembelian hanya untuk bahan pembelian / produk jual langsung dan wajib supplier');
  if(p.kind==='opening'&&!p.note?.trim())throw Error('Catatan stok awal wajib');
  const qty=quantity(p.qty,item.stockUnit);
  s.unitLots.push({id:p.id,productId:item.id,storeId:p.storeId,unit:item.stockUnit,receivedQty:qty,qty,date:p.date,expiry:p.expiry||null,kind:p.kind,supplierId:p.kind==='purchase'?p.supplierId:null,note:String(p.note||'').slice(0,300)});return;
 }
 if(action==='produce'){
  if(s.productions.some(x=>x.id===p.id))return;
  if(!s.stores.some(x=>x.id===p.storeId))throw Error('Store tidak ditemukan');date(p.date);
  const recipe=s.recipes.find(x=>x.id===p.recipeId);if(!recipe||recipe.version!==p.recipeVersion)throw Error('Resep berubah / tidak ditemukan. Muat ulang');
  const plan=productionPreview(s,recipe,p.storeId,p.batches,p.date),actualQty=quantity(p.actualQty,plan.outputUnit);
  if(p.expiry){date(p.expiry);if(p.expiry<p.date)throw Error('Kedaluwarsa sebelum tanggal produksi');}
  const used=[];
  for(const line of plan.ingredients){
   if(line.available<line.qty)throw Error('Stok tidak cukup: '+line.name);
   let remaining=line.qty;
   for(const lot of s.unitLots.filter(l=>l.productId===line.productId&&l.storeId===p.storeId&&l.date<=p.date&&(!l.expiry||l.expiry>=p.date)&&l.qty>0).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){
    const taken=Math.min(lot.qty,remaining);if(!taken)continue;
    lot.qty=plus(lot.qty,-taken);remaining=plus(remaining,-taken);used.push({lotId:lot.id,productId:line.productId,name:line.name,unit:line.unit,qty:taken});if(!remaining)break;
   }
  }
  s.unitLots.push({id:p.id,productId:plan.outputId,storeId:p.storeId,unit:plan.outputUnit,receivedQty:actualQty,qty:actualQty,date:p.date,expiry:p.expiry||null,kind:'production',supplierId:null,note:String(p.note||'').slice(0,300)});
  s.productions.push({id:p.id,storeId:p.storeId,date:p.date,recipeId:recipe.id,recipeVersion:recipe.version,recipeName:recipe.name,outputId:plan.outputId,outputName:plan.outputName,unit:plan.outputUnit,batches:plan.batches,expectedQty:plan.expectedQty,actualQty,ingredients:plan.ingredients.map(({available,...l})=>l),used,note:String(p.note||'').slice(0,300),voided:false});return;
 }
 if(action==='production_void'){
  const run=s.productions.find(x=>x.id===p.productionId);if(!run)throw Error('Produksi tidak ditemukan');if(run.voided)return;
  if(!p.reason?.trim())throw Error('Alasan pembatalan wajib');
  const output=s.unitLots.find(x=>x.id===run.id);if(output.qty!==output.receivedQty)throw Error('Hasil sudah digunakan; produksi tidak bisa dibatalkan');
  output.qty=0;for(const line of run.used){const l=s.unitLots.find(x=>x.id===line.lotId);l.qty=plus(l.qty,line.qty);}
  run.voided=true;run.voidReason=p.reason.trim().slice(0,300);return;
 }
 throw Error('Aksi produksi tidak valid');
}
