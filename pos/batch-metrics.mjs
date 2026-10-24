// Physical ratios never use the cost-allocation "equivalent kg" quantities.
const finite=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const nonnegative=v=>{const n=finite(v);return n==null||n< -1e-8?null:Math.max(0,n);};
const sum=values=>values.every(v=>nonnegative(v)!=null)?values.reduce((n,v)=>n+nonnegative(v),0):null;
export const percentOf=(value,base)=>{const n=nonnegative(value),d=nonnegative(base);if(n==null||!(d>0))return null;const ratio=n/d*100;return Number.isFinite(ratio)?Number(ratio.toFixed(6)):null;};
export const formatPercent=value=>value==null?'Belum diketahui':new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+'%';
export function batchMetrics(report){
 const baseKg=nonnegative(report.root.receivedKg),processed=nonnegative(report.processedKg),skin=nonnegative(report.firstLossKg);
 const output=processed==null||skin==null?null:nonnegative(processed-skin);
 const rows=[
  {key:'whole_stock',label:'Buah utuh tersisa',kg:sum([report.readyKg,report.rejectKg,report.otherFruitKg]),hint:'Termasuk buah reject yang belum diolah.'},
  {key:'whole_sold',label:'Buah terjual utuh',kg:nonnegative(report.soldKg),hint:'Berat aktual buah yang terjual.'},
  {key:'processed',label:'Buah masuk pengolahan',kg:processed,hint:'Berat buah utuh yang dipakai untuk olahan.'},
  {key:'output',label:'Hasil olahan tahap buah',kg:output,hint:'Berat hasil saat buah pertama kali diolah.'},
  {key:'skin',label:'Kulit & sisa proses buah',kg:skin,hint:'Selisih berat input dan hasil; bukan pengukuran kulit terpisah.'},
  {key:'reject',label:'Reject total ditandai',kg:nonnegative(report.markedKg),hint:'Penandaan aktif, termasuk yang sudah diolah.'},
 ].map(row=>({...row,percent:percentOf(row.kg,baseKg)}));
 return {baseKg,rows,outputKg:output,processedKg:processed,skinKg:skin,yieldPercent:percentOf(output,processed),skinPercent:percentOf(skin,processed),coralKg:nonnegative(report.coralKg),fleshKg:nonnegative(report.fleshKg),seedKg:nonnegative(report.secondLossKg),fleshPercent:percentOf(report.fleshKg,report.coralKg),seedPercent:percentOf(report.secondLossKg,report.coralKg)};
}
// Whole-product unit cost includes all its ingredients. The batch portion is a
// different number and must not be presented as the cost of a mixed product.
export function batchStockCosts(report,stock){
 const lot=stock.lot,unit=lot.kg!==undefined?'kg':lot.unit,unitCost=nonnegative(lot.unitCost);
 const rootCost=nonnegative(report.root.unitCost),equivalent=nonnegative(stock.equivalent);
 return {unit,unitCost,batchCost:rootCost==null||equivalent==null?null:rootCost*equivalent};
}
