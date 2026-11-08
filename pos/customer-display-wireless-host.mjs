import {observeCustomerDisplay,openCustomerDisplay} from './customer-display-channel.mjs';
import {escape as e} from './core.mjs';

export class WirelessDisplayHost {
  constructor(rpc,{onChange=()=>{},schedule=(fn,ms)=>setInterval(fn,ms),cancel=id=>clearInterval(id)}={}) {
    Object.assign(this,{rpc,onChange,schedule,cancel}); this.generation=0;this.snapshot=null;this.session=null;this.timer=null;this.busy=false;this.dirty=false;this.status={status:'idle'};
  }
  notify(value) { this.status=value;this.onChange(value); }
  async start(store) {
    await this.stop();
    const generation=++this.generation;
    const session={id:crypto.randomUUID(),store,code:Array.from(crypto.getRandomValues(new Uint8Array(5)),n=>n.toString(16).padStart(2,'0')).join('').toUpperCase(),seq:0};
    this.session=session;this.notify({status:'creating'});
    try {
      const state=await this.call(session,'create',{code:session.code});
      if(generation!==this.generation) { await this.call(session,'stop').catch(()=>{});return; }
      this.notify(state);this.timer=this.schedule(()=>this.publish(this.snapshot),5000);this.publish(this.snapshot);
    } catch(error) { if(generation===this.generation){this.session=null;this.notify({status:'error',error:error.message});} throw error; }
  }
  call(s,action,data={}) {return this.rpc({p_action:action,p_store:s.store,p_session:s.id,p_data:data});}
  publish(snapshot) {this.snapshot=snapshot;this.dirty=true;void this.flush();}
  async flush() {
    if(!this.session || this.busy || this.status.status==='creating')return;
    const session=this.session,generation=this.generation;
    this.busy=true;this.dirty=false;
    try {
      const state=await this.call(session,'publish',{seq:++session.seq,snapshot:this.snapshot});
      if(generation===this.generation){this.notify(state);if(state.status==='closed'){this.cancel(this.timer);this.session=null;}}
    } catch(error) {if(generation===this.generation)this.notify({status:'offline',error:error.message});}
    finally {this.busy=false;if(this.dirty&&this.session)void this.flush();}
  }
  async approve(code) {
    const session=this.session,generation=this.generation;if(!session)return;
    const state=await this.call(session,'approve',{verificationCode:code});
    if(generation===this.generation)this.notify(state);
  }
  async stop() {
    this.generation++;this.cancel(this.timer);this.timer=null;
    const session=this.session;this.session=null;this.dirty=false;this.notify({status:'idle'});
    if(session)await this.call(session,'stop').catch(()=>{});
  }
}
let host=null;
export function showWirelessDisplay(ctx,store) {
  const demo=!!ctx.getState?.().stockDemo;
  if(!host){
    host=new WirelessDisplayHost(payload=>ctx.displayHost(payload));
    observeCustomerDisplay((snapshot,{reset=false}={})=>{if(reset){host.snapshot=null;void host.stop();}else host.publish(snapshot);});
    window.addEventListener('pagehide',()=>{void host.stop();});
  }
  host.rpc=payload=>ctx.displayHost(payload);
  const url=new URL('./customer-display.html',import.meta.url).href;
  const dialog=ctx.modal('Layar pelanggan wireless',`<p>Buka alamat ini di browser tablet:</p><p><a href="${e(url)}" target="_blank" rel="noopener">${e(url)}</a></p><p>Tablet dan kasir harus terhubung ke internet. Wi-Fi boleh berbeda.</p><section data-display-pair role="status"></section><p data-display-error role="alert"></p><div class="header-row"><button type="button" data-display-create ${demo?'disabled':''}>Buat kode pasangan</button><button type="button" data-display-stop>Putuskan tablet</button></div>${demo?'<p>Mode demo: gunakan layar pada komputer yang sama. Sambungan tablet tersedia pada mode operasional.</p>':''}<p><button type="button" data-display-local>Layar di komputer ini ↗</button></p>`,'Selesai');
  dialog.querySelector('form').onsubmit=ev=>{ev.preventDefault();dialog.close();};
  const area=dialog.querySelector('[data-display-pair]'),error=dialog.querySelector('[data-display-error]'),create=dialog.querySelector('[data-display-create]');
  const draw=state=>{
    const code=host.session?.code;
    create.disabled=demo||state.status==='creating';create.textContent=code?'Buat kode baru':'Buat kode pasangan';
    const text={idle:'Belum ada tablet terhubung.',creating:'Menyiapkan kode…',waiting:'Masukkan kode ini di tablet. Berlaku 5 menit.',pending:'Tablet meminta sambungan. Cocokkan kode verifikasi pada kedua layar.',connected:'Tablet terpasang. Pesanan dan QR akan diperbarui otomatis.',offline:'Koneksi terputus. Tablet menyembunyikan QR sambil menunggu sambungan.',expired:'Kode sudah kedaluwarsa. Buat kode baru.',closed:'Sesi berakhir. Pasangkan kembali tablet.',error:state.error};
    area.innerHTML=`<p>${e(text[state.status]||'Menghubungkan…')}</p>${code&&['waiting','pending'].includes(state.status)?`<h2>${e(code.slice(0,5)+'-'+code.slice(5))}</h2>`:''}${state.status==='pending'?`<p>Kode verifikasi tablet: <strong>${e(state.verificationCode)}</strong></p><button type="button" data-display-approve>Kode sesuai · Izinkan tablet</button>`:''}`;
    area.querySelector('[data-display-approve]')?.addEventListener('click',()=>run(()=>host.approve(state.verificationCode)));
  };
  const run=async fn=>{error.textContent='';try{await fn();}catch(err){error.textContent=err.message;}};
  host.onChange=draw;draw(host.status);
  create.onclick=()=>run(async()=>{if(!ctx.displayHost)throw Error('Muat ulang POS setelah memasang pembaruan wireless.');await host.start(store);});
  dialog.querySelector('[data-display-stop]').onclick=()=>run(()=>host.stop());
  dialog.querySelector('[data-display-local]').onclick=()=>run(()=>openCustomerDisplay());
  dialog.addEventListener('close',()=>{if(host.onChange===draw)host.onChange=()=>{};},{once:true});
  return dialog;
}
