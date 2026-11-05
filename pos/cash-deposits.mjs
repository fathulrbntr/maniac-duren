import {sumProducts} from './decimal-totals.mjs';

export const depositActions=new Set(['cash_deposit_save','cash_deposit_void']);
export const canRecordDeposit=s=>!s.access||!!(s.access.sell||s.access.finance)||s.me?.role==='owner';
export const canReadDeposits=s=>canRecordDeposit(s)||!!s.access?.reports;
export const canVoidDeposit=s=>s.me?.role==='owner'||!!s.access?.finance;
const day=stamp=>new Date(stamp).toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
const scoped=(s,id)=>canReadDeposits(s)&&s.stores.some(x=>x.id===id);
const validNumber=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export function depositTotals(s,store='',rows=s.cashDepositSummary){
 if(!(s.cashDepositVersion>=92)||!Array.isArray(rows))return null;
 const stores=s.stores.filter(x=>(!store||x.id===store)&&scoped(s,x.id));
 if(!stores.length)return null;
 const values=stores.map(x=>rows.find(r=>r.storeId===x.id));
 if(values.some(r=>!r||['netCash','deposited','pending'].some(k=>!validNumber(r[k]))))return null;
 return Object.fromEntries(['netCash','deposited','pending','count'].map(key=>[key,sumProducts(values.map(r=>[r[key]||0]))]));
}
export function validateDepositInput(p){
 if(Object.keys(p).some(k=>!['id','storeId','amount','bank','proof'].includes(k)))throw Error('Tanggal dan identitas setoran ditetapkan server; isian tidak dikenal');
 const amount=Number(p.amount),bank=String(p.bank||'').trim();
 if(!Number.isSafeInteger(amount)||amount<=0||amount>9e15)throw Error('Nilai setoran harus Rupiah bulat lebih dari nol');
 if(bank.length<2||bank.length>80||/[\u0000-\u001f\u007f]/.test(bank))throw Error('Isi bank tujuan setor (2–80 karakter)');
 const match=String(p.proof||'').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match||match[2].length%4||match[2].length>2796204)throw Error('Bukti struk wajib JPG, PNG, atau WebP, maksimal 2 MB');
 let raw;try{raw=atob(match[2]);}catch{throw Error('Bukti struk tidak valid');}
 const bytes=Array.from(raw.slice(0,12),c=>c.charCodeAt(0)),prefix=bytes.map(b=>b.toString(16).padStart(2,'0')).join('');
 if(raw.length<12||raw.length>2097152||!(match[1]==='png'&&prefix.startsWith('89504e470d0a1a0a')||match[1]==='jpeg'&&prefix.startsWith('ffd8ff')||match[1]==='webp'&&raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP'))throw Error('Isi bukti tidak sesuai format gambar');
 return {amount,bank,proof:p.proof};
}
export function refreshDepositDemo(s,now=new Date().toISOString()){
 s.cashDepositVersion=92;s.cashDepositToday=day(now);
 s.cashDepositSummary=s.stores.filter(st=>scoped(s,st.id)).map(st=>{
  const orders=(s.orders||[]).filter(o=>o.store_id===st.id&&o.payment==='Tunai'&&o.payment_status==='paid'&&o.status!=='cancelled');
  const orderIds=new Set((s.orders||[]).map(o=>o.id));
  const sales=(s.sales||[]).filter(o=>o.storeId===st.id&&o.payment==='Tunai'&&!o.voided&&!orderIds.has(o.id));
  const deposits=(s.cashDeposits||[]).filter(x=>x.storeId===st.id&&!x.voidedAt);
  const netCash=sumProducts([...orders,...sales].map(x=>[x.total])),deposited=sumProducts(deposits.map(x=>[x.amount]));
  return {storeId:st.id,netCash,deposited,pending:sumProducts([[netCash],[-deposited]]),count:deposits.length};
 });return s;
}
export function mutateDepositDemo(s,action,p,now=new Date().toISOString()){
 if(!s.me?.id||!p.id)throw Error('Login dan ID operasi wajib');
 s.cashDeposits||=[];s.cashDepositProofs||={};s.cashDepositEvents||=[];
 refreshDepositDemo(s,now);
 if(action==='cash_deposit_save'){
  if(!canRecordDeposit(s)||!scoped(s,p.storeId))throw Error('Hak akses setoran outlet tidak tersedia');
  const input=validateDepositInput(p),summary=depositTotals(s,p.storeId);
  if(!summary||input.amount>summary.pending)throw Error('Setoran melebihi cash yang belum disetor. Perbarui saldo.');
  s.cashDeposits.push({id:p.id,storeId:p.storeId,date:day(now),createdAt:now,amount:input.amount,bank:input.bank,cashierId:s.me.id,cashierName:s.me.name,hasProof:true,voidedAt:null});s.cashDepositProofs[p.id]=input.proof;
 }else if(action==='cash_deposit_void'){
  if(Object.keys(p).some(k=>!['id','depositId','reason'].includes(k)))throw Error('Isian pembatalan tidak dikenal');
  const d=s.cashDeposits.find(x=>x.id===p.depositId),reason=String(p.reason||'').trim();
  if(!d||!scoped(s,d.storeId)||!canVoidDeposit(s))throw Error('Hanya pengelola keuangan yang dapat membatalkan setoran');
  if(d.voidedAt)throw Error('Setoran sudah dibatalkan');
  if(reason.length<3||reason.length>300)throw Error('Alasan pembatalan wajib 3–300 karakter');
  Object.assign(d,{voidedAt:now,voidedName:s.me.name,voidReason:reason,voidEventId:p.id});
 }else throw Error('Aksi setoran tidak dikenal');
 s.cashDepositEvents.push({id:p.id,action});return refreshDepositDemo(s,now);
}
export function readDepositsDemo(s,filters={},now=new Date().toISOString()){
 const st=filters.storeId||'',offset=Number(filters.offset||0),from=filters.from||'',to=filters.to||'';
 if(!canReadDeposits(s)||(st&&!scoped(s,st)))throw Error('Outlet tidak dapat diakses');
 if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||(from&&to&&from>to))throw Error('Filter tidak valid');
 const rows=(s.cashDeposits||[]).filter(x=>scoped(s,x.storeId)&&(!st||x.storeId===st)&&(!from||x.date>=from)&&(!to||x.date<=to)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
 const copy=refreshDepositDemo({...s},now);
 return {rows:rows.slice(offset,offset+21),summary:copy.cashDepositSummary.filter(x=>!st||x.storeId===st),periodDeposited:sumProducts(rows.filter(x=>!x.voidedAt).map(x=>[x.amount])),serverDate:day(now),fetchedAt:now};
}
export function depositProofDemo(s,id){
 const d=(s.cashDeposits||[]).find(x=>x.id===id);
 if(!d||!scoped(s,d.storeId))throw Error('Bukti setoran tidak dapat diakses');
 return {deposit:d,proof:s.cashDepositProofs?.[id]};
}
