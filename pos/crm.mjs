// Shared CRM validation, estimates, and isolated training-mode behavior.
export const crmAdmin=s=>['owner','manager'].includes(s.me?.role);
export const consentText='Pelanggan setuju menerima promosi Maniac Duren melalui WhatsApp dan dapat berhenti kapan saja.';
export function normalizePhone(value){
 let v=String(value||'').trim();if(!/^[+\d\s().-]+$/.test(v))throw Error('Nomor telepon tidak valid');
 v=v.replace(/[\s().-]/g,'');if(v.startsWith('0'))v='62'+v.slice(1);v=v.replace(/^\+/,'');
 if(!/^[1-9]\d{7,14}$/.test(v))throw Error('Gunakan nomor telepon 8–15 digit, contoh 081234567890');return v;
}
export function normalizeMember(p){
 const name=String(p.name||'').trim(),email=String(p.email||'').trim().toLowerCase();
 if(name.length<2||name.length>100||/[\x00-\x1f\x7f]/.test(name))throw Error('Nama member harus 2–100 karakter');
 if(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw Error('Alamat email tidak valid');
 if(typeof p.waOptIn!=='boolean')throw Error('Persetujuan promosi tidak valid');
 return {name,phone:normalizePhone(p.phone),email,waOptIn:p.waOptIn,active:p.active!==false};
}
export function normalizeRule(s,p){
 const product=s.products.find(x=>x.id===p.productId);if(!product||['raw','prep'].includes(product.itemType))throw Error('Pilih produk yang dijual');
 const unit=product.stockUnit==='kg_butir'?p.unit:product.stockUnit;
 if(!unit||(product.stockUnit==='kg_butir'&&!['kg','butir'].includes(unit)))throw Error('Pilih satuan poin');
 const stepQty=Number(p.stepQty),points=Number(p.points);
 if(!Number.isFinite(stepQty)||stepQty<=0||stepQty>1000000||Math.abs(stepQty*1000000-Math.round(stepQty*1000000))>0.00001)throw Error('Kelipatan jumlah harus > 0, maksimal 6 desimal');
 if(['pcs','porsi','butir'].includes(unit)&&!Number.isInteger(stepQty))throw Error('Kelipatan satuan harus bilangan bulat');
 if(!Number.isSafeInteger(points)||points<0||points>1000000)throw Error('Poin harus bilangan bulat 0–1.000.000');
 if(typeof p.active!=='boolean')throw Error('Status aturan tidak valid');
 return {productId:product.id,unit,stepQty,points,active:p.active};
}
const scaled=n=>BigInt(Math.round(Number(n)*1000000));
export function pointsFor(s,lines){
 const breakdown=[];let total=0;
 for(const r of s.pointRules||[]){
  if(!r.active||!r.points)continue;
  const product=s.products.find(p=>p.id===r.productId);if(!product)continue;
  const fruit=product.stockUnit==='kg_butir';if(!fruit&&r.unit!==product.stockUnit)continue;
  const qty=lines.filter(l=>l.productId===r.productId).reduce((v,l)=>v+scaled(fruit?(r.unit==='kg'?l.kg:l.pieces):l.qty),0n);
  const points=Number(qty/scaled(r.stepQty))*r.points;if(!Number.isSafeInteger(points)||points>1000000000)throw Error('Poin transaksi melebihi batas');
  if(qty>0n)breakdown.push({...r,name:product.name,qty:Number(qty)/1e6,awarded:points});total+=points;
 }
 if(total>1000000000)throw Error('Poin transaksi melebihi batas');return {points:total,breakdown};
}
export const memberBalance=(s,id)=>(s.pointLedger||[]).filter(x=>x.memberId===id).reduce((n,x)=>n+x.points,0);
export function mutateCrmDemo(s,action,p){
 if(!s.access?.sell&&!crmAdmin(s))throw Error('Tidak memiliki akses member');
 s.members||=[];s.pointRules||=[];s.crmEvents||=[];
 if(action==='crm_member_save'){
  const old=s.members.find(x=>x.id===p.memberId);if(old&&!crmAdmin(s))throw Error('Hanya owner / manager dapat mengubah member');
  if(Number(p.expectedRevision)!==(old?.revision||0))throw Error('Data member berubah. Muat ulang.');
  const v=normalizeMember(p);if(!old&&!v.active)throw Error('Member baru harus aktif');
  if(s.members.some(x=>x.phone===v.phone&&x.id!==p.memberId))throw Error('Nomor telepon sudah terdaftar. Cari member tersebut.');
  const changed=!old||old.waOptIn!==v.waOptIn||old.phone!==v.phone;
  const m={...old,...v,id:p.memberId,revision:(old?.revision||0)+1,createdAt:old?.createdAt||new Date().toISOString(),consentAt:changed?new Date().toISOString():old.consentAt};
  if(old)Object.assign(old,m);else s.members.push(m);
 }else if(action==='crm_rule_save'){
  if(s.me?.role!=='owner')throw Error('Hanya owner dapat mengatur poin');
  const old=s.pointRules.find(x=>x.productId===p.productId);if(Number(p.expectedRevision)!==(old?.revision||0))throw Error('Aturan poin berubah. Muat ulang.');
  const rule={...normalizeRule(s,p),revision:(old?.revision||0)+1};if(old)Object.assign(old,rule);else s.pointRules.push(rule);
 }else throw Error('Aksi CRM tidak dikenal');
 s.crmEvents.push({id:p.id});
}
export function recordCrmDemo(s,action,p){
 s.pointLedger||=[];
 if(['order_create','order_pay'].includes(action)){
  const o=s.orders.find(x=>x.id===(p.orderId||p.id));if(!o||o.payment_status!=='paid'||o.crmRecorded)return;
  const m=p.memberId?s.members?.find(x=>x.id===p.memberId&&x.active):null;
  if(p.memberId&&!m)throw Error('Member tidak aktif / tidak ditemukan');
  const q=m?pointsFor(s,o.lines):{points:0,breakdown:[]};o.crmRecorded=true;o.customer=m?{id:m.id,name:m.name}:null;o.pointsEarned=q.points;
  if(m)s.pointLedger.push({id:p.id,memberId:m.id,sourceId:o.id,sourceKind:'order',kind:'earn',points:q.points,breakdown:q.breakdown,storeId:o.store_id,date:p.date,total:o.total,createdAt:new Date().toISOString()});
 }
 if(['order_void','order_cancel'].includes(action)){
  const o=s.orders.find(x=>x.id===p.orderId),old=s.pointLedger.find(x=>x.sourceId===p.orderId&&x.kind==='earn');
  if(old&&o?.payment_status==='refunded'&&!s.pointLedger.some(x=>x.sourceId===p.orderId&&x.kind==='refund')){s.pointLedger.push({...old,id:p.id,kind:'refund',points:-old.points,createdAt:new Date().toISOString()});o.pointsReversed=true;}
 }
}
export function readCrmDemo(s,{payload:p={}}={}){
 if(!s.access?.sell&&!crmAdmin(s))throw Error('Tidak memiliki akses member');
 const admin=crmAdmin(s),q=String(p.query||'').trim().toLowerCase(),offset=Math.max(0,Number(p.offset)||0),limit=50;
 if((p.export||p.detail)&&!admin)throw Error('Hanya owner / manager dapat membuka data CRM');
 let rows=(s.members||[]).filter(m=>(!p.memberId||m.id===p.memberId)&&(admin||m.active)&&(!p.activeOnly||m.active)&&(admin||p.memberId||q.length>=2)&&(!q||m.name.toLowerCase().includes(q)||(/[0-9]/.test(q)&&m.phone.includes(q.replace(/[^0-9]/g,'').replace(/^0/,'62'))))&&(!p.optInOnly||m.active&&m.waOptIn));
 if(p.export)rows=rows.filter(m=>m.active&&m.waOptIn);
 const members=rows.slice(offset,offset+limit).map(m=>({...m,balance:memberBalance(s,m.id)}));
 const ledger=p.detail?(s.pointLedger||[]).filter(x=>x.memberId===p.memberId).slice().reverse().slice(offset,offset+limit):[];
 return {members,total:rows.length,offset,limit,ledger,ledgerTotal:(s.pointLedger||[]).filter(x=>x.memberId===p.memberId).length};
}
export function contactsCsv(rows){
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
 return '\ufeff'+[['Nama','WhatsApp','Email','Poin','Persetujuan tercatat'],...rows.filter(m=>m.active&&m.waOptIn).map(m=>[m.name,m.phone,m.email,m.balance,m.consentAt])].map(r=>r.map(cell).join(',')).join('\r\n');
}
