import {id,today} from './core.mjs?v=10';
import {isOwner,cashierQuote,discountAmount,checkoutTotals,validPayment} from './cashier.mjs?v=66';
const owner=s=>{if(!isOwner(s))throw Error('Persetujuan / pengaturan diskon hanya untuk owner');};
export const cashierActions=new Set(['discount_save','cashier_approval_request','cashier_approval_decide','order_void']);
export function cashierDemo(s,action,p,createOrder){
 const me=s.me,now=new Date().toISOString();s.cashierApprovals||=[];s.discounts||=[];
 if(action==='discount_save'){
  owner(s);const old=s.discounts.find(d=>d.id===p.discountId);if((old?.version||0)!==p.expectedVersion)throw Error('Diskon berubah. Perbarui data');
  if(!p.name?.trim()||p.name.trim().length>80)throw Error('Nama diskon wajib, maksimal 80 karakter');
  discountAmount({...p,active:true},1000);
  const d={id:p.discountId,name:p.name.trim(),kind:p.kind,value:Number(p.value),active:!!p.active,version:(old?.version||0)+1};
  if(old)Object.assign(old,d);else s.discounts.push(d);
 }else if(action==='cashier_approval_request'){
  if(s.access&&!s.access.sell)throw Error('Hak akses sell diperlukan');if(!s.stores.some(x=>x.id===p.storeId))throw Error('Outlet tidak tersedia');
  let details;
  if(p.kind==='discount'){
   const quote=cashierQuote(s,p.checkout),d=s.discounts.find(d=>d.id===p.discountId&&d.version===p.expectedVersion);
   if(quote.storeId!==p.storeId||quote.date!==p.date)throw Error('Outlet atau tanggal pesanan berbeda');
   const amount=discountAmount(d,quote.subtotal);details={quote,discountId:d.id,version:d.version,name:d.name,kind:d.kind,value:d.value,amount};
  }else if(p.kind==='void'){
   const o=s.orders.find(o=>o.id===p.orderId&&o.store_id===p.storeId);if(!o||o.status==='cancelled')throw Error('Pesanan tidak ditemukan atau sudah void');
   if(String(p.reason||'').trim().length<3||p.reason.length>300)throw Error('Alasan void wajib, 3–300 karakter');
   details={orderId:o.id,total:o.total,reason:p.reason.trim(),returnStock:!!p.returnStock};
  }else throw Error('Jenis persetujuan tidak valid');
  s.cashierApprovals.push({id:p.id,store_id:p.storeId,kind:p.kind,requested_by:me.id,requested_name:me.name,created_at:now,expires_at:new Date(Date.now()+30*60000).toISOString(),status:isOwner(s)?'approved':'pending',details,decided_by:isOwner(s)?me.id:null,decided_name:isOwner(s)?me.name:null});
 }else if(action==='cashier_approval_decide'){
  owner(s);const a=s.cashierApprovals.find(a=>a.id===p.approvalId);
  if(!a||a.status!=='pending'||new Date(a.expires_at)<=new Date())throw Error('Permintaan sudah diproses atau kedaluwarsa');
  if(!['approved','rejected'].includes(p.decision))throw Error('Keputusan tidak valid');
  if(a.kind==='discount'&&p.decision==='approved'&&!s.discounts.some(d=>d.id===a.details.discountId&&d.active&&d.version===a.details.version))throw Error('Diskon sudah berubah');
  Object.assign(a,{status:p.decision,decided_by:me.id,decided_name:me.name,decided_at:now,decision_note:p.note||''});
 }else if(action==='order_create'){
  const t=checkoutTotals(s,p),paid=validPayment(p,t.total);createOrder(s,{...p,paid:t.subtotal});const o=s.orders.at(-1);
  Object.assign(o,{table_no:t.quote.tableNo,subtotal:t.subtotal,discount:t.discount,total:t.total,paid});
  if(p.discountApprovalId)Object.assign(s.cashierApprovals.find(a=>a.id===p.discountApprovalId),{status:'used',used_by:p.id,used_at:now});
 }else if(['order_void','order_cancel'].includes(action)){
  if(s.access&&!s.access.sell)throw Error('Hak akses sell diperlukan');
  const o=s.orders.find(o=>o.id===p.orderId&&o.store_id===p.storeId),a=s.cashierApprovals.find(a=>a.id===p.approvalId);
  if(!o||o.status==='cancelled')throw Error('Pesanan tidak ditemukan atau sudah void');
  if(!a||a.kind!=='void'||a.status!=='approved'||new Date(a.expires_at)<=new Date()||a.requested_by!==me.id||a.store_id!==p.storeId||a.details.orderId!==o.id||a.details.total!==o.total)throw Error('Void membutuhkan persetujuan owner untuk pesanan ini');
  if(p.date<o.business_date||p.date>today())throw Error('Tanggal tidak valid');
  if(o.payment_status==='paid'&&!p.refundConfirmed)throw Error('Konfirmasi pengembalian pembayaran terlebih dahulu');
  const returned=[];
  if(a.details.returnStock)for(const c of o.consumption){
   const line=o.lines.find(l=>l.lineId===c.lineId);if(!line||line.itemType==='recipe')continue;
   const fruit=line.itemType==='fruit',lot=(fruit?s.lots:s.unitLots).find(l=>l.id===c.lotId&&l.storeId===p.storeId&&l.productId===c.productId);
   if(!lot||(fruit?lot.quality!=='ready':lot.expiry&&lot.expiry<p.date))throw Error('Stok asal tidak layak dikembalikan');
   if(fruit){lot.kg+=c.qty;lot.pieces+=c.pieces;}else lot.qty+=c.qty;
   returned.push(c);s.journal.push({id:id(),event_id:p.id,lot_id:lot.id,product_id:lot.productId,store_id:p.storeId,supplier_id:lot.supplierId,qty:c.qty,pieces:c.pieces||0,unit:fruit?'kg':lot.unit});
  }
  Object.assign(o,{status:'cancelled',payment_status:o.payment_status==='paid'?'refunded':o.payment_status,cancel_reason:a.details.reason,reserved:{},void_meta:{eventId:p.id,date:p.date,by:me.id,byName:me.name,approvedBy:a.decided_by,approvedName:a.decided_name,reason:a.details.reason,returnStock:a.details.returnStock,returned}});
  Object.assign(a,{status:'used',used_by:p.id,used_at:now});
 }
}
