// One read-only reporting model shared by screen, Excel and PDF.
import {batchReports} from './batch-report.mjs?v=63';
import {sources,orderMargins} from './finance.mjs?v=54';
export const label=(s,key,id)=>s[key]?.find(x=>x.id===id)?.name||'Belum terpetakan';
export const isPaid=o=>o.status!=='cancelled'&&(o.payment_status==='paid'||(!o.payment_status&&o.status==='paid'));
const n=v=>Number(v)||0;
const within=(d,f)=>!!d&&d>=f.from&&d<=f.to;
const scope=(st,f)=>!f.store||st===f.store;
export function periodRange(period,date){
 const d=new Date(date+'T12:00:00Z');let from=date,to=date;
 if(period==='week'){d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);to=d.toISOString().slice(0,10);}
 if(period==='month'){from=date.slice(0,8)+'01';d.setUTCMonth(d.getUTCMonth()+1,0);to=d.toISOString().slice(0,10);}
 return {from,to};
}
export function transactions(s){
 const rows=(s.orders||[]).filter(isPaid).map(o=>({id:o.id,date:o.paid_date||o.business_date,storeId:o.store_id,total:n(o.total),payment:o.payment,kind:'order',order:o,lines:o.lines.map(l=>({...l,name:l.name||label(s,'products',l.productId),total:n(l.qty)*n(l.price)}))}));
 const seen=new Set(rows.map(x=>x.id));
 for(const sale of s.sales||[])if(!sale.voided&&!seen.has(sale.id)){
  seen.add(sale.id);rows.push({...sale,kind:'sale',lines:sale.lines.map(l=>({...l,name:label(s,'products',l.productId),qty:l.unit==='KG'?n(l.kg):n(l.pieces),unit:l.unit==='KG'?'kg':'butir'}))});
 }
 for(const t of rows){
  const gross=t.lines.reduce((a,l)=>a+n(l.total),0);let allocated=0;
  t.lines=t.lines.map((l,i)=>{const revenue=i===t.lines.length-1?t.total-allocated:gross?Math.round(t.total*n(l.total)/gross*100)/100:0;allocated+=revenue;return {...l,revenue};});
 }
 return rows;
}
export function salesReport(s,f){
 const tx=transactions(s).filter(t=>scope(t.storeId,f)&&within(t.date,f)),products=new Map(),stores=new Map(),days=new Map(),suppliers=new Map();
 const supplier=(key,amount,method)=>{const k=(key||'unknown')+'|'+method;const r=suppliers.get(k)||{supplierId:key,name:key?label(s,'suppliers',key):'Belum terpetakan',method,revenue:0};r.revenue+=amount;suppliers.set(k,r);};
 for(const t of tx){
  const st=stores.get(t.storeId)||{id:t.storeId,name:label(s,'stores',t.storeId),total:0,count:0};st.total+=t.total;st.count++;stores.set(t.storeId,st);
  const day=days.get(t.date)||{date:t.date,total:0,count:0};day.total+=t.total;day.count++;days.set(t.date,day);
  for(const l of t.lines){
   const unit=l.unit==='KG'?'kg':l.unit==='BUTIR'?'butir':l.unit;
   const key=l.productId+'|'+unit,r=products.get(key)||{id:l.productId,name:l.name,unit,qty:0,kg:0,pieces:0,revenue:0};r.qty+=n(l.qty);r.kg+=n(l.kg);r.pieces+=n(l.pieces);if(l.quality==='reject')r.rejectCurrent+=n(l.kg);r.revenue+=l.revenue;products.set(key,r);
   const lot=s.lots?.find(x=>x.id===l.lotId);
   if(t.kind==='sale'||l.itemType==='fruit'){supplier(l.supplierId||lot?.supplierId,l.revenue,'Langsung');continue;}
   const consumption=(t.order?.consumption||[]).filter(c=>c.lineId===l.lineId);
   const origins=consumption.flatMap(c=>sources(s,c.lotId,n(c.qty)));
   if(!consumption.length||!origins.length){supplier(null,l.revenue,'Belum terpetakan');continue;}
   const ids=new Set(origins.map(x=>x.supplierId));
   if(l.itemType!=='recipe'&&ids.size===1&&origins[0].supplierId){supplier(origins[0].supplierId,l.revenue,'Langsung');continue;}
   const base=origins.reduce((a,x)=>a+n(x.cost),0);
   if(base<=0||origins.some(x=>x.cost==null)){supplier(null,l.revenue,'Belum terpetakan');continue;}
   let part=0;origins.forEach((x,i)=>{const amount=i===origins.length-1?l.revenue-part:Math.round(l.revenue*n(x.cost)/base*100)/100;part+=amount;supplier(x.supplierId,amount,'Alokasi bahan');});
  }
 }
 return {tx,total:tx.reduce((a,t)=>a+t.total,0),products:[...products.values()].sort((a,b)=>b.revenue-a.revenue),stores:[...stores.values()].sort((a,b)=>b.total-a.total),days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),suppliers:[...suppliers.values()].sort((a,b)=>b.revenue-a.revenue)};
}
export function expenseReport(s,f){
 const rows=[];
 for(const l of [...s.lots||[],...s.unitLots||[]]){
  if(l.sourceLotId||!scope(l.storeId,f)||!within(l.date,f)||(l.receivedQty!==undefined&&l.kind!=='purchase'))continue;
  const cost=l.totalCost??(l.unitCost==null?null:n(l.receivedQty??l.receivedKg)*n(l.unitCost));
  rows.push({id:l.id,date:l.date,storeId:l.storeId,category:'Pembelian barang',description:label(s,'products',l.productId),supplier:label(s,'suppliers',l.supplierId),amount:cost,reference:l.note||'',kind:'purchase'});
 }
 for(const x of s.expenses||[])if(!x.voided&&scope(x.store_id,f)&&within(x.date,f))rows.push({...x,storeId:x.store_id,kind:'expense'});
 return {rows:rows.sort((a,b)=>b.date.localeCompare(a.date)),purchases:rows.filter(x=>x.kind==='purchase').reduce((a,x)=>a+n(x.amount),0),operating:rows.filter(x=>x.kind==='expense').reduce((a,x)=>a+n(x.amount),0),unknown:rows.filter(x=>x.amount==null).length,total:rows.reduce((a,x)=>a+n(x.amount),0)};
}
const actionLabels={receipt:'Barang datang',unit_receipt:'Barang datang',movement:'Transfer',unit_transfer:'Transfer',sale:'Terjual',order_create:'Terjual',order_direct:'Terjual',order_start:'Terjual / bahan pesanan',void:'Retur penjualan',order_void:'Retur / waste',reject_mark:'Reject',reject_process:'Olah reject',reject_coral:'Olah Coral',reject_loss:'Waste',inventory_loss:'Waste / susut',produce:'Produksi',production_void:'Batal produksi',reject_void:'Batal reject',waste_process:'Olah reject',recover:'Olah reject'};
export function stockReport(s,f){
 const events=new Map((s.events||[]).map(x=>[x.id,x])),lots=[...s.lots||[],...s.unitLots||[]],groups=new Map(),details=[];
 const row=(productId,storeId,unit)=>{const key=[productId,storeId,unit].join('|');if(!groups.has(key))groups.set(key,{productId,storeId,name:label(s,'products',productId),store:label(s,'stores',storeId),unit,opening:0,incoming:0,sold:0,rejected:0,loss:0,transferIn:0,transferOut:0,other:0,closing:0,current:0,rejectCurrent:0,pieces:0});return groups.get(key);};
 const journal=(s.journal||[]).map(j=>({...j,date:j.date||events.get(j.event_id)?.business_date||'',action:j.action||events.get(j.event_id)?.action||'unknown'}));
 // Older lots might precede the stock journal. Backfill only missing receipt entries.
 for(const l of lots){
  if(!scope(l.storeId,f))continue;
  const unit=l.kg!==undefined?'kg':l.unit;
  const r=row(l.productId,l.storeId,unit);r.current+=n(l.kg??l.qty);r.pieces+=n(l.pieces);if(l.quality==='reject')r.rejectCurrent+=n(l.kg);
  if(!journal.some(j=>j.lot_id===l.id&&j.qty>0)){
   const movement=(s.movements||[]).find(m=>m.id===l.id),date=movement?.date||l.date;
   journal.push({lot_id:l.id,product_id:l.productId,store_id:l.storeId,supplier_id:l.supplierId,qty:n(l.receivedKg??l.receivedQty),pieces:n(l.receivedPieces),unit,date,action:l.sourceLotId?'movement':l.kg!==undefined||l.kind==='purchase'?'receipt':'opening'});
  }
 }
 for(const j of journal){
  if(!scope(j.store_id,f))continue;
  const r=row(j.product_id,j.store_id,j.unit),q=n(j.qty);
  if(j.date>f.to)r.closing-=q;
  if(within(j.date,f)){
   let bucket='other';
   if(['receipt','unit_receipt'].includes(j.action))bucket=q>0?'incoming':'other';
   else if(['movement','unit_transfer'].includes(j.action))bucket=q>0?'transferIn':'transferOut';
   else if(['sale','order_create','order_direct','order_start','void','order_void'].includes(j.action))bucket='sold';
   else if(['inventory_loss','reject_loss'].includes(j.action))bucket='loss';
   // Reject is a quality transfer, not another stock deduction. Negative side is informational.
   if(j.action==='reject_mark'&&q<0)r.rejected-=q;
   r[bucket]+=bucket==='sold'||bucket==='loss'||bucket==='transferOut'?-q:q;
   details.push({...j,product:label(s,'products',j.product_id),store:label(s,'stores',j.store_id),supplier:label(s,'suppliers',j.supplier_id),label:actionLabels[j.action]||j.action});
  }
 }
 for(const r of groups.values()){r.closing+=r.current;const delta=r.incoming-r.sold-r.loss+r.transferIn-r.transferOut+r.other;r.opening=r.closing-delta;}
 return {rows:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)),details:details.sort((a,b)=>b.date.localeCompare(a.date)),incomplete:journal.some(j=>!j.date)||lots.some(l=>!s.journal?.some(j=>j.lot_id===l.id))};
}

export function marginReport(s,f){
 const tx=transactions(s).filter(t=>scope(t.storeId,f)&&within(t.date,f));
 const rows=[];
 for(const t of tx){
  if(t.kind==='order')for(const m of orderMargins(s,[t.order]))rows.push({date:t.date,storeId:t.storeId,name:m.name,revenue:m.revenue,cost:m.cost,recovered:m.recovered});
  else for(const l of t.lines){const lot=s.lots.find(x=>x.id===l.lotId);rows.push({date:t.date,storeId:t.storeId,name:l.name,revenue:l.revenue,cost:lot?.unitCost==null?null:n(l.kg)*n(lot.unitCost),recovered:false});}
 }
 const events=new Map((s.events||[]).map(x=>[x.id,x]));
 const lossRows=(s.money||[]).filter(x=>x.category==='loss'&&scope(x.store_id,f)&&within(events.get(x.event_id)?.business_date,f));
 const unknown=rows.filter(x=>x.cost==null).length+lossRows.filter(x=>x.cost==null).length;
 const revenue=tx.reduce((a,t)=>a+t.total,0),cogs=rows.reduce((a,x)=>a+n(x.cost),0),loss=lossRows.reduce((a,x)=>a+n(x.cost),0),operating=expenseReport(s,f).operating;
 return {rows,unknown,revenue,cogs,loss,operating,result:unknown?null:revenue-cogs-loss-operating};
}

export function reportSheets(s,f){
 const a=salesReport(s,f),x=expenseReport(s,f),st=stockReport(s,f),sheets=[];
 const add=(name,headers,rows)=>sheets.push({name,headers,rows});
 if(!s.access||s.access.reports){
 add('Ringkasan',['Tanggal','Transaksi','Penjualan bersih'],a.days.map(r=>[r.date,r.count,r.total]));
 add('Produk',['Produk','Satuan','Jumlah','Kg aktual','Butir aktual','Penjualan bersih'],a.products.map(r=>[r.name,r.unit,r.qty,r.kg,r.pieces,r.revenue]));
 add('Toko',['Toko','Transaksi','Penjualan bersih'],a.stores.map(r=>[r.name,r.count,r.total]));
 add('Supplier',['Supplier','Metode','Penjualan bersih'],a.suppliers.map(r=>[r.name,r.method,r.revenue]));
 add('Transaksi',['Tanggal','ID transaksi','Toko','Pembayaran','Penjualan bersih'],a.tx.map(t=>[t.date,t.id,label(s,'stores',t.storeId),t.payment,t.total]));
 }
 if(!s.access||s.access.trace){
 add('Stok',['Produk','Toko','Satuan','Awal periode*','Barang datang','Terjual/bahan pesanan','Reject ditandai**','Waste','Transfer masuk','Transfer keluar','Produksi/koreksi','Akhir periode*','Stok sekarang','Reject sekarang','Butir sekarang'],st.rows.map(r=>[r.name,r.store,r.unit,r.opening,r.incoming,r.sold,r.rejected,r.loss,r.transferIn,r.transferOut,r.other,r.closing,r.current,r.rejectCurrent,r.pieces]));
 add('Jejak stok',['Tanggal','Kegiatan','Produk','Toko','Supplier','Lot','Perubahan','Butir','Satuan'],st.details.map(r=>[r.date,r.label,r.product,r.store,r.supplier,r.lot_id,n(r.qty),n(r.pieces),r.unit]));
 }
 if(!s.access||s.access.finance){const m=marginReport(s,f);add('HPP dan hasil',['Penjualan','HPP tercatat','Waste tercatat','Operasional','Hasil setelah biaya','Biaya belum lengkap'],[[m.revenue,m.cogs,m.loss,m.operating,m.result??'Belum lengkap',m.unknown]]);add('Margin produk',['Tanggal','Toko','Produk','Penjualan','HPP','Laba kotor','Memakai olahan reject'],m.rows.map(r=>[r.date,label(s,'stores',r.storeId),r.name,r.revenue,r.cost??'Belum diketahui',r.cost==null?'Belum diketahui':r.revenue-r.cost,r.recovered?'Ya':'Tidak']));}
 if(!s.access||s.access.finance)add('Pengeluaran',['Tanggal','Toko','Kategori','Keterangan','Supplier','Nominal','Referensi'],x.rows.map(r=>[r.date,label(s,'stores',r.storeId),r.category,r.description,r.supplier||'',r.amount??'Belum diketahui',r.reference]));
 add('Keterangan',['Keterangan','Nilai'],[['Periode',f.from+' s.d. '+f.to],['Toko',f.store?label(s,'stores',f.store):'Semua toko yang dapat diakses'],['Penjualan','Transaksi lunas aktif, setelah diskon; pembatalan dikeluarkan dari periode penjualan asal.'],['Supplier','Alokasi bahan memakai proporsi modal; belum terpetakan tetap ditampilkan.'],['Pengeluaran','Biaya pembelian termasuk ongkir + operasional. PO, invoice, transfer, HPP, dan waste tidak dijumlahkan ulang. Bukan laporan arus kas pembayaran utang.'],['Stok *','Awal/akhir direkonstruksi dari stok sekarang dan jurnal. Riwayat sebelum jurnal atau koreksi lama yang tidak tercatat perlu rekonsiliasi.'],['Reject **','Perubahan kualitas, bukan pengurangan stok tambahan.'],['Stok fisik','Terjual/bahan pesanan mengikuti tanggal pemotongan stok, dapat berbeda dari tanggal pembayaran.']]);
 return sheets;
}

export function batchReportSheets(s,f={}){
 const rows=batchReports(s).filter(r=>(!f.store||r.relatedStores.has(f.store))&&(!f.supplier||r.root.supplierId===f.supplier)&&(!f.from||r.root.date>=f.from)&&(!f.to||r.root.date<=f.to)&&(!f.status||r.status===f.status)&&(!f.query||[label(s,'products',r.root.productId),r.root.note,r.root.id].join(' ').toLowerCase().includes(f.query.toLowerCase())));
 const finance=!s.access||s.access.finance;
 return [{name:'Batch supplier',headers:['Batch','Tanggal masuk','Produk','Supplier','Kg diterima','Butir diterima','Siap kg','Reject kg','Terjual kg','Terjual butir','Stok ekuivalen asal','Selisih belum terjelaskan','Status',...(finance?['Penjualan langsung','Alokasi penjualan olahan','Modal awal']:[])],rows:rows.map(r=>[r.root.id,r.root.date,label(s,'products',r.root.productId),label(s,'suppliers',r.root.supplierId),r.root.receivedKg,r.root.receivedPieces,r.readyKg,r.rejectKg,r.soldKg,r.soldPieces,r.remainingEquivalent,r.untraced,({scope:'Lintas akses toko',review:'Perlu diperiksa',active:'Aktif',closed:'Selesai'})[r.status],...(finance?[r.fruitRevenue,r.revenueIncomplete?'Belum lengkap':r.allocatedRevenue,r.totalCost??'Belum diketahui']:[])])},{name:'Keterangan',headers:['Keterangan','Nilai'],rows:[['Periode penerimaan',(f.from||'Awal')+' s.d. '+(f.to||'Sekarang')],['Cakupan','Jejak sepanjang umur batch yang tanggal penerimaannya masuk filter.'],['Stok ekuivalen','Perkiraan bagian buah asal pada produk turunan; bukan satuan stok fisik produk turunan.'],['Alokasi olahan','Menurut proporsi modal; angka yang belum lengkap tidak dianggap nol.']]}];
}
