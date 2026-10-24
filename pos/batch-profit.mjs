import {batchStockCosts} from './batch-metrics.mjs?v=87';

const known=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const amount=v=>known(v)&&Number(v)>=0?Number(v):null;
const sum=values=>values.every(known)?values.reduce((n,v)=>n+Number(v),0):null;
const clean=v=>v==null?null:Math.abs(v)<1e-7?0:v;
export const profitState=value=>value==null?'Belum lengkap':value>0?'Untung':value<0?'Rugi':'Impas';

// Project only the stock that exists now. Reject/raw materials require another
// process; no sale price or conversion yield is invented for them.
export function stockProjection(s,r,stock){
 const lot=stock.lot,p=s.products.find(p=>p.id===lot.productId),fruit=lot.kg!==undefined;
 const quantity=amount(lot.kg??lot.qty),{unit,unitCost,batchCost}=batchStockCosts(r,stock);
 let reason='',price=null,revenue=null;
 if(!p)reason='Produk tidak ditemukan.';
 else if(lot.quality==='reject')reason='Reject menunggu pengolahan; belum diestimasi sebagai barang jual.';
 else if(fruit&&lot.quality!=='ready')reason='Buah belum berstatus siap jual.';
 else if(p.active===false)reason='Produk tidak aktif.';
 else if(['raw','prep','recipe'].includes(p.itemType))reason='Bahan perlu pengolahan; harga dan hasil produk akhirnya belum diketahui.';
 else if(!fruit&&p.stockUnit!==unit)reason='Satuan harga master tidak cocok dengan satuan stok.';
 else {
  price=amount(fruit?p.priceKg:p.salePrice);
  if(!(price>0)){price=null;reason=fruit?'Harga jual per kg belum diisi; harga per butir tidak digunakan.':'Harga jual master belum diisi.';}
  else if(quantity==null||unitCost==null||batchCost==null)reason='Modal atau jumlah stok belum lengkap.';
  else if(fruit&&!stock.mixed)revenue=quantity*price;
  else {
   const fullCost=quantity*unitCost,share=fullCost>0?batchCost/fullCost:null;
   if(share==null||share<0||share>1+1e-6)reason='Proporsi modal bahan belum dapat dialokasikan.';
   else revenue=quantity*price*Math.min(1,share);
  }
 }
 return {lot,quantity,unit,price,batchCost,revenue,profit:revenue==null||batchCost==null?null:clean(revenue-batchCost),reason};
}

export function batchProfit(s,r){
 const issues=[];
 if(r.scopeIncomplete)issues.push('Riwayat outlet asal/tujuan belum lengkap.');
 if(!known(r.untraced)||Math.abs(r.untraced)>1e-5)issues.push('Pergerakan stok belum seluruhnya cocok dengan riwayat.');
 if(r.revenueIncomplete)issues.push('Alokasi penjualan olahan belum lengkap.');
 const revenue=r.revenueIncomplete?null:sum([amount(r.fruitRevenue),amount(r.allocatedRevenue)]);
 const cogs=amount(r.cogs),loss=amount(r.lossCost),capital=amount(r.remainingCost);
 if([revenue,cogs,loss,capital].some(v=>v==null))issues.push('Penjualan atau modal batch belum lengkap.');
 const realized=issues.length?null:clean(revenue-cogs-loss);
 const stocks=r.stock.map(stock=>stockProjection(s,r,stock));
 const missingPrices=stocks.filter(row=>row.revenue==null).length;
 const stockRevenue=sum(stocks.map(row=>row.revenue));
 const stockProfit=issues.length||stockRevenue==null||capital==null?null:clean(stockRevenue-capital);
 const projected=realized==null||stockProfit==null?null:clean(realized+stockProfit);
 const rejectCapital=sum(r.stock.filter(x=>x.lot.quality==='reject').map(x=>batchStockCosts(r,x).batchCost));
 return {revenue,cogs,loss,capital,realized,rejectCapital,stockRevenue,stockProfit,projected,stocks,missingPrices,issues,status:profitState(realized)};
}

export function batchProfitTotals(s,reports){
 const values=reports.map(r=>batchProfit(s,r));
 return Object.fromEntries(['realized','loss','capital','projected'].map(key=>[key,sum(values.map(v=>v[key]))]).concat([
  ['incomplete',values.filter(v=>v.realized==null).length],['projectionIncomplete',values.filter(v=>v.projected==null).length]
 ]));
}
