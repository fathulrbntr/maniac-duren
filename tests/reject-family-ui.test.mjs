import assert from 'node:assert/strict';
import { wasteOutputProducts } from '../pos/waste-products.mjs';
import { wastePage, bindWaste } from '../pos/waste-ui.mjs';
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
assert(markup.includes('Produk hasil otomatis'));assert(!markup.includes('<select class="sr-only"'));
assert(markup.includes('Wajib jika hasil lebih dari 0'));

// Exercise the actual form handlers with a small DOM adapter (not a browser screenshot).
class Control {
  value='';title='';textContent='';dataset={};files=[];
  classList={toggle(){}};
  set innerHTML(v){this.markup=v;this.value='';}
  get innerHTML(){return this.markup||'';}
}
const names=['receivedDate','sourceProductId','sourceLotId','date','processedBy','kg','pieces','reason',...['durpas500','durpas1000','coral'].flatMap(k=>[k+'_productId',k+'_productName',k+'_qty'])];
const fields=Object.fromEntries(names.map(n=>[n,new Control()]));
const proofKeys=['reject','durpas500','durpas1000','coral'];
const files=Object.fromEntries(proofKeys.map(k=>[k,Object.assign(new Control(),{dataset:{proofFile:k}})]));
const statuses=Object.fromEntries(proofKeys.map(k=>[k,Object.assign(new Control(),{textContent:'Wajib'})]));
const form={elements:{namedItem:n=>fields[n]},addEventListener(){},querySelectorAll:selector=>selector==='[data-proof-file]'?Object.values(files):[],querySelector:selector=>statuses[selector.match(/data-proof-status="([^"]+)"/)?.[1]]};
const ids=Object.fromEntries(['waste-products-status','waste-source-stock','waste-preview','waste-refresh','waste-error'].map(n=>['#'+n,new Control()]));
ids['#waste-form']=form;
const originals={document:globalThis.document,createImageBitmap:globalThis.createImageBitmap,FileReader:globalThis.FileReader};
globalThis.document={querySelector:selector=>ids[selector],querySelectorAll:()=>[]};
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
globalThis.FileReader=class {readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:'+blob.type+';base64,'+Buffer.from(b).toString('base64');this.onload();});}};
const file=new Blob([Buffer.from('89504e470d0a1a0a','hex')],{type:'image/png'});
const upload=async key=>{files[key].files=[file];await files[key].onchange({target:files[key]});};
const posted=[];
try {
  bindWaste('waste',s,'A',{mutate:async(action,p)=>{posted.push({action,p});return true;},render(){},toast(){}});
  fields.receivedDate.value=date;fields.receivedDate.onchange();
  fields.sourceProductId.value='mk';fields.sourceProductId.onchange();
  assert.equal(fields.sourceLotId.value,'mk-lot');
  assert.equal(fields.durpas500_productId.value,'mk-durpas500');
  assert.match(fields.durpas500_productName.value,/Musang King Fresh/);
  fields.kg.value='10';fields.pieces.value='4';fields.coral_qty.value='1';
  await upload('reject');await upload('coral');
  assert.match(statuses.reject.textContent,/Foto siap/,'Initial reject proof is now captured');
  fields.sourceProductId.value='nitrogen';fields.sourceProductId.onchange();
  assert.equal(fields.coral_productId.value,'nitrogen-coral');assert.match(fields.coral_productName.value,/Nitrogen/);
  assert.equal(fields.coral_qty.value,'0');assert.equal(fields.kg.value,'');assert.equal(statuses.reject.textContent,'Wajib');
  fields.kg.value='10';fields.pieces.value='4';fields.processedBy.value='Tester';fields.reason.value='Sortasi';
  fields.coral_qty.value='1';
  await form.onsubmit({preventDefault(){}});assert.equal(posted.length,0);assert.match(ids['#waste-error'].textContent,/Foto reject/);
  for(const key of ['reject','coral'])await upload(key);
  await form.onsubmit({preventDefault(){}});assert.equal(posted.length,1);
  assert.equal(posted[0].p.sourceLotId,'nitrogen-lot');assert.equal(posted[0].p.outputs.find(o=>o.key==='coral').productId,'nitrogen-coral');
  assert.equal(posted[0].p.evidence.reject,image);
  // A file finishing after changing fruit must not restore proof from the old batch.
  let resolveBitmap;
  globalThis.createImageBitmap=()=>new Promise(resolve=>resolveBitmap=resolve);
  files.reject.files=[file];const pending=files.reject.onchange({target:files.reject});
  fields.sourceProductId.value='monthong';fields.sourceProductId.onchange();
  resolveBitmap({width:1,height:1,close(){}});await pending;
  assert.equal(statuses.reject.textContent,'Wajib');
  fields.kg.value='10';fields.pieces.value='4';fields.coral_qty.value='1';
  await form.onsubmit({preventDefault(){}});assert.equal(posted.length,1);assert.match(ids['#waste-error'].textContent,/Foto reject/);
  console.log('PASS: specific source outputs, cross-family guard, missing/duplicate links, rename-safe IDs, actual form switching, quantities/proofs reset, reject upload, async photo isolation and submitted IDs.');
} finally {Object.assign(globalThis,originals);}
