import {today} from './core.mjs?v=10';
export const isOwner=s=>s.me?.role==='owner';
export const tableLabel=value=>value?'Meja '+value:'Tanpa meja / takeaway';
export const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const positive=v=>{const n=Number(v);if(!Number.isFinite(n)||n<=0)throw Error('Jumlah / harga harus lebih dari 0');return n;};
export function cashierQuote(s,p){
 if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>100)throw Error('Isi pesanan, maksimal 100 baris');
 const tableNo=p.tableNo==null||p.tableNo===''?null:Number(p.tableNo);
 if(tableNo!==null&&(!Number.isInteger(tableNo)||tableNo<1||tableNo>50))throw Error('Nomor meja tidak valid');
 const note=String(p.note||'');if(note.length>300)throw Error('Catatan maksimal 300 karakter');
 const lines=p.lines.map(l=>{
  const product=s.products.find(x=>x.id===l.productId);if(!product||['raw','prep'].includes(product.itemType))throw Error('Produk tidak dapat dijual');
  let out,price;
  if(product.stockUnit==='kg_butir'){
   if(!['KG','BUTIR'].includes(l.unit))throw Error('Cara jual buah tidak valid');
   const kg=positive(l.kg),pieces=positive(l.pieces);if(!Number.isInteger(pieces))throw Error('Jumlah butir harus bulat');
   price=Number(l.unit==='KG'?product.priceKg:product.pricePiece);out={productId:product.id,lotId:l.lotId,unit:l.unit,qty:l.unit==='KG'?kg:pieces,kg,pieces,price};
  }else{
   const qty=positive(l.qty);if(['pcs','porsi'].includes(product.stockUnit)&&!Number.isInteger(qty))throw Error('Jumlah harus bulat');
   price=Number(product.salePrice);out={productId:product.id,qty,price,recipeVersion:product.itemType==='recipe'?(s.recipes.find(r=>r.outputId===product.id)?.version??null):null};
  }
  if(!Number.isFinite(price)||price<=0||Number(l.price)!==price)throw Error('Harga mengikuti master. Gunakan diskon dengan persetujuan owner');
  return out;
 });
 return {storeId:p.storeId,date:p.date||today(),tableNo,note,lines,subtotal:lines.reduce((n,l)=>n+l.qty*l.price,0)};
}
export function discountAmount(discount,subtotal){
 const v=Number(discount?.value);if(!discount?.active||!['percent','amount'].includes(discount.kind)||!Number.isFinite(v)||v<=0||(discount.kind==='percent'&&v>100))throw Error('Diskon berubah atau tidak aktif');
 return Math.min(subtotal,discount.kind==='percent'?subtotal*v/100:v);
}
export const sameQuote=(a,b)=>stable(a)===stable(b);
export function findDiscountApproval(s,quote,discountId){
 return (s.cashierApprovals||[]).filter(a=>a.kind==='discount'&&a.requested_by===s.me?.id&&a.details.discountId===discountId&&sameQuote(a.details.quote,quote)&&new Date(a.expires_at)>new Date()&&a.status!=='used').sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
}
export function checkoutTotals(s,p){
 const quote=cashierQuote(s,p);let discount=null,amount=0;
 if(p.discountApprovalId){
  const a=(s.cashierApprovals||[]).find(a=>a.id===p.discountApprovalId);
  if(!a||a.kind!=='discount'||a.status!=='approved'||a.requested_by!==s.me?.id||new Date(a.expires_at)<=new Date()||!sameQuote(a.details.quote,quote))throw Error('Diskon belum disetujui owner, kedaluwarsa, atau pesanan berubah');
  const d=(s.discounts||[]).find(d=>d.id===a.details.discountId&&d.version===a.details.version);amount=discountAmount(d,quote.subtotal);
  discount={...a.details,approvalId:a.id,approvedBy:a.decided_by,approvedName:a.decided_name};delete discount.quote;
 }else if(p.discountId||Number(p.discountAmount))throw Error('Diskon perlu persetujuan owner');
 return {quote,subtotal:quote.subtotal,discount,discountAmount:amount,total:quote.subtotal-amount};
}
export function validPayment(p,total){
 const paid=Number(p.paid);if(!['Tunai','QRIS','Transfer'].includes(p.payment)||!Number.isFinite(paid)||paid<total)throw Error('Pembayaran belum sesuai total');
 if(p.payment!=='Tunai'&&paid!==total)throw Error('Pembayaran non-tunai harus sesuai total');return paid;
}
