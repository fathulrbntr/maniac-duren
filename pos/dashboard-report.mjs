// One read-only model for dashboard cards and the A4 sales report.
import {transactions} from './reports.mjs';

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const amount=v=>finite(v)?Number(v):null;
const cost=v=>finite(v)&&Number(v)>=0?Number(v):null;
const sum=rows=>rows.reduce((a,v)=>a+(v??0),0);
const complete=values=>values.every(v=>v!==null)?sum(values):null;
const inRange=(d,f)=>!!d&&d>=f.from&&d<=f.to;
const number=v=>Number(v)||0;
export const financeAccess=s=>!s.access||!!s.access.finance;
export const reportAccess=s=>!s.access||!!s.access.reports;
export const jakartaDay=stamp=>stamp&&Number.isFinite(Date.parse(stamp))?new Date(stamp).toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}):'';
export const reportStamp=stamp=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(stamp))+' WIB';
export function salesChannel(t){
 const o=t.order||t;
 if(['GoFood','GrabFood','ShopeeFood'].includes(t.payment))return 'DELIVERY';
 if(o.table_no)return 'DINE IN';
 if(Object.hasOwn(o,'table_no'))return 'TAKE AWAY';
 return 'Belum terklasifikasi';
}
function addGroup(map,key,name,revenue,qty=0,unit=''){
 const row=map.get(key)||{name,revenue:0,count:0,units:new Map()};
 row.revenue+=revenue;row.count++;
 if(unit)row.units.set(unit,(row.units.get(unit)||0)+qty);
 map.set(key,row);return row;
}
function lineCost(s,t,line){
 if(t.kind==='sale'){
  const lot=s.lots.find(l=>l.id===line.lotId),unitCost=cost(lot?.unitCost),kg=cost(line.kg);
  return unitCost===null||kg===null?null:unitCost*kg;
 }
 // Never value historical consumption at today's master price.
 if(!line.lineId)return null;
 const used=(t.order.consumption||[]).filter(c=>c.lineId===line.lineId);
 if(!used.length)return null;
 return complete(used.map(c=>cost(c.qty)===null||cost(c.unitCost)===null?null:Number(c.qty)*Number(c.unitCost)));
}
export function inventoryAssets(s,store=''){
 const allowed=new Set(s.stores.map(x=>x.id)),catalog=new Map(s.products.map(p=>[p.id,p]));
 const groups=new Map(),rows=[],seen=new Set();let unknown=0;
 for(const [kind,lots] of [['fruit',s.lots||[]],['unit',s.unitLots||[]]])for(const l of lots){
  if(!allowed.has(l.storeId)||(store&&l.storeId!==store))continue;
  const key=kind+':'+l.id;if(seen.has(key))continue;seen.add(key);
  const p=catalog.get(l.productId);if(p?.itemType==='recipe')continue;
  const qty=cost(kind==='fruit'?l.kg:l.qty);if(qty===0)continue;
  const unit=kind==='fruit'?'kg':l.unit;
  const compatible=kind==='fruit'||(!!unit&&(!p?.stockUnit||p.stockUnit===unit));
  const unitCost=cost(l.unitCost),value=qty===null||unitCost===null||!compatible?null:qty*unitCost;
  if(value===null)unknown++;
  const group=l.quality==='reject'?'Reject menunggu pengolahan':kind==='fruit'?'Buah utuh':p?.itemType==='raw'?'Bahan baku':p?.itemType==='prep'?'Bahan produksi':'Produk olahan / langsung';
  const r={lotId:l.id,productId:l.productId,storeId:l.storeId,name:p?.name||'Produk belum terpetakan',group,qty,unit:unit||'?',unitCost,value};rows.push(r);
  const g=groups.get(group)||{name:group,value:0,unknown:0,lots:0};g.value+=value??0;g.unknown+=value===null?1:0;g.lots++;groups.set(group,g);
 }
 return {rows,groups:[...groups.values()],known:sum(rows.map(r=>r.value)),total:unknown?null:sum(rows.map(r=>r.value)),unknown};
}
export function dashboardReport(s,f,{asOf=new Date().toISOString(),cash=null}={}){
 if(!reportAccess(s)&&!financeAccess(s))throw Error('Akses laporan diperlukan.');
 const allowed=new Set(s.stores.map(x=>x.id)),scope=id=>allowed.has(id)&&(!f.store||id===f.store);
 const source={...s,orders:(s.orders||[]).filter(o=>scope(o.store_id)),sales:(s.sales||[]).filter(o=>scope(o.storeId))};
 const tx=transactions(source).filter(t=>inRange(t.date,f));
 const catalog=new Map(s.products.map(p=>[p.id,p])),categories=new Map(),products=new Map(),channels=new Map(),payments=new Map(),discounts=new Map();
 let points=0,pointsUnknown=0,unallocated=0;
 for(const t of tx){
  const o=t.order||t,channel=salesChannel(t);
  addGroup(channels,channel,channel,t.total);
  addGroup(payments,t.payment||'Belum tercatat',t.payment||'Belum tercatat',t.total);
  if(!t.lines.length)unallocated++;
  for(const l of t.lines){
   const p=catalog.get(l.productId),category=p?.category||'Belum berkategori',unit=l.unit==='KG'?'kg':l.unit==='BUTIR'?'butir':l.unit||'?';
   addGroup(categories,category,category,l.revenue,number(l.qty),unit);
   addGroup(products,l.productId,l.name,l.revenue,number(l.qty),unit);
  }
  const gross=o.subtotal??sum(t.lines.map(l=>number(l.total)));
  const discount=amount(o.discount?.amount)??Math.max(0,gross-t.total);
  if(discount>0){const key=[channel,o.discount?.discountId||'',o.discount?.name||'Diskon transaksi'].join('|'),d=addGroup(discounts,key,o.discount?.name||'Diskon transaksi',discount);d.channel=channel;d.code=o.discount?.discountId||'—';}
  if(finite(o.pointsEarned))points+=Number(o.pointsEarned);else pointsUnknown++;
 }
 const events=new Map((s.events||[]).map(x=>[x.id,x]));
 const cancelEvents=new Map();for(const ev of s.events||[])if(['order_void','order_cancel','void'].includes(ev.action))cancelEvents.set(ev.payload?.orderId||ev.payload?.saleId,ev);
 const cancellations=[],cancelSeen=new Set();let cancelUnknown=0;
 for(const o of source.orders){
  if(o.status!=='cancelled'&&o.payment_status!=='refunded')continue;
  const event=cancelEvents.get(o.id),date=o.void_meta?.date||event?.business_date;
  if(!date){cancelUnknown++;continue;}if(!inRange(date,f))continue;
  cancelSeen.add(o.id);cancellations.push({id:o.id,date,channel:salesChannel({order:o,payment:o.payment}),amount:number(o.total),refunded:o.payment_status==='refunded',payment:o.payment,reason:o.void_meta?.reason||o.cancel_reason||''});
 }
 for(const t of source.sales){
  if(!t.voided||cancelSeen.has(t.id)||source.orders.some(o=>o.id===t.id))continue;
  const date=t.voidDate||cancelEvents.get(t.id)?.business_date;
  if(!date){cancelUnknown++;continue;}if(!inRange(date,f))continue;
  cancellations.push({id:t.id,date,channel:salesChannel(t),amount:number(t.total),refunded:true,payment:t.payment,reason:t.voidReason||''});
 }
 const sort=map=>[...map.values()].sort((a,b)=>b.revenue-a.revenue||a.name.localeCompare(b.name));
 const total=sum(tx.map(t=>t.total));
 const report={f:{...f},asOf,demo:!!s.stockDemo,storeName:f.store?s.stores.find(st=>st.id===f.store)?.name||'Toko tidak tersedia':'Semua toko yang dapat diakses',tx,total,categories:sort(categories),products:sort(products),channels:sort(channels),payments:sort(payments),discounts:sort(discounts),points,pointsUnknown,cancellations,cancelUnknown,unallocated,cash,financial:null};
 if(financeAccess(s)){
  const costs=tx.flatMap(t=>t.lines.length?t.lines.map(l=>lineCost(s,t,l)):[null]);
  const lossRows=(s.money||[]).filter(x=>x.category==='loss'&&scope(x.store_id));
  const undatedLoss=lossRows.filter(x=>!events.get(x.event_id)?.business_date).length;
  const losses=lossRows.filter(x=>inRange(events.get(x.event_id)?.business_date,f));
  const expenses=(s.expenses||[]).filter(x=>!x.voided&&scope(x.store_id)&&inRange(x.date,f));
  const cogs=complete(costs),loss=undatedLoss?null:complete(losses.map(x=>amount(x.cost))),operating=complete(expenses.map(x=>cost(x.amount)));
  const gross=cogs===null?null:total-cogs,result=[cogs,loss,operating].some(x=>x===null)?null:total-cogs-loss-operating;
  report.financial={cogs,knownCogs:sum(costs),unknownCogs:costs.filter(x=>x===null).length,loss,knownLoss:sum(losses.map(x=>amount(x.cost))),unknownLoss:undatedLoss+losses.filter(x=>!finite(x.cost)).length,losses,operating,expenses,gross,result,assets:inventoryAssets(s,f.store)};
 }
 return report;
}

// The shift RPC returns 20 rows plus one lookahead. Load every page before
// presenting totals; a failure must never masquerade as a zero cash difference.
export async function loadReportCash(readShifts,f){
 if(!readShifts)return null;
 const entries=new Map(),history=new Map();let offset=0,historyOffset=0,moreEntries=true,moreHistory=true,fetchedAt;
 for(let page=0;page<500&&(moreEntries||moreHistory);page++){
  const data=await readShifts({storeId:f.store||null,from:f.from,to:f.to,offset,historyOffset});
  if(!Array.isArray(data?.entries)||!Array.isArray(data?.history))throw Error('Data riwayat kas belum lengkap.');
  fetchedAt=data.fetchedAt;
  if(moreEntries){for(const x of (data.entries||[]).slice(0,20))entries.set(x.id,x);moreEntries=(data.entries||[]).length>20;if(moreEntries)offset+=20;}
  if(moreHistory){for(const x of (data.history||[]).slice(0,20))history.set(x.id,x);moreHistory=(data.history||[]).length>20;if(moreHistory)historyOffset+=20;}
 }
 if(moreEntries||moreHistory)throw Error('Riwayat kas terlalu panjang. Pilih periode yang lebih pendek.');
 return {entries:[...entries.values()],history:[...history.values()],fetchedAt};
}
export function cashReport(cash,s,f){
 if(!cash)return null;
 const allowed=new Set(s.stores.map(x=>x.id)),scope=x=>allowed.has(x.storeId)&&(!f.store||x.storeId===f.store);
 const entries=cash.entries.filter(x=>scope(x)&&inRange(jakartaDay(x.createdAt),f)),history=cash.history.filter(x=>scope(x)&&inRange(jakartaDay(x.closedAt),f));
 const sales=entries.filter(x=>x.kind==='sale'&&x.payment==='Tunai'),refunds=entries.filter(x=>x.kind==='refund'&&x.payment==='Tunai');
 const sold=complete(sales.map(x=>cost(x.amount))),returned=complete(refunds.map(x=>cost(x.amount)));
 return {sales:sold,refunds:returned,net:sold===null||returned===null?null:sold-returned,difference:complete(history.map(x=>amount(x.summary?.difference))),closed:history.length,fetchedAt:cash.fetchedAt};
}
