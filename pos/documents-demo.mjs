import {availablePayments} from './payment-methods.mjs?v=84';
// Document training runs entirely inside the current stock-demo state.
import {id,today} from './core.mjs?v=60';
import {transactions} from './reports.mjs?v=84';
import {sumProducts} from './decimal-totals.mjs?v=66';

export const documentDemoActions=new Set(['document_save','document_issue','document_cancel','letterhead_save']);
const sources={PO:[''],PUR:['','po','receipt','unit_receipt'],INV:['order','sale'],DO:['transfer','movement','order','sale']};
const copy=x=>structuredClone(x);
const assert=(ok,message)=>{if(!ok)throw Error(message);};
function access(s,permission,storeId){
 assert(s.stockDemo?.sessionId,'Sesi demo belum aktif');
 assert(s.stores.some(x=>x.id===storeId),'Toko tidak tersedia');
 assert(!s.access||s.access[permission],'Hak akses '+permission+' diperlukan.');
}
const permission=kind=>kind==='DO'?'stock':'finance';
function date(value){assert(/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value,'Tanggal tidak valid');return value;}
function amount(value,title,min=0,max=1e12){const n=Number(value);assert(Number.isFinite(n)&&n>=min&&n<=max,title+' tidak valid');return n;}
function quantity(value,unit){const n=amount(value,'Jumlah',Number.MIN_VALUE);assert(!['pcs','porsi'].includes(unit)||Number.isInteger(n),'Jumlah pcs/porsi harus bulat');return n;}
function rows(lines,key){assert(Array.isArray(lines)&&lines.length>0&&lines.length<=100,'Isi 1–100 barang');assert(lines.every(x=>x[key])&&new Set(lines.map(x=>x[key])).size===lines.length,'Barang tidak boleh kosong atau ganda');return lines;}
function header(s,storeId){
 const st=s.stores.find(x=>x.id===storeId);
 return copy(s.stockDemo.letterheads?.[storeId]||{store_id:storeId,version:0,name:st.name,address:st.location||'Alamat contoh untuk latihan',phone:st.phone||'',email:'',signer:'',logo:'',footer:'DEMO · BUKAN DOKUMEN RESMI'});
}
export function readDemoDocument(s,name,p){
 assert(s.stockDemo?.sessionId,'Sesi demo belum aktif');
 if(name==='pos_letterhead_get'){
  assert(!s.access||s.access.finance||s.access.stock||s.access.reports,'Hak akses tidak tersedia');
  assert(s.stores.some(x=>x.id===p.store_id),'Toko tidak tersedia');return header(s,p.store_id);
 }
 assert(name==='pos_document_get','Pembacaan ini belum tersedia dalam demo.');
 const d=s.documents.find(x=>x.id===p.document_id);assert(d,'Dokumen demo tidak ditemukan');access(s,permission(d.kind),d.store_id);
 const src=(d.source_type==='order'?s.orders:s.sales).find(x=>x.id===d.source_id);
 return {...copy(d),header:copy(d.header||header(s,d.store_id)),history:copy(s.adminEvents.filter(x=>x.entity_id===d.id)),sourceCancelled:!!src&&(src.status==='cancelled'||!!src.voided)};
}
function audit(s,action,p,target){s.adminEvents.push({id:p.id,action,entity_id:target,store_id:p.storeId,actor:s.me?.user_id||s.me?.id||'Demo',at:new Date().toISOString(),note:p.reason||'',demo:true});}
function journal(s,lot,eventId,qty,pieces,action,dt){s.journal.push({id:id(),event_id:eventId,lot_id:lot.id,product_id:lot.productId,store_id:lot.storeId,supplier_id:lot.supplierId,qty,pieces,unit:lot.unit||'kg',cost:lot.unitCost==null?null:qty*lot.unitCost,date:dt,action});}
function stockEvent(s,eventId,action,d,payload){s.events.push({id:eventId,action,store_id:d.store_id,business_date:d.document_date,payload,demo:true});}
function receive(s,d,lines,shipping,subtotal){
 access(s,'stock',d.store_id);let allocated=0;
 return lines.map((l,i)=>{
  const share=i===lines.length-1?shipping-allocated:subtotal>0?shipping*l.total/subtotal:shipping/lines.length;allocated+=share;
  const p=s.products.find(x=>x.id===l.productId),fruit=p.stockUnit==='kg_butir',eventId=id();
  const lot={id:eventId,storeId:d.store_id,supplierId:d.body.supplierId,productId:l.productId,date:d.document_date,expiry:l.expiry||null,unitCost:(l.total+share)/l.qty,purchaseCost:l.total,shippingCost:share,totalCost:l.total+share,note:'DEMO · Pembelian '+d.id,kind:'purchase'};
  if(fruit)Object.assign(lot,{receivedKg:l.qty,receivedPieces:l.pieces,kg:l.qty,pieces:l.pieces,quality:'ready'});
  else Object.assign(lot,{receivedQty:l.qty,qty:l.qty,unit:p.stockUnit});
  (fruit?s.lots:s.unitLots).push(lot);const action=fruit?'receipt':'unit_receipt';
  stockEvent(s,eventId,action,d,{documentId:d.id});journal(s,lot,eventId,l.qty,l.pieces||0,action,d.document_date);
  return {...l,receiptId:eventId,shipping:share};
 });
}
function transfer(s,d,b){
 const dest=s.stores.find(x=>x.id===b.toStoreId);assert(dest&&dest.id!==d.store_id,'Pilih toko tujuan yang berbeda');access(s,'stock',dest.id);
 assert(!s.orders.some(x=>x.store_id===d.store_id&&x.status==='queued'&&x.payment_status==='paid'),'Selesaikan antrean kitchen sebelum transfer bahan agar cadangan pesanan aman');
 const lines=rows(b.lines,'lotId').map(line=>{
  const lot=[...s.lots,...s.unitLots].find(x=>x.id===line.lotId&&x.storeId===d.store_id);assert(lot,'Lot asal tidak tersedia');
  const fruit=lot.kg!==undefined,p=s.products.find(x=>x.id===lot.productId),q=quantity(line.qty,lot.unit),pieces=fruit?quantity(line.pieces,'pcs'):0;
  assert(d.document_date>=lot.date&&(!lot.expiry||lot.expiry>=d.document_date),'Tanggal transfer tidak sesuai stok');
  assert(q<=(lot.kg??lot.qty)&&pieces<=(lot.pieces||0),'Stok transfer tidak cukup');
  if(fruit)assert((Math.abs(lot.kg-q)<1e-8)===(lot.pieces===pieces),'Sisa kg dan butir harus konsisten');
  const eventId=id(),target={...copy(lot),id:eventId,storeId:dest.id,date:d.document_date,sourceLotId:lot.id,note:'DEMO · Transfer '+d.id,kind:'opening'};
  delete target.purchaseCost;delete target.shippingCost;delete target.totalCost;
  if(fruit){lot.kg-=q;lot.pieces-=pieces;Object.assign(target,{receivedKg:q,receivedPieces:pieces,kg:q,pieces});}
  else{lot.qty-=q;Object.assign(target,{receivedQty:q,qty:q});}
  (fruit?s.lots:s.unitLots).push(target);const action=fruit?'movement':'unit_transfer';
  stockEvent(s,eventId,action,d,{documentId:d.id,toStoreId:dest.id});journal(s,lot,eventId,-q,-pieces,action,d.document_date);journal(s,target,eventId,q,pieces,action,d.document_date);
  if(fruit)s.movements.push({id:eventId,lotId:lot.id,storeId:d.store_id,toStoreId:dest.id,productId:lot.productId,supplierId:lot.supplierId,date:d.document_date,kind:'Transfer',kg:q,pieces,demo:true});
  return {productId:lot.productId,name:p?.name,lotId:lot.id,receiptId:eventId,qty:q,pieces,unit:lot.unit||'kg'};
 });
 return {...b,lines,party:dest.name,address:dest.location||''};
}
function issue(s,d){
 let b=copy(d.body),total=0;
 if(b.dueDate)assert(date(b.dueDate)>=d.document_date,'Jatuh tempo tidak boleh sebelum tanggal dokumen');
 if(['order','sale','movement','receipt','unit_receipt'].includes(d.source_type))assert(!s.documents.some(x=>x.id!==d.id&&x.status==='issued'&&x.kind===d.kind&&x.source_type===d.source_type&&x.source_id===d.source_id),'Dokumen terbit untuk referensi ini sudah ada');
 if(['order','sale'].includes(d.source_type)){
  assert(!s.access||s.access.sell||s.access.reports,'Hak akses penjualan diperlukan');
  const tx=transactions(s).find(x=>x.id===d.source_id&&x.kind===d.source_type&&x.storeId===d.store_id);
  assert(tx,'Transaksi harus lunas, aktif dan dari toko ini');assert(d.document_date>=tx.date,'Tanggal dokumen sebelum transaksi');
  b={...b,lines:copy(tx.lines),subtotal:sumProducts(tx.lines.map(l=>[l.qty,l.price])),shipping:0,payment:tx.payment,sourceLabel:tx.order?.receipt_no||tx.id};total=tx.total;
 }else if(['receipt','unit_receipt','movement'].includes(d.source_type)){
  const src=(d.source_type==='receipt'?s.lots:d.source_type==='unit_receipt'?s.unitLots:s.movements).find(x=>x.id===d.source_id&&x.storeId===d.store_id);
  assert(src,'Referensi tidak ditemukan di toko ini');assert(d.document_date>=src.date,'Tanggal dokumen sebelum transaksi');
  assert(d.source_type==='movement'?src.kind==='Transfer':!src.sourceLotId&&(d.source_type==='receipt'||src.kind==='purchase'),'Pilih pembelian asli atau transfer yang sesuai');
  const q=quantity(src.receivedKg??src.receivedQty??src.kg,src.unit),p=s.products.find(x=>x.id===src.productId);
  const cost=src.totalCost??(src.unitCost==null?null:q*src.unitCost);assert(d.kind==='DO'||cost!=null,'Modal penerimaan belum lengkap');total=d.kind==='DO'?0:cost;
  const party=(d.kind==='DO'?s.stores:s.suppliers).find(x=>x.id===(d.kind==='DO'?src.toStoreId:src.supplierId));
  b={...b,supplierId:src.supplierId,toStoreId:src.toStoreId,party:party?.name||b.party,address:party?.address||party?.location||'',shipping:0,sourceLabel:src.id,lines:[{productId:src.productId,name:p?.name,qty:q,pieces:src.receivedPieces??src.pieces,unit:src.unit||'kg',price:total/q,total}]};
 }else if(d.source_type==='transfer')b=transfer(s,d,b);
 else{
  const supplier=s.suppliers.find(x=>x.id===b.supplierId);assert(supplier,'Pilih supplier');
  let lines=rows(b.lines,'productId').map(l=>{
   const p=s.products.find(x=>x.id===l.productId);assert(p&&['raw','direct'].includes(p.itemType||'direct'),'Pilih barang pembelian, bukan hasil produksi/resep');
   const q=quantity(l.qty,p.stockUnit),price=amount(l.price,'Harga'),pieces=p.stockUnit==='kg_butir'?quantity(l.pieces,'pcs'):0;
   if(l.expiry)assert(date(l.expiry)>=d.document_date,'Kedaluwarsa sebelum tanggal pembelian');
   return {productId:p.id,name:p.name,qty:q,pieces,unit:p.stockUnit==='kg_butir'?'kg':p.stockUnit||'pcs',price,total:sumProducts([[q,price]]),expiry:l.expiry||null};
  });
  const subtotal=sumProducts(lines.map(l=>[l.qty,l.price])),shipping=amount(b.shipping||0,'Ongkir',0,1e15);total=subtotal+shipping;assert(Number.isFinite(total)&&total<=1e15,'Total terlalu besar');
  if(d.source_type==='po'){
   const po=s.documents.find(x=>x.id===d.source_id&&x.kind==='PO'&&x.status==='issued'&&x.store_id===d.store_id);
   assert(po&&po.body.supplierId===b.supplierId&&d.document_date>=po.document_date,'PO tidak sesuai toko, supplier, atau tanggal');
   for(const l of lines){const original=po.body.lines.find(x=>x.productId===l.productId),used=s.documents.filter(x=>x.kind==='PUR'&&x.source_id===po.id&&x.status==='issued').flatMap(x=>x.body.lines).filter(x=>x.productId===l.productId).reduce((a,x)=>a+x.qty,0);assert(original&&used+l.qty<=original.qty,'Pembelian melebihi sisa jumlah PO');}
   b.sourceLabel=po.number;
  }
  if(d.kind==='PUR')lines=receive(s,d,lines,shipping,subtotal);
  b={...b,lines,subtotal,shipping,party:supplier.name,address:supplier.address||''};
 }
 assert(!['INV','DO'].includes(d.kind)||String(b.party||'').trim(),'Isi nama penerima/pelanggan');
 if(d.kind==='DO'){
  b.lines=b.lines.map(l=>{const {price,total,cost,unitCost,revenue,...rest}=l;return {...rest,qty:l.kg||l.qty,unit:l.kg?'kg':String(l.unit||'').toLowerCase()};});
  for(const k of ['subtotal','shipping','payment','paid'])delete b[k];total=0;
 }
 const period=d.document_date.replaceAll('-','').slice(0,6),key=d.kind+':'+period,counters=s.stockDemo.documentCounters||(s.stockDemo.documentCounters={}),seq=(counters[key]||0)+1;counters[key]=seq;
 Object.assign(d,{body:b,header:header(s,d.store_id),total,status:'issued',version:d.version+1,number:`DEMO/MD/${d.kind}/${period}/${String(seq).padStart(6,'0')}`,issued_at:new Date().toISOString(),party:b.party,reference:b.reference,sourceLabel:b.sourceLabel});
}
export function applyDocumentDemo(s,action,p){
 assert(documentDemoActions.has(action),'Aksi dokumen demo tidak dikenal');
 if(action==='letterhead_save'){
  access(s,'master',p.storeId);assert(s.me?.role==='owner','Hanya owner dapat mengubah kop surat');const h=copy(p.header||{}),prior=header(s,p.storeId);
  assert(prior.version===p.version,'Kop surat berubah. Muat ulang');
  for(const [k,max] of Object.entries({name:100,address:500,phone:50,email:150,footer:500,signer:100})){h[k]=String(h[k]||'').trim();assert(h[k].length<=max&&(!['name','address'].includes(k)||h[k]),'Isi '+k+' kop surat tidak valid');}
  assert(!h.logo||(h.logo.length<=100000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(h.logo)),'Logo harus PNG/JPEG/WebP maksimal 70 KB');
  (s.stockDemo.letterheads||={})[p.storeId]={...h,version:prior.version+1,store_id:p.storeId};audit(s,action,p,p.storeId);return;
 }
 let d=s.documents.find(x=>x.id===p.documentId);
 if(action==='document_save'){
  assert(sources[p.kind],'Jenis dokumen tidak valid');access(s,permission(p.kind),p.storeId);
  const b=copy(p.body);assert(b&&typeof b==='object'&&!Array.isArray(b)&&JSON.stringify(b).length<=100000,'Isi dokumen tidak valid');
  assert(date(p.date)<=today(),'Tanggal dokumen tidak boleh di masa depan');
  for(const [k,max] of Object.entries({party:200,address:500,reference:100,note:1000}))assert(String(b[k]||'').length<=max,'Isi dokumen terlalu panjang');
  const sourceType=b.sourceType||'',sourceId=b.sourceId||null;
  assert(sources[p.kind].includes(sourceType),'Sumber dokumen tidak sesuai');assert(['','transfer'].includes(sourceType)||sourceId,'Pilih referensi transaksi');assert(p.documentId,'ID dokumen wajib');
  if(d){assert(d.store_id===p.storeId&&d.kind===p.kind&&d.status==='draft','Dokumen terbit tidak dapat diedit');assert(d.version===p.version,'Dokumen berubah. Muat ulang');}
  else{assert(!p.version,'Dokumen tidak ditemukan');d={id:p.documentId,store_id:p.storeId,kind:p.kind,status:'draft',version:0,total:0,created_at:new Date().toISOString(),created_by:s.me?.id,demo:true};s.documents.unshift(d);}
  Object.assign(d,{body:b,source_type:sourceType,source_id:sourceId,document_date:p.date,version:d.version+1,party:b.party,reference:b.reference});
 }else{
  assert(d&&d.store_id===p.storeId,'Dokumen demo tidak ditemukan');access(s,permission(d.kind),p.storeId);assert(d.version===p.version,'Dokumen berubah. Muat ulang');
  if(action==='document_cancel'){
   assert(d.status!=='cancelled','Dokumen sudah dibatalkan');
   assert(!(d.status==='issued'&&(d.kind==='PUR'||d.source_type==='transfer')),'Stok sudah dicatat. Dokumen tetap menjadi riwayat');
   assert(!s.documents.some(x=>x.source_id===d.id&&x.status==='issued'),'Dokumen sudah dipakai pembelian');assert(String(p.reason||'').trim().length>=3,'Isi alasan pembatalan');
   Object.assign(d,{status:'cancelled',cancel_reason:p.reason.trim().slice(0,500),version:d.version+1});
  }else{assert(d.status==='draft','Dokumen sudah diterbitkan');issue(s,d);}
 }
 audit(s,action,p,d.id);
}

export function createDocumentExamples(s,storeId,createSale){
 for(const p of ['finance','stock','sell'])access(s,p,storeId);
 assert(!s.stockDemo.documentExamples?.[storeId],'Contoh dokumen sudah dibuat untuk toko ini. Gunakan Reset demo untuk mengulang.');
 const product=s.products.find(p=>(p.itemType||'direct')==='direct');assert(product,'Tambahkan produk jual langsung untuk membuat contoh dokumen.');
 const dt=today(),supplierId=s.stockDemo.supplierId,fruit=product.stockUnit==='kg_butir';
 const make=(kind,body)=>{const documentId=id();applyDocumentDemo(s,'document_save',{id:id(),documentId,storeId,kind,date:dt,version:0,body});applyDocumentDemo(s,'document_issue',{id:id(),documentId,storeId,version:1});return s.documents.find(d=>d.id===documentId);};
 const body={supplierId,shipping:0,lines:[{productId:product.id,qty:2,pieces:fruit?2:0,price:150000}],note:'Contoh latihan dokumen — bukan transaksi nyata.'};
 const po=make('PO',body),purchase=make('PUR',{...body,sourceType:'po',sourceId:po.id});
 const saleId=id(),price=fruit?product.priceKg:product.salePrice,line={productId:product.id,qty:1,price,...(fruit?{unit:'KG',kg:1,pieces:1,lotId:purchase.body.lines[0].receiptId}:{})};
 createSale({id:saleId,storeId,date:dt,lines:[line],payment:availablePayments(s,storeId)[0]?.label||'Tunai',paid:price});
 const saleBody={sourceType:'order',sourceId:saleId,party:'Pelanggan Demo',address:'Alamat contoh pelanggan',note:body.note};
 make('INV',saleBody);make('DO',saleBody);(s.stockDemo.documentExamples||={})[storeId]=true;
}
