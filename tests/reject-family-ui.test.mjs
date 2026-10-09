import assert from 'node:assert/strict';
import { wasteOutputProducts } from '../pos/waste-products.mjs';
import { wastePage } from '../pos/waste-ui.mjs';
import { wastePlan } from '../pos/waste.mjs';
import { today } from '../pos/core.mjs';
const date=today();
const s={products:[],lots:[],unitLots:[],wasteRuns:[],stores:[{id:'A',name:'Outlet A'}],suppliers:[{id:'supplier',name:'Supplier'}]};
for(const [id,name] of [['mk','Musang King Fresh'],['nitrogen','Musang King Nitrogen'],['monthong','Monthong']]) {
  s.products.push({id,name:'Durian '+name,itemType:'direct',stockUnit:'kg_butir',category:'Buah'});
  for(const [key,label,unit] of [['durpas500','Durpas 500 gr','pcs'],['durpas1000','Durpas 1 kg','pcs'],['coral','Coral','kg']])
    s.products.push({id:id+'-'+key,name:label+' '+name,itemType:'finished',stockUnit:unit,category:'Olahan Duren',durianSourceId:id,durianOutput:key});
  s.lots.push({id:id+'-lot',storeId:'A',supplierId:'supplier',productId:id,date,kg:100,pieces:40,quality:'ready'});
}
const image='data:image/png;base64,iVBORw0KGgo=';
const payload=source=>({id:'run',storeId:'A',sourceLotId:source+'-lot',receivedDate:date,date,processedBy:'Tester',kg:10,pieces:4,reason:'Sortasi',evidence:{reject:image,durpas500:image,durpas1000:image,coral:image},outputs:[['durpas500',4],['durpas1000',2],['coral',1]].map(([key,qty])=>({key,qty,productId:source+'-'+key,lotId:'result-'+key}))});
assert.equal(wastePlan(s,payload('mk')).supplierId,'supplier');
for(const other of ['nitrogen','monthong']) {
  const p=payload('mk');p.outputs[2].productId=other+'-coral';
  assert.throws(()=>wastePlan(s,p),/berbeda dari turunan/);
}
const missing=structuredClone(s);missing.products=missing.products.filter(p=>p.id!=='mk-coral');
assert.match(wasteOutputProducts(missing,'mk').find(p=>p.key==='coral').error,/belum dihubungkan/);
const duplicate=structuredClone(s);duplicate.products.push({...duplicate.products.find(p=>p.id==='mk-coral'),id:'duplicate'});
assert.match(wasteOutputProducts(duplicate,'mk').find(p=>p.key==='coral').error,/ganda/);
const renamed=structuredClone(s);renamed.products.forEach(p=>p.name='Nama baru '+p.id);
assert.equal(wasteOutputProducts(renamed,'mk')[0].product.id,'mk-durpas500');
const markup=wastePage(s,'A');
assert(markup.includes('Reject & Waste'));assert(markup.includes('063 belum terpasang'));
// Form interaction coverage moved to reject-flow-ui.test.mjs with the unified UI.
console.log('PASS reject family mapping: exact source IDs, Fresh/Nitrogen isolation, missing/duplicate links, rename-safe lookup, and migration gate.');
