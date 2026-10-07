import {orderTotal} from './amounts.mjs?v=28';
import {checkOrder, requirements} from './order-stock.mjs?v=28';

// One committed IndexedDB record contains both the last server snapshot and outbox.
// Every writer uses the same Web Lock, including reads that replace the snapshot.
const DB = 'maniac-pos-offline-v1';
let connection;
function openDB() {
  return connection ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('records');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { connection = null; reject(req.error); };
  });
}
export async function readLocal(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const req = tx.objectStore('records').get(key);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error || Error('Penyimpanan perangkat gagal dibaca'));
  });
}
export async function writeLocal(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite', {durability:'strict'});
    const store = tx.objectStore('records');
    if (value === undefined) store.delete(key); else store.put(value, key);
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(tx.error || Error('Penyimpanan perangkat penuh / gagal'));
  });
}
export function locked(scope, task) {
  if (!navigator.locks) throw Error('Browser belum mendukung transaksi offline. Gunakan Chrome / Edge terbaru melalui HTTPS.');
  return navigator.locks.request('maniac-pos-data:' + scope, task);
}
export async function deviceId() {
  return locked('device', async () => {
    let value = await readLocal('device');
    if (!value) { value = crypto.randomUUID(); await writeLocal('device', value); }
    return value;
  });
}
const positive = (value, label, integer = false) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 9e9 || (integer && !Number.isInteger(n))) throw Error(label + ' tidak valid');
  return n;
};
export function makeOrder(state, payload, device, userId, now = new Date().toISOString()) {
  if (state.offlineSyncVersion !== 21) throw Error('Jalankan SQL 021-offline-pos.sql terlebih dahulu.');
  if (!state.access?.sell || !state.stores.some(s => s.id === payload.storeId)) throw Error('Tidak punya akses kasir / toko ini');
  const day = String(payload.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day+'T00:00:00Z').toISOString().slice(0,10) !== day) throw Error('Tanggal transaksi tidak valid');
  if (!payload.id || !Array.isArray(payload.lines) || !payload.lines.length || payload.lines.length > 100) throw Error('Isi 1–100 item');
  const recipeVersions = {};
  const lines = payload.lines.map(line => {
    const p = state.products.find(p => p.id === line.productId);
    if (!p || ['raw','prep'].includes(p.itemType)) throw Error('Produk tidak dapat dijual');
    const result = {productId:p.id, price:positive(line.price, 'Harga')};
    if (p.stockUnit === 'kg_butir') {
      const lot = state.lots.find(l => l.id === line.lotId);
      if (!lot || lot.productId !== p.id || lot.storeId !== payload.storeId || lot.quality !== 'ready') throw Error('Asal stok buah tidak cocok');
      if (!['KG','BUTIR'].includes(line.unit)) throw Error('Satuan buah tidak valid');
      Object.assign(result, {lotId:lot.id,kg:positive(line.kg,'Berat'),pieces:positive(line.pieces,'Butir',true),unit:line.unit});
      result.qty = line.unit === 'KG' ? result.kg : result.pieces;
    } else result.qty = positive(line.qty,'Jumlah',['pcs','porsi'].includes(p.stockUnit));
    if (p.itemType === 'recipe') {
      const recipes = state.recipes.filter(r => r.outputId === p.id);
      if (recipes.length !== 1) throw Error('Resep menu belum lengkap');
      recipeVersions[p.id] = {id:recipes[0].id,version:recipes[0].version};
    }
    return result;
  });
  const status = checkOrder(state,payload.storeId,lines,day);
  if (!status.ok) throw Error(status.reason);
  const total = orderTotal(lines);
  const paid = positive(payload.paid,'Pembayaran');
  if (!['Tunai','QRIS','Transfer'].includes(payload.payment) || paid < total || (payload.payment !== 'Tunai' && Math.abs(paid-total)>1e-7)) throw Error('Pembayaran belum sesuai total');
  const sale = {id:payload.id,storeId:payload.storeId,date:day,payment:payload.payment,paid,lines,note:String(payload.note || '').slice(0,300)};
  const envelope = {sale,deviceId:device,clientCreatedAt:now,recipeVersions};
  const displayLines = lines.map(l => {
    const p = state.products.find(p => p.id === l.productId);
    return {...l,name:p.name,itemType:p.stockUnit==='kg_butir'?'fruit':p.itemType,unit:p.stockUnit==='kg_butir'?l.unit:p.stockUnit};
  });
  return {id:sale.id,userId,envelope,status:'pending',error:'',createdAt:now,order:{id:sale.id,store_id:sale.storeId,created_by:userId,business_date:day,paid_date:day,created_at:now,status:'queued',payment_status:'paid',payment:sale.payment,paid,total,lines:displayLines,note:sale.note,reserved:Object.fromEntries(requirements(state,lines)),consumption:[],cost:null,localOnly:true}};
}
export function project(bundle) {
  const state = structuredClone(bundle.snapshot);
  state.orders ||= [];
  const seen = new Set(state.orders.map(o=>o.id));
  for (const row of bundle.queue) if (!seen.has(row.id)) {
    state.orders.unshift({...structuredClone(row.order),syncStatus:row.status,syncError:row.error});
    seen.add(row.id);
  }
  return state;
}
export class OfflinePOS {
  constructor(scope) { this.scope=scope; this.key='account:'+scope; }
  async bundle() { return (await readLocal(this.key)) || {snapshot:null,queue:[],syncedAt:null}; }
  async state() { const b=await this.bundle(); return b.snapshot?project(b):null; }
  async accept(snapshot) {
    return locked(this.scope, async () => {
      const b=await this.bundle(); b.snapshot=snapshot;b.syncedAt=new Date().toISOString();
      // Do not remove outbox rows just because a matching ID appears in a read.
      // Only the idempotent sync endpoint can acknowledge the complete payload.
      await writeLocal(this.key,b);return project(b);
    });
  }
  async enqueue(payload,device,userId) {
    return locked(this.scope,async()=>{
      const b=await this.bundle();
      if(!b.snapshot)throw Error('Buka POS dan perbarui data saat online terlebih dahulu.');
      const existing=b.queue.find(r=>r.id===payload.id);
      if(existing)return project(b);
      if(b.queue.some(r=>r.status==='conflict'))throw Error('Periksa transaksi yang perlu penanganan sebelum menerima transaksi baru.');
      const row=makeOrder(project(b),payload,device,userId);
      b.queue.push(row);
      await writeLocal(this.key,b);return project(b);
    });
  }
  async sync(send, retryConflicts=false) {
    return locked(this.scope,async()=>{
      const b=await this.bundle();let error=null;
      while(b.queue.length){
        const row=b.queue[0];
        if(row.status==='conflict'&&!retryConflicts)break;
        try {
          const snapshot=await send(row.envelope);
          if(!snapshot.orders?.some(o=>o.id===row.id))throw Error('Server belum mengonfirmasi transaksi');
          b.snapshot=snapshot;b.syncedAt=new Date().toISOString();b.queue.shift();
          await writeLocal(this.key,b);
        } catch(err) {
          row.status=err.definitive&&!err.auth?'conflict':'pending';row.error=err.message;error=err;
          await writeLocal(this.key,b);break;
        }
      }
      return {state:b.snapshot?project(b):null,bundle:b,error};
    });
  }
}
