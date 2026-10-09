import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {dummyPhotoKey,dummyProductPhoto,productPhoto} from '../pos/product-photos.mjs';
import {productDialog} from '../pos/product-dialog.mjs';
import {emptyState} from '../pos/core.mjs';
import {FormDataAdapter,makeModal} from './variant-dom.mjs';

const raw=`gula merah|mutiara raw|skm dairy champ|beras ketan putih|nutrijel bubuk cincau|nutrijel bubuk plain|nutrijel bubuk melon|nutrijel bubuk kelapa|uht full cream|tepung beras rosebrand|tepung tapioka pak tani|gula halus claris|caramel sauce|strawberry squash raw|santan kara|milk powder|taro cream powder|matcha powder|cheese macchiato powder|gula pasir|teh celup|kopi kapal api|krimer bubuk|kapur sirih|selasih raw|keju parut|pandan|air galon|es kristal`.split('|');
const varieties=`Monthong|Bawor|Musang King Fresh|Musang King Nitrogen|Black Thorn Fresh|Black Thorn Nitrogen|Super Tembaga|Cumasi|Masmuar|Mimang|Petruk|Matahari|Lokal Mentega|Lokal Super|Lokal Premium`.split('|');
const fruits=varieties.flatMap(name=>[`Durian ${name}`,`Durpas ${name} 500 gr`,`Durpas ${name} 1 kg`,`Coral ${name}`,`Daging Durian ${name}`]);
const sql=readFileSync(new URL('../database/seeds/menu-serving-seed.sql',import.meta.url),'utf8');
const seeded=[...sql.matchAll(/insert into public\.md_pos_products\s*\([^;]+?values \('[^']+','([^']+)'/g)].map(match=>match[1]);
const menu=JSON.parse(readFileSync(new URL('../menu/menu.json',import.meta.url),'utf8'));
const names=[...raw,...fruits,...seeded,...menu.products.map(p=>p.name)];
for(const name of names){
  const photo=dummyProductPhoto({name});
  assert(photo,`${name} needs a suitable fallback`);
  assert(existsSync(new URL(photo)),`${name} photo must ship in the patch`);
}
const pairs=[['mutiara raw','sago-raw'],['mutiara','sago-cooked'],['matcha powder','matcha-powder'],['matcha original','matcha-drink'],['Durian Musang King Fresh','durian'],['Durpas Musang King Fresh 500gr','durpas'],['Coral Musang King Fresh','coral'],['Daging Durian Musang King Fresh','daging']];
for(const [name,key] of pairs)assert.equal(dummyPhotoKey({name}),key);
assert.equal(dummyPhotoKey({name:'Stok baru',durianOutput:'durpas500'}),'durpas');
assert.equal(dummyPhotoKey({name:'500 gr',variantGroupName:'Durpas'}),'durpas');
assert.equal(dummyPhotoKey({name:'Bahan tidak dikenal',category:'Bahan Baku'}),'');
assert.equal(productPhoto({name:'Durian Bawor',photo:'data:image/png;base64,AAAA'}),'data:image/png;base64,AAAA');
const product=Object.freeze({name:'Gula pasir',photo:'',salePrice:10000,buyPrice:7000});
assert.match(productPhoto(product),/sugar\.webp$/);
assert.equal(product.photo,'','Fallback selection cannot change stored product data');
const assetDir=new URL('../pos/assets/dummy-products/',import.meta.url);
const photos=readdirSync(assetDir).filter(name=>name.endsWith('.webp'));
assert.equal(photos.length,48);
assert(photos.reduce((bytes,name)=>bytes+statSync(new URL(name,assetDir)).size,0)<1000000,'All thumbnails combined stay under 1 MB');

// The editor may preview a static fallback, but saving must preserve the upload-only photo contract.
const modal=makeModal(),posted=[];
const state={...emptyState(),opsVersion:19,stores:[{id:'outlet',name:'Outlet A'}]};
const ctx={state,store:'outlet',modal:modal.modal,mutate:async(action,payload)=>{posted.push({action,payload});return true;},render(){},toast(){}};
const original=globalThis.FormData;globalThis.FormData=FormDataAdapter;
try{
  productDialog(ctx);
  const d=modal.latest,f=d.querySelector('form'),c=name=>f.elements.namedItem(name);
  c('name').value='Gula pasir';await c('name').fire('input');
  c('sku').value='BB-GULA';
  c('itemType').value='raw';await c('itemType').fire('change');
  c('stockUnit').value='g';await c('stockUnit').fire('change');
  assert.match(d.querySelector('#photo-preview').src,/sugar\.webp$/);
  assert.match(d.querySelector('#photo-dummy-note').textContent,/Foto dummy otomatis/);
  await f.fire('submit');
  assert.equal(posted.length,1,d.querySelector('#form-error').textContent);
  assert.equal(posted[0].payload.photo,'','Saving cannot send a dummy URL to the database');
}finally{globalThis.FormData=original;}
console.log(`PASS dummy photos: ${names.length} catalogue/seed/raw names, existing-photo priority, appropriate type mapping, lightweight local assets and no dummy URLs in saved data.`);
