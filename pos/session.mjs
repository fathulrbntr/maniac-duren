// Persist only credentials and the last view/outlet, never passwords or POS data.
// Server authorization remains authoritative on every request.
function browserStorage() { try { return globalThis.localStorage; } catch { return null; } }
function browserLocks() { try { return globalThis.navigator?.locks; } catch { return null; } }
const changed = () => Object.assign(Error('Sesi berubah atau sudah keluar. Silakan masuk kembali.'), {sessionChanged:true});

export function createSessionManager({url,key,storage=browserStorage(),locks=browserLocks(),fetcher=globalThis.fetch,now=Date.now}) {
  const storageKey = 'maniac-pos-session-v1:' + url;
  const locationKey = id => storageKey + ':location:' + id;
  let memory = null, pending = null, persistent = !!storage;
  const valid = s => s?.version===1 && s.url===url && typeof s.sessionId==='string' &&
    typeof s.userId==='string' && !!s.userId && typeof s.accessToken==='string' && !!s.accessToken &&
    typeof s.refreshToken==='string' && !!s.refreshToken && Number.isFinite(s.expiresAt);
  function read() {
    if (persistent) {
      try {
        const raw = storage.getItem(storageKey);
        let saved;
        try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
        memory = valid(saved) ? saved : null;
        if(memory){
          let location;
          try { location=JSON.parse(storage.getItem(locationKey(memory.sessionId))||'null'); } catch {}
          if(location && typeof location.store==='string' && typeof location.view==='string')memory={...memory,store:location.store,view:location.view};
        }
      } catch { persistent = false; }
    }
    return memory ? {...memory} : null;
  }
  function write(value) {
    memory = value;
    if (persistent) {
      try {
        storage.setItem(storageKey,JSON.stringify(value));
        // Restricted/private browsers can silently refuse writes.
        if (storage.getItem(storageKey)!==JSON.stringify(value)) persistent=false;
      } catch { persistent=false; }
    }
    return {...value};
  }
  function clear(expectedId) {
    const current=read();
    if(expectedId && current?.sessionId!==expectedId)return false;
    memory=null;
    try { storage?.removeItem(storageKey);if(current)storage?.removeItem(locationKey(current.sessionId)); } catch { persistent=false; }
    return true;
  }
  function fromResponse(data,previous) {
    if(typeof data.access_token!=='string' || !data.access_token || typeof data.refresh_token!=='string' || !data.refresh_token || typeof data.user?.id!=='string' || !data.user.id ||
      !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in)<=0) throw Error('Respons sesi tidak lengkap. Coba lagi.');
    if(previous && data.user.id!==previous.userId)throw changed();
    return {version:1,url,sessionId:previous?.sessionId || globalThis.crypto?.randomUUID?.() || `${now()}-${Math.random()}`,
      userId:data.user.id,accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:now()+Number(data.expires_in)*1000,
      store:previous?.store || '',view:previous?.view || ''};
  }
  function save(data) { return write(fromResponse(data)); }
  function location(expectedId,store,view) {
    const current=read();
    if(current?.sessionId!==expectedId)return;
    if(current.store===store && current.view===view)return;
    // UI preference writes must never overwrite credentials rotated in another tab.
    memory={...current,store,view};
    if(persistent){try{storage.setItem(locationKey(expectedId),JSON.stringify({store,view}));}catch{persistent=false;}}
  }
  function requireSession(expectedId) {
    const current=read();
    if(!current || (expectedId && current.sessionId!==expectedId))throw changed();
    return current;
  }
  async function accessToken(expectedId,{force=false,rejectedToken=''}={}) {
    const current=requireSession(expectedId);
    const usable=s=>s.expiresAt>now()+60000 && (!force || s.accessToken!==rejectedToken);
    if(usable(current))return current.accessToken;
    if(!pending) {
      const renew=async()=>{
        const before=requireSession(expectedId);
        if(usable(before))return before.accessToken;
        const response=await fetcher(url+'/auth/v1/token?grant_type=refresh_token',{
          method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
          body:JSON.stringify({refresh_token:before.refreshToken}),signal:AbortSignal.timeout(15000),
        });
        const data=await response.json().catch(()=>({}));
        const latest=requireSession(expectedId);
        // A late response must not resurrect logout or overwrite another login.
        if(latest.refreshToken!==before.refreshToken)return latest.accessToken;
        if(!response.ok) {
          const expired=[400,401,403].includes(response.status);
          if(expired)clear(expectedId);
          throw Object.assign(Error(expired?'Sesi sudah berakhir. Silakan masuk kembali.':'Sesi belum dapat diperbarui. Periksa koneksi lalu coba lagi.'),{authExpired:expired,status:response.status});
        }
        return write(fromResponse(data,latest)).accessToken;
      };
      pending=(locks?.request ? locks.request(storageKey,{signal:AbortSignal.timeout(20000)},renew) : renew()).finally(()=>{pending=null;});
    }
    await pending;
    return requireSession(expectedId).accessToken;
  }
  return {storageKey,read,save,clear,location,accessToken,get persistent(){return persistent;}};
}
