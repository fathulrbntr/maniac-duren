// Read-only dashboard summaries use the same paid transactions as Laporan.
import {today} from './core.mjs?v=60';
import {salesReport,periodRange} from './reports.mjs?v=84';
const number=v=>Number(v)||0;
const dayMs=86400000;
const shift=(day,days)=>new Date(Date.parse(day+'T00:00:00Z')+days*dayMs).toISOString().slice(0,10);
export function validDashboardDates(from,to){
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 return valid(from)&&valid(to)&&from<=to&&to<=today();
}
export function dashboardRange(period,custom={},day=today()){
 if(period==='custom'&&validDashboardDates(custom.from,custom.to))return {from:custom.from,to:custom.to};
 if(period==='yesterday')return {from:shift(day,-1),to:shift(day,-1)};
 if(['week','month'].includes(period))return {...periodRange(period,day),to:day};
 return {from:day,to:day};
}
export function dashboardTabs(s){
 const a=s.access,can=(...keys)=>!a||keys.some(k=>a[k]);
 return [['transactions','Transaksi',can('reports')],['stock','Stock',can('stock','trace','produce')],['suppliers','Supplier',can('reports')],['reject','Reject',can('waste','trace','finance')],['customers','Customer',can('finance')]].filter(x=>x[2]);
}
function timeline(tx,range){
 const hourly=range.from===range.to,days=Math.round((Date.parse(range.to)-Date.parse(range.from))/dayMs)+1,step=Math.max(1,Math.ceil(days/12));
 const bins=hourly?Array.from({length:6},(_,i)=>({label:String(i*4).padStart(2,'0'),detail:`${String(i*4).padStart(2,'0')}:00–${String(i*4+3).padStart(2,'0')}:59 WIB`,total:0,count:0})):Array.from({length:Math.ceil(days/step)},(_,i)=>{
  const from=shift(range.from,i*step),to=shift(range.from,Math.min(days-1,(i+1)*step-1));
  return {from,to,label:from.slice(8)+'/'+from.slice(5,7),detail:from===to?from:from+' – '+to,total:0,count:0};
 });
 const unknown={total:0,count:0};
 for(const t of tx){
  let index;
  if(hourly){
   const stamp=t.order?.paid_at||t.paid_at||t.order?.created_at||t.created_at;
   if(stamp&&Number.isFinite(Date.parse(stamp))){
    const dt=new Date(Date.parse(stamp)+7*3600000);
    if(dt.toISOString().slice(0,10)===t.date)index=Math.floor(dt.getUTCHours()/4);
   }
  }else index=Math.floor((Date.parse(t.date)-Date.parse(range.from))/dayMs/step);
  const bucket=bins[index]||unknown;bucket.total+=t.total;bucket.count++;
 }
 return {bins,unknown,hourly,step};
}
export function dashboardSales(s,f){
 // Restrict even an all-store filter to the outlets returned for this account.
 const allowed=new Set(s.stores.map(x=>x.id));
 const source={...s,orders:(s.orders||[]).filter(x=>allowed.has(x.store_id)),sales:(s.sales||[]).filter(x=>allowed.has(x.storeId))};
 const report=salesReport(source,f),paymentMap=new Map(['Tunai','QRIS','Transfer'].map(name=>[name,{name,total:0,count:0}]));
 const products=new Map(),catalog=new Map(s.products.map(x=>[x.id,x]));
 for(const t of report.tx){
  const name=String(t.payment||'Belum tercatat').trim()||'Belum tercatat',p=paymentMap.get(name)||{name,total:0,count:0};p.total+=t.total;p.count++;paymentMap.set(name,p);
 }
 for(const r of report.products){
  const p=products.get(r.id)||{id:r.id,name:r.name,product:catalog.get(r.id),revenue:0,units:new Map()};
  p.revenue+=r.revenue;p.units.set(r.unit,(p.units.get(r.unit)||0)+r.qty);products.set(r.id,p);
 }
 const suppliers=new Map();
 for(const r of report.suppliers){const key=r.supplierId||'',row=suppliers.get(key)||{id:key,name:r.name,revenue:0,methods:new Set()};row.revenue+=r.revenue;row.methods.add(r.method);suppliers.set(key,row);}
 return {...report,payments:[...paymentMap.values()],topProducts:[...products.values()].sort((a,b)=>b.revenue-a.revenue||a.name.localeCompare(b.name)).slice(0,5),supplierRows:[...suppliers.values()].sort((a,b)=>b.revenue-a.revenue),timeline:timeline(report.tx,f)};
}
export function dashboardStock(s,store){
 const allowed=new Set(s.stores.map(x=>x.id)),rows=new Map(s.products.filter(p=>p.itemType!=='recipe').map(p=>[p.id,{id:p.id,name:p.name,product:p,qty:0,pieces:0,reject:0,unit:p.stockUnit==='kg_butir'?'kg':p.stockUnit||'pcs'}]));
 for(const l of [...s.lots,...s.unitLots]){
  if(!allowed.has(l.storeId)||(store&&l.storeId!==store))continue;
  const row=rows.get(l.productId);if(!row)continue;row.qty+=number(l.kg??l.qty);row.pieces+=number(l.pieces);if(l.quality==='reject')row.reject+=number(l.kg);
 }
 const values=[...rows.values()],units=new Map();for(const r of values)units.set(r.unit,(units.get(r.unit)||0)+r.qty);
 return {rows:values.sort((a,b)=>(a.qty>0)-(b.qty>0)||a.name.localeCompare(b.name)),available:values.filter(r=>r.qty>0).length,empty:values.filter(r=>r.qty<=0).length,units};
}
export function dashboardRejects(s,f){
 const allowed=new Set(s.stores.map(x=>x.id)),seen=new Set((s.rejectRecords||[]).map(r=>r.id));
 const rows=[...(s.rejectRecords||[]),...(s.wasteRuns||[]).filter(r=>!seen.has(r.id)).map(r=>({...r,kind:'legacy'}))].filter(r=>!r.voided&&allowed.has(r.storeId)&&(!f.store||r.storeId===f.store)&&r.date>=f.from&&r.date<=f.to).sort((a,b)=>b.date.localeCompare(a.date));
 return {rows,markedKg:rows.filter(r=>['mark','direct'].includes(r.kind)).reduce((a,r)=>a+number(r.markedKg??r.kg),0),processedKg:rows.filter(r=>['direct','process','legacy'].includes(r.kind)).reduce((a,r)=>a+number(r.kg),0)};
}
export function dashboardCustomers(s,tx){
 const paid=new Map(tx.map(t=>[t.kind+':'+t.id,t])),matched=new Set(),customers=new Map();
 for(const d of s.documents||[]){
  if(d.kind!=='INV'||d.status!=='issued')continue;
  const key=d.source_type+':'+d.source_id,t=paid.get(key),name=String(d.party||d.body?.party||'').trim();
  if(!t||d.store_id!==t.storeId||!name||matched.has(key))continue;matched.add(key);
  const identity=name.toLocaleLowerCase('id-ID'),row=customers.get(identity)||{name,count:0,total:0};row.count++;row.total+=t.total;customers.set(identity,row);
 }
 return {rows:[...customers.values()].sort((a,b)=>b.total-a.total),matched:matched.size,anonymous:tx.length-matched.size};
}
