export function spacesFor(state){
 if(!state.warehouseVersion)return [];
 const spaces=[];
 if(state.access?.backoffice)spaces.push('backoffice');
 if(state.stores.some(x=>x.locationType==='warehouse'))spaces.push('warehouse');
 if(state.stores.some(x=>x.locationType!=='warehouse'))spaces.push('store');
 return spaces;
}
export const spaceTitles={backoffice:'Back office',warehouse:'Gudang',store:'Toko'};
export function defaultSpace(s){return s.access?.backoffice?'backoffice':s.stores.some(x=>x.locationType==='warehouse')?'warehouse':'store';}
export function workspaceGroups(a){
 const all=a.backoffice,groups=a.workspace==='backoffice'?[
  {id:'central',label:'Back office',pages:['backoffice','dashboard','pricing','supplierNotes','transfers','reports','documents']},
  {id:'masters',label:'Data & administrasi',pages:['products','recipes','suppliers','stores','employees','payments','discounts','crm']},
 ]:a.workspace==='warehouse'?[
  {id:'warehouse',label:'Gudang pusat',pages:['warehouse','supplierNotes','stock','transfers','waste','reports']},
 ]:[
  {id:'store',label:'Operasional toko',pages:['storehome','receiving','stock']},
  {id:'service',label:'Waitress',pages:['service']},
  {id:'cashier',label:'Kasir',pages:['shifts','orders']},
  {id:'kitchen',label:'Kitchen',pages:['kitchen','production']},
  {id:'cutter',label:'Tukang potong',pages:['cutting','waste']},
  {id:'store_reports',label:'Laporan toko',pages:['reports']},
 ];
 const allowed={backoffice:all,dashboard:all,pricing:all,supplierNotes:all||a.stock,transfers:all||a.dispatch,warehouse:all||a.stock,storehome:true,receiving:a.receive,service:a.serve,cutting:a.cut,
 stock:a.stock||a.produce||a.receive,shifts:a.sell,orders:a.sell,kitchen:a.kitchen,production:a.produce,waste:a.waste,reports:a.reports||a.trace,documents:all,products:all,recipes:all,suppliers:all,stores:all,employees:a.employees,payments:a.cashierOwner,discounts:a.cashierOwner,crm:a.crmAdmin,attendance:a.attendance,guide:true,devices:a.sell||a.stock||all};
 return [...groups,{id:'common',label:'Akun & perangkat',pages:['attendance','devices','guide']}].map(g=>({...g,pages:g.pages.filter(p=>allowed[p])})).filter(g=>g.pages.length);
}
