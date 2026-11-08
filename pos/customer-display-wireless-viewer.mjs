export const DISPLAY_TOKEN_KEY='md-customer-viewer-103';
export async function displayAPI(action,{code,token}={}) {
  const response=await fetch('/api/pos-display',{
    method:'POST',cache:'no-store',credentials:'omit',
    headers:{'Content-Type':'application/json','X-Pos-Display':'1',...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify({action,...(code?{code}:{})}),signal:AbortSignal.timeout(10000),
  });
  let data;try{data=await response.json();}catch{throw Error('Server layar pelanggan belum tersedia. Periksa pembaruan aplikasi bersama kasir.');}
  if(!response.ok&&data.status!=='gone')throw Error(data.error||'Koneksi layar pelanggan terganggu.');
  return data;
}
export function wirelessState(data,now=Date.now()) {
  if(data.status!=='connected'||!Number.isSafeInteger(data.seq)||!Number.isFinite(data.serverNow)||!Number.isFinite(data.updatedAt))return null;
  const snapshot=data.snapshot?structuredClone(data.snapshot):null;
  if(snapshot?.qr)snapshot.qr.expiresAt=now+Math.max(0,snapshot.qr.expiresAt-data.serverNow);
  return {seq:data.seq,seenAt:now-Math.max(0,data.serverNow-data.updatedAt),snapshot};
}
export class WirelessDisplayViewer {
  constructor({api=displayAPI,onChange=()=>{},storage,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}) {
    Object.assign(this,{api,onChange,storage,schedule,cancel});this.token='';this.generation=0;this.timer=null;
  }
  remember(token) {try{if(token)this.storage?.setItem(DISPLAY_TOKEN_KEY,token);else this.storage?.removeItem(DISPLAY_TOKEN_KEY);}catch{/* Private browsing still works for this page. */}}
  resume() {try{this.token=this.storage?.getItem(DISPLAY_TOKEN_KEY)||'';}catch{/* Memory-only session. */}if(/^[a-f0-9]{64}$/.test(this.token))void this.poll(this.generation);else this.onChange({status:'idle'});}
  async pair(code) {
    const generation=++this.generation;this.cancel(this.timer);this.onChange({status:'pairing'});
    try {
      const data=await this.api('pair',{code});
      if(generation!==this.generation){if(data.token)void this.api('leave',{token:data.token}).catch(()=>{});return;}
      if(data.status!=='pending'||!/^[a-f0-9]{64}$/.test(data.token||''))throw Error('Sambungan tidak valid. Minta kode baru kepada kasir.');
      this.token=data.token;this.remember(this.token);this.onChange({status:'pending',verificationCode:data.verificationCode});
      this.timer=this.schedule(()=>this.poll(generation),1500);
    }catch(error){if(generation===this.generation)this.onChange({status:'idle',error:error.message});}
  }
  async poll(generation) {
    if(generation!==this.generation||!this.token)return;
    try {
      const data=await this.api('poll',{token:this.token});
      if(generation!==this.generation)return;
      if(data.status==='gone'){this.token='';this.remember('');this.onChange({status:'idle',error:'Sambungan berakhir. Minta kode baru kepada kasir.'});return;}
      this.onChange(data);
    }catch(error){if(generation!==this.generation)return;this.onChange({status:'offline',error:error.message});}
    if(generation===this.generation&&this.token)this.timer=this.schedule(()=>this.poll(generation),1500);
  }
  leave() {
    this.generation++;this.cancel(this.timer);const token=this.token;this.token='';this.remember('');this.onChange({status:'idle'});
    if(token)void this.api('leave',{token}).catch(()=>{});
  }
  pause() {this.generation++;this.cancel(this.timer);}
}
