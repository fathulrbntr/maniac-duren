import {cashierActions,cashierDemo} from './cashier-demo.mjs?v=54';
// In-memory training data only. This module never sends requests or persists data.
import {emptyState,today,id,applyAction} from './core.mjs?v=10';
import {checkOrder,requirements} from './order-stock.mjs?v=12';
import {savePosCategory} from './pos-categories.mjs?v=52';
import {saveVariantProducts} from './product-variants.mjs?v=45';
const localMaster=new Set(['master','master_details','product_save','product_update','product_delete','recipe_save']);
const transactionKeys=['lots','unitLots','sales','movements','orders','events','journal','money','moneyJournal','origins','productions','wasteRuns','stockAdjustments','batchProcesses','receiptShipments','attendance','cashierApprovals'];
const clone=x=>structuredClone(x);
const positive=(value,label)=>{const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error(label+' harus lebih dari 0');return n;};
const unitQty=(value,unit)=>{const n=positive(value,'Jumlah');if(['pcs','porsi'].includes(unit)&&!Number.isInteger(n))throw Error('Jumlah harus bilangan bulat');return n;};
const validDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Tanggal tidak valid');return value;};
function seedMissingStock(s){
 const supplierId=s.stockDemo.supplierId,date=s.stockDemo.date;
 const existing=new Set([...s.lots,...s.unitLots].map(l=>l.storeId+':'+l.productId));
 for(const store of s.stores)for(const product of s.products){
  if(product.itemType==='recipe')continue; // Menus remain made to order from their real recipes.
  const fruit=product.stockUnit==='kg_butir',list=fruit?s.lots:s.unitLots;
  if(existing.has(store.id+':'+product.id))continue;
  const common={id:id(),storeId:store.id,productId:product.id,supplierId,date,unitCost:null,note:'Stok awal demo · bukan penerimaan nyata'};
  list.push(fruit?{...common,receivedKg:100,receivedPieces:100,kg:100,pieces:100,quality:'ready'}:{...common,unit:product.stockUnit||'pcs',receivedQty:100,qty:100,expiry:null,kind:'demo'});
  existing.add(store.id+':'+product.id);
 }
}
export function createStockDemo(source){
 // Skip cloning real transaction history that the demo will immediately discard.
 const s={...emptyState(),...clone(Object.fromEntries(Object.entries(source).filter(([key])=>!transactionKeys.includes(key))))};
 for(const key of transactionKeys)s[key]=[];
 s.stockDemo={sessionId:id(),supplierId:id(),date:today(),initialQty:100};
 s.suppliers.push({id:s.stockDemo.supplierId,name:'Supplier demo',phone:'',address:''});
 s.opsVersion=Math.max(s.opsVersion||0,19);s.orderStockVersion=Math.max(s.orderStockVersion||0,11);s.orderRoutingVersion=Math.max(s.orderRoutingVersion||0,13);
 s.cashierVersion=54;s.discounts||=[];seedMissingStock(s);return s;
}
function requireAccess(s,permission){if(s.access&&!s.access[permission])throw Error('Hak akses '+permission+' diperlukan.');}
function event(s,action,p,storeId=p.storeId){s.events.push({id:localMaster.has(action)?id():p.id,action,store_id:storeId||null,business_date:p.date||today(),employee_id:s.me?.id||null,payload:clone(p),demo:true});}
function payment(p,total){
 const paid=Number(p.paid);
 if(!['Tunai','QRIS','Transfer'].includes(p.payment)||!Number.isFinite(paid)||paid<total)throw Error('Pembayaran tidak valid atau belum lunas');
 if(p.payment!=='Tunai'&&paid!==total)throw Error('Pembayaran non-tunai harus sesuai total');
 return {payment_status:'paid',paid_date:p.date,paid,payment:p.payment};
}
function stockCheck(s,store,lines,date){const result=checkOrder(s,store,lines,date);if(!result.ok)throw Error(result.reason);}
function consume(s,order,lines,eventId,date=order.business_date){
 for(const line of lines){
  if(order.consumption.some(c=>c.lineId===line.lineId))continue;
  for(const [key,need] of requirements(s,[line])){
   const fruit=key.startsWith('lot:'),target=key.slice(key.indexOf(':')+1);let remaining=need.qty;
   const candidates=(fruit?s.lots:s.unitLots).filter(l=>l.storeId===order.store_id&&(fruit?l.id===target&&l.quality==='ready':l.productId===target)&&l.date<=date&&(!l.expiry||l.expiry>=date)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
   if(candidates.reduce((n,l)=>n+(fruit?l.kg:l.qty),0)+1e-8<remaining)throw Error('Stok demo tidak cukup');
   for(const lot of candidates){
    const qty=Math.min(remaining,fruit?lot.kg:lot.qty);if(qty<=0)continue;
    const pieces=fruit?need.pieces:0;
    if(fruit){if(pieces>lot.pieces||(Math.abs(lot.kg-qty)<1e-8)!==(lot.pieces===pieces))throw Error('Sisa kg dan butir harus konsisten');lot.kg=Math.max(0,lot.kg-qty);lot.pieces-=pieces;}
    else lot.qty=Math.max(0,lot.qty-qty);
    order.consumption.push({lineId:line.lineId,lotId:lot.id,productId:lot.productId,qty,pieces,unitCost:lot.unitCost});
    s.journal.push({id:id(),event_id:eventId,store_id:lot.storeId,product_id:lot.productId,lot_id:lot.id,supplier_id:lot.supplierId,qty:-qty,pieces:-pieces,unit:fruit?'kg':lot.unit});
    remaining-=qty;if(remaining<1e-8)break;
   }
  }
 }
}
function createOrder(s,p){
 requireAccess(s,'sell');validDate(p.date);
 if(!s.stores.some(x=>x.id===p.storeId))throw Error('Pilih outlet yang tersedia');
 if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>100)throw Error('Isi pesanan, maksimal 100 baris');
 const lines=p.lines.map(l=>{
  const product=s.products.find(x=>x.id===l.productId);if(!product||['raw','prep'].includes(product.itemType))throw Error('Produk tidak dapat dijual');
  const price=positive(l.price,'Harga');
  if(product.stockUnit==='kg_butir'){
   const lot=s.lots.find(x=>x.id===l.lotId&&x.productId===product.id&&x.storeId===p.storeId&&x.quality==='ready');if(!lot)throw Error('Pilih stok buah matang');
   if(!['KG','BUTIR'].includes(l.unit))throw Error('Cara jual buah tidak valid');
   const kg=positive(l.kg,'Berat'),pieces=unitQty(l.pieces,'pcs');
   return {lineId:id(),productId:product.id,name:product.name,itemType:'fruit',unit:l.unit,qty:l.unit==='KG'?kg:pieces,kg,pieces,price,lotId:lot.id,supplierId:lot.supplierId};
  }
  if(!(Number(product.salePrice)>0)||price!==Number(product.salePrice))throw Error('Harga produk berubah atau belum diisi. Pilih kembali produk.');
  const recipe=s.recipes.find(r=>r.outputId===product.id);
  return {lineId:id(),productId:product.id,name:product.name,itemType:product.itemType||'direct',unit:product.stockUnit,qty:unitQty(l.qty,product.stockUnit),price,...(product.itemType==='recipe'?{recipeId:recipe?.id,recipeVersion:recipe?.version}:{})};
 });
 stockCheck(s,p.storeId,lines,p.date);
 const total=lines.reduce((n,l)=>n+l.qty*l.price,0);if(!Number.isFinite(total)||total<=0)throw Error('Total tidak valid');
 const kitchen=lines.filter(l=>l.itemType==='recipe');
 const order={id:p.id,store_id:p.storeId,business_date:p.date,created_at:new Date().toISOString(),created_by:s.me?.id,status:kitchen.length?'queued':'paid',note:String(p.note||'').slice(0,300),lines,total,...payment(p,total),consumption:[],reserved:{},cost:null,demo:true};
 consume(s,order,lines.filter(l=>l.itemType!=='recipe'),p.id);
 order.reserved=Object.fromEntries(requirements(s,kitchen));s.orders.push(order);
}
function updateOrder(s,action,p){
 validDate(p.date);const o=s.orders.find(x=>x.id===p.orderId);if(!o||o.store_id!==p.storeId)throw Error('Pesanan demo tidak ditemukan pada outlet ini');
 if(p.date<o.business_date)throw Error('Tanggal sebelum pesanan');
 requireAccess(s,action==='order_cancel'?'cancel':['order_start','order_ready'].includes(action)?'kitchen':'sell');
 const kitchen=o.lines.filter(l=>l.itemType==='recipe');
 if(action==='order_start'){
  if(o.status!=='queued'||o.payment_status!=='paid'||!kitchen.length)throw Error('Pesanan tidak dapat mulai dibuat');
  for(const l of kitchen){const r=s.recipes.find(r=>r.id===l.recipeId);if(!r||r.version!==l.recipeVersion)throw Error('Resep berubah setelah pesanan dibuat');}
  stockCheck({...s,orders:s.orders.filter(x=>x.id!==o.id)},o.store_id,kitchen,p.date);
  consume(s,o,kitchen,p.id,p.date);o.status='preparing';o.reserved={};o.started_by=s.me?.id;
 }else if(action==='order_ready'){
  if(o.status!=='preparing'||o.payment_status!=='paid')throw Error('Pesanan belum dibuat');o.status='ready';o.finished_by=s.me?.id;
 }else if(action==='order_complete'){
  if(o.status!=='ready'||o.payment_status!=='paid')throw Error('Pesanan harus lunas dan siap');o.status='paid';
 }else if(action==='order_cancel'){
  if(!['queued','preparing','ready'].includes(o.status))throw Error('Pesanan tidak dapat dibatalkan');
  if(String(p.reason||'').trim().length<3)throw Error('Alasan wajib');
  if(o.payment_status==='paid'&&!p.refundConfirmed)throw Error('Konfirmasi simulasi pengembalian pembayaran');
  o.status='cancelled';o.payment_status=o.payment_status==='paid'?'refunded':o.payment_status;o.cancel_reason=p.reason;o.reserved={};
 }else throw Error('Aksi pesanan ini tidak tersedia dalam demo.');
}
export function applyStockDemoAction(source,action,payload){
 if(!source.stockDemo?.sessionId)throw Error('Sesi demo belum aktif');
 const p=clone(payload);if(!p.id)throw Error('ID wajib');
 const prior=!localMaster.has(action)&&source.events.find(x=>x.id===p.id);
 if(prior){if(prior.action!==action||JSON.stringify(prior.payload)!==JSON.stringify(p))throw Error('ID pengiriman sudah digunakan untuk data lain');return source;}
 let s=clone(source);
 if(cashierActions.has(action)||action==='order_create'||(action==='order_cancel'&&source.cashierVersion>=54))cashierDemo(s,action,p,createOrder);
 else if(action.startsWith('order_'))updateOrder(s,action,p);
 else if(action==='pos_category_save'){requireAccess(s,'master');savePosCategory(s,p);return s;}
 else if(action==='product_variants_save'){requireAccess(s,'master');saveVariantProducts(s,p);seedMissingStock(s);return s;}
 else if(localMaster.has(action)){requireAccess(s,'master');s=applyAction(s,action,p);seedMissingStock(s);}
 else throw Error('Mode demo mendukung uji kasir, kitchen, serta pengaturan produk, kategori dan resep. Aksi ini belum tersedia dalam demo.');
 event(s,action,p);return s;
}
