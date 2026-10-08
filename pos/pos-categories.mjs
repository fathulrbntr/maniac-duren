import {menuStatus} from './order-stock.mjs?v=12';
const defaults=[['b100b11f-4af2-ef03-19c8-9f8e8ae80233','Buah'],['5aa31598-4ca1-77b9-0ae7-412fd3c2d2ec','Durpas'],['f77d427f-63a9-e975-cfc2-8815e1ec1889','Coral'],['3277f318-03d0-caca-3422-1285f413fbc5','Makan'],['e13c2d41-d4da-7345-3206-9372e035a962','Minuman'],['87a7e78c-fe78-3a3e-6958-dde47bbda51b','Dessert']];
export const defaultPosCategories=()=>defaults.map(([id,name],sortOrder)=>({id,name,sortOrder,version:1}));
export const categoryEligible=p=>['direct','finished','recipe'].includes(p.itemType||'direct');
// Semua includes every saleable master product. Categories only filter this catalog.
// Price and stock only control ordering.
export const posVisible=categoryEligible;
export const hasPosPrice=p=>Number.isFinite(Number(p.salePrice))&&Number(p.salePrice)>0;
export function posProductStatus(state,store,product,draft,date){
 if(product.stockUnit!=='kg_butir'&&!hasPosPrice(product))return {ok:false,reason:'Harga jual belum diisi'};
 return menuStatus(state,store,product,draft,date);
}
export function inferredCategoryId(p){
 let name='';
 if(!categoryEligible(p))return null;
 if(p.durianOutput?.startsWith('durpas')||/^(durpas|durian kupas)(\s|$)/i.test(p.name))name='Durpas';
 else if(p.durianOutput==='coral'||/^coral(\s|$)/i.test(p.name))name='Coral';
 else if(p.stockUnit==='kg_butir'||p.category==='Buah')name='Buah';
 else if(['Makan','Makanan'].includes(p.category))name='Makan';
 else if(['Minuman','Dessert'].includes(p.category))name=p.category;
 return defaults.find(x=>x[1]===name)?.[0]||null;
}
export const posCategories=s=>(Array.isArray(s.posCategories)?s.posCategories:defaultPosCategories()).slice().sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'id'));
// Explicit empty membership must not fall back to the obsolete single category.
export const posCategoryIds=(s,p)=>Array.isArray(p.posCategoryIds)?p.posCategoryIds:Array.isArray(s.posCategories)?(p.posCategoryId?[p.posCategoryId]:[]):[inferredCategoryId(p)].filter(Boolean);
export const inPosCategory=(s,p,id)=>posCategoryIds(s,p).includes(id);
export const posCategoryName=(s,p)=>posCategories(s).filter(c=>inPosCategory(s,p,c.id)).map(c=>c.name).join(' · ')||'Semua';
export function categoryName(value){const name=String(value??'').trim().replace(/\s+/g,' ');if(!name||name.length>50)throw Error('Nama kategori wajib, maksimal 50 karakter.');if(['semua','belum dikategorikan'].includes(name.toLowerCase()))throw Error('Gunakan nama kategori lain.');return name;}
export function categoryPayload(s,{id,categoryId,name,productIds=[],mode='add'}){
 name=categoryName(name);
 const categories=posCategories(s),category=categories.find(c=>c.id===categoryId);
 if(!['add','remove','rename','delete'].includes(mode)||(!category&&mode!=='add'))throw Error('Aksi kategori tidak valid.');
 if(categories.some(c=>c.id!==categoryId&&c.name.toLowerCase()===name.toLowerCase()))throw Error('Nama kategori sudah digunakan.');
 if(category&&mode!=='rename'&&name!==category.name)throw Error('Nama kategori sudah berubah. Perbarui data.');
 const ids=[...new Set(productIds)].sort();if(ids.length>5000)throw Error('Maksimal 5.000 produk sekali simpan.');
 if(mode==='rename'&&ids.length)throw Error('Ubah nama tidak mengubah pilihan produk.');
 if(mode==='delete'&&ids.length)throw Error('Hapus kategori tidak menerima pilihan produk.');
 for(const id of ids){const p=s.products.find(p=>p.id===id);if(!p||(mode==='add'&&!categoryEligible(p)))throw Error('Pilih produk jual dari Master Barang.');}
 return {id,categoryId,name,mode,expectedVersion:category?.version||0,productIds:ids};
}
export function savePosCategory(s,p){
 const prior=(s.events||[]).find(e=>e.id===p.id);
 if(prior){if(prior.action!=='pos_category_save'||JSON.stringify(prior.payload)!==JSON.stringify(p))throw Error('ID pengiriman sudah digunakan untuk data lain.');return;}
 const expected=categoryPayload(s,p);
 if(JSON.stringify(expected)!==JSON.stringify(p))throw Error('Kategori sudah berubah. Perbarui data.');
 for(const product of s.products)product.posCategoryIds=[...posCategoryIds(s,product)];
 if(!Array.isArray(s.posCategories))s.posCategories=defaultPosCategories();
 s.posCategoryMembershipVersion=2;
 let category=s.posCategories.find(c=>c.id===p.categoryId);
 if(!category){category={id:p.categoryId,name:p.name,version:1,sortOrder:Math.max(-1,...s.posCategories.map(c=>c.sortOrder))+1};s.posCategories.push(category);}
 const ids=new Set(p.productIds);
 for(const product of s.products)if(ids.has(product.id)){
  if(p.mode==='add')product.posCategoryIds=[...new Set([...product.posCategoryIds,p.categoryId])].sort();
  if(p.mode==='remove')product.posCategoryIds=product.posCategoryIds.filter(id=>id!==p.categoryId);
 }
 if(p.mode==='delete'){
  s.posCategories=s.posCategories.filter(c=>c.id!==p.categoryId);
  for(const product of s.products){
   product.posCategoryIds=product.posCategoryIds.filter(id=>id!==p.categoryId);
   if(product.posCategoryId===p.categoryId)product.posCategoryId=null;
  }
 }else{if(p.mode==='rename')category.name=p.name;category.version++;}
 (s.events||=[]).push({id:p.id,action:'pos_category_save',payload:structuredClone(p)});
}
// Stock-only polling updates availability without recreating product cards/images.
export function menuCatalogChanged(before,after){
 const a=posCategories(before),b=posCategories(after);
 if(a.length!==b.length||a.some((c,i)=>['id','name','sortOrder','version'].some(k=>c[k]!==b[i]?.[k])))return true;
 if(before.products.length!==after.products.length)return true;
 const prior=new Map(before.products.map(p=>[p.id,p]));
 const keys=['name','sku','barcode','variant','itemType','stockUnit','category','durianOutput','salePrice','priceKg','pricePiece','photo','variantGroupId','variantGroupName'];
 return after.products.some(p=>{const old=prior.get(p.id);return !old||keys.some(k=>old[k]!==p[k])||JSON.stringify(old.variantOptions)!==JSON.stringify(p.variantOptions)||posCategoryIds(before,old).join(' ')!==posCategoryIds(after,p).join(' ');});
}
