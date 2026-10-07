// Session memory only: no credentials or business data are persisted by this cache.
const servicePages=new Set(['orders','kitchen']);
export const pageScope=(page,branch)=>servicePages.has(page)?`service:${branch}`:'full';
export function createPageCache(fetchPage,{now=Date.now,maxAge=15000}={}){
 const entries=new Map(),pending=new Map();let epoch=0,sequence=0;
 const keyFor=(page,branch)=>pageScope(page,branch);
 const entry=(page,branch)=>{
  const full=entries.get('full'),scoped=entries.get(keyFor(page,branch));
  if(!servicePages.has(page))return full;
  return !scoped?full:!full?scoped:scoped.sequence>full.sequence?scoped:full;
 };
 const put=(page,branch,data)=>{entries.set(keyFor(page,branch),{data,at:now(),sequence:++sequence});return data;};
 return {
  peek:(page,branch)=>entry(page,branch)?.data,
  put,
  invalidate(){epoch++;pending.clear();for(const row of entries.values())row.at=-Infinity;},
  reset(){epoch++;entries.clear();pending.clear();},
  async load(page,branch,{force=false}={}){
   const row=entry(page,branch);
   if(!force&&row&&now()-row.at<maxAge)return row.data;
   const key=keyFor(page,branch);
   if(pending.has(key))return pending.get(key);
   const generation=epoch;
   const promise=Promise.resolve().then(()=>fetchPage(page,branch)).then(data=>{
    if(generation!==epoch)return null;
    return put(page,branch,data);
   }).finally(()=>{if(pending.get(key)===promise)pending.delete(key)});
   pending.set(key,promise);return promise;
  }
 };
}
export const mayApplyPage=(expected,current)=>expected.revision===current.revision&&expected.page===current.page&&expected.branch===current.branch&&current.live&&!current.busy;
