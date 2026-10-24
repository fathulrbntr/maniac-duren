import {sumProducts} from './decimal-totals.mjs?v=66';
import {id,today} from './core.mjs?v=77';
export const cashierName=o=>o?.cashierName||'Tidak tercatat';
export const activeShift=(s,store)=> (s.cashierShifts||[]).find(x=>!x.closedAt&&x.cashierId===s.me?.id&&(!store||x.storeId===store));
export function requireShift(s,store){
 if(!(s.cashierShiftVersion>=83))throw Error('Pasang database/cashier-shifts-083.sql lalu muat ulang POS.');
 const shift=activeShift(s,store);if(!shift)throw Error('Buka kasir di outlet ini sebelum menerima pembayaran atau refund.');return shift;
}
export function shiftSummary(s,sh){
 if(sh.closedAt&&sh.summary)return sh.summary;
 const entries=(s.cashierShiftEntries||[]).filter(x=>x.shiftId===sh.id),sum=(kind,payment)=>sumProducts(entries.filter(x=>x.kind===kind&&(!payment||x.payment===payment)).map(x=>[x.amount]));
 return {salesCount:entries.filter(x=>x.kind==='sale').length,refundCount:entries.filter(x=>x.kind==='refund').length,sales:sum('sale'),refunds:sum('refund'),cashSales:sum('sale','Tunai'),cashRefunds:sum('refund','Tunai'),qrisSales:sum('sale','QRIS'),qrisRefunds:sum('refund','QRIS'),transferSales:sum('sale','Transfer'),transferRefunds:sum('refund','Transfer'),expectedCash:sumProducts([[sh.openingCash],[sum('sale','Tunai')],[-1,sum('refund','Tunai')]])};
}
const manager=s=>s.me?.role==='owner'||!!(s.access?.reports||s.access?.finance);
const visible=(s,sh)=>sh.cashierId===s.me?.id||manager(s);
const cash=(v,label)=>{const n=Number(v);if(v==null||String(v).trim()===''||!Number.isFinite(n)||n<0||n>9e15)throw Error(label+' tidak valid');return n;};
export function mutateShiftDemo(s,action,p){
 s.cashierShifts||=[];s.cashierShiftEvents||=[];s.cashierShiftEntries||=[];
 const note=String(p.note||'').trim();if(note.length>300)throw Error('Catatan maksimal 300 karakter');
 if(action==='cashier_shift_open'){
  if(s.access&&!s.access.sell)throw Error('Hak akses kasir diperlukan');
  if(!s.me?.id||!s.stores.some(x=>x.id===p.storeId))throw Error('Pilih outlet');
  if(activeShift(s))throw Error('Masih ada shift terbuka. Tutup shift sebelumnya terlebih dahulu');
  s.cashierShifts.push({id:p.id,storeId:p.storeId,cashierId:s.me.id,cashierName:s.me.name,openedAt:new Date().toISOString(),openingCash:cash(p.openingCash,'Uang awal'),openingNote:note,closedAt:null,revision:0});
 }else{
  const sh=s.cashierShifts.find(x=>x.id===p.shiftId);
  if(!sh||!visible(s,sh))throw Error('Shift tidak dapat diakses');
  if(sh.cashierId!==s.me.id&&!s.access?.finance&&s.me.role!=='owner')throw Error('Hanya pemilik shift atau pengelola keuangan yang dapat menutup');
  if(sh.closedAt)throw Error('Shift sudah ditutup');
  if(sh.revision!==p.expectedRevision)throw Error('Transaksi berubah. Perbarui perhitungan sebelum tutup kasir');
  const amount=cash(p.closingCash,'Uang tunai aktual'),summary=shiftSummary(s,sh),difference=sumProducts([[amount],[-1,summary.expectedCash]]);
  if((difference!==0||sh.cashierId!==s.me.id)&&note.length<3)throw Error('Catatan wajib untuk selisih kas atau menutup shift kasir lain');
  Object.assign(sh,{closedAt:new Date().toISOString(),closingCash:amount,closingNote:note,closedBy:s.me.id,closedName:s.me.name,closingEventId:p.id,summary:{...summary,difference}});
 }
 s.cashierShiftEvents.push({id:p.id,action,shiftId:action==='cashier_shift_open'?p.id:p.shiftId});
}
export function recordShiftDemo(s,source,action,p){
 if(!['order_create','order_pay','order_void','order_cancel'].includes(action))return;
 const order=s.orders.find(x=>x.id===(p.orderId||p.id));if(!order)return;
 const before=source.orders.find(x=>x.id===order.id),sale=order.payment_status==='paid'&&before?.payment_status!=='paid',refund=order.payment_status==='refunded'&&before?.payment_status==='paid';
 if(!sale&&!refund)return;
 const sh=requireShift(s,order.store_id);
 if(sale)Object.assign(order,{cashierId:s.me.id,cashierName:s.me.name,cashierShiftId:sh.id});
 s.cashierShiftEntries||=[];
 s.cashierShiftEntries.push({id:id(),shiftId:sh.id,storeId:sh.storeId,sourceKind:'order',sourceId:order.id,kind:refund?'refund':'sale',payment:refund?before.payment:order.payment,amount:refund?before.total:order.total,cashierId:s.me.id,cashierName:s.me.name,createdAt:new Date().toISOString()});
 sh.revision++;sh.summary=shiftSummary(s,sh);
}
export function readShiftsDemo(s,f={}){
 const all=(s.cashierShifts||[]).filter(sh=>visible(s,sh)),target=all.find(x=>x.id===f.shiftId);
 if(f.shiftId&&!target)throw Error('Shift tidak dapat diakses');
 const day=v=>new Date(v).toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}),dateOK=v=>day(v)>=(f.from||today())&&day(v)<=(f.to||today());
 const match=x=>(!f.storeId||x.storeId===f.storeId)&&(!f.cashierId||x.cashierId===f.cashierId);
 const serialize=x=>({...x,summary:shiftSummary(s,x)}),offset=Number(f.offset||0),historyOffset=Number(f.historyOffset||0);
 return {active:all.filter(x=>!x.closedAt).map(serialize),history:all.filter(x=>x.closedAt&&match(x)&&dateOK(x.closedAt)).sort((a,b)=>b.closedAt.localeCompare(a.closedAt)||a.id.localeCompare(b.id)).slice(historyOffset,historyOffset+21).map(serialize),entries:(s.cashierShiftEntries||[]).filter(x=>all.some(sh=>sh.id===x.shiftId)&&match(x)&&(f.shiftId?x.shiftId===f.shiftId:dateOK(x.createdAt))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id)).slice(offset,offset+21),shift:target?serialize(target):null,fetchedAt:new Date().toISOString()};
}
