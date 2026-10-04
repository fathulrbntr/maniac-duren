const round=n=>Math.round(n*1e6)/1e6;
export function productStock(s,productId,storeId,dual){const lots=(dual?s.lots:s.unitLots)||[];const rows=lots.filter(l=>l.productId===productId&&l.storeId===storeId);return dual?{kg:round(rows.reduce((n,l)=>n+l.kg,0)),pieces:rows.reduce((n,l)=>n+l.pieces,0)}:{qty:round(rows.reduce((n,l)=>n+l.qty,0))};}
export function productUsed(s,id){return (s.lots||[]).some(l=>l.productId===id)||(s.unitLots||[]).some(l=>l.productId===id)||(s.recipes||[]).some(r=>r.outputId===id||r.ingredients.some(i=>i.productId===id))||(s.sales||[]).some(r=>r.lines.some(i=>i.productId===id))||(s.stockAdjustments||[]).some(r=>r.productId===id);}
export function deleteProduct(s,p){if(p.confirmed!==true)throw Error('Konfirmasi penghapusan diperlukan');if(productUsed(s,p.id))throw Error('Produk sudah digunakan dalam stok, transaksi, atau resep sehingga tidak dapat dihapus');s.products=s.products.filter(x=>x.id!==p.id);}
export function adjustProductStock(s,p){
 if(!p.stock)return;s.stockAdjustments??=[];if(s.stockAdjustments.some(a=>a.id===p.stock.id))return;
 const a=p.stock,product=s.products.find(x=>x.id===p.id),dual=product.stockUnit==='kg_butir',keys=dual?['kg','pieces']:['qty'];
 if(!a.id||!s.stores.some(x=>x.id===a.storeId))throw Error('Pilih store untuk penyesuaian');
 if(!a.reason?.trim()||a.reason.length>300)throw Error('Alasan penyesuaian wajib, maksimal 300 karakter');
 const before=productStock(s,p.id,a.storeId,dual),target={};
 for(const key of keys){const n=Number(a.target[key]);if(a.target[key]===''||!Number.isFinite(n)||n<0||n>1e9||Math.abs(n-round(n))>1e-9||((key==='pieces'||(!dual&&['pcs','porsi'].includes(product.stockUnit)))&&!Number.isInteger(n)))throw Error('Stok harus nonnegatif, maksimal 6 desimal; pcs/porsi/butir harus bulat');if(before[key]!==Number(a.expected[key]))throw Error('Stok berubah. Tutup form dan muat ulang sebelum menyesuaikan');target[key]=n;}
 if(keys.every(k=>before[k]===target[k]))return;
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}),lots=dual?s.lots:(s.unitLots??=[]),changes=[];
 const own=lots.filter(l=>l.productId===p.id&&l.storeId===a.storeId).sort((x,y)=>x.date.localeCompare(y.date)||x.id.localeCompare(y.id));
 for(const key of keys){let remaining=round(Math.max(0,before[key]-target[key]));for(const lot of own){const take=Math.min(lot[key],remaining);if(take>0){lot[key]=round(lot[key]-take);remaining=round(remaining-take);changes.push({lotId:lot.id,key,delta:-take});}if(!remaining)break;}}
 const positive=Object.fromEntries(keys.map(k=>[k,round(Math.max(0,target[k]-before[k]))]));
 if(keys.some(k=>positive[k]>0)){
  if(dual&&!s.suppliers.some(x=>x.id===a.supplierId))throw Error('Supplier wajib untuk penambahan stok durian');
  const base={id:a.id,productId:p.id,storeId:a.storeId,date,note:'Penyesuaian: '+a.reason};
  lots.push(dual?{...base,supplierId:a.supplierId,kg:positive.kg,pieces:positive.pieces,receivedKg:positive.kg,receivedPieces:positive.pieces,isAdjustment:true}:{...base,unit:product.stockUnit,qty:positive.qty,receivedQty:positive.qty,kind:'opening',expiry:'',supplierId:null});
  changes.push({lotId:a.id,...positive});
 }
 s.stockAdjustments.push({id:a.id,productId:p.id,storeId:a.storeId,date,reason:a.reason.trim(),before,after:target,changes});
}
