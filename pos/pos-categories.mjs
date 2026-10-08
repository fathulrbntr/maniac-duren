const defaults=[['b100b11f-4af2-ef03-19c8-9f8e8ae80233','Buah'],['5aa31598-4ca1-77b9-0ae7-412fd3c2d2ec','Durpas'],['f77d427f-63a9-e975-cfc2-8815e1ec1889','Coral'],['3277f318-03d0-caca-3422-1285f413fbc5','Makan'],['e13c2d41-d4da-7345-3206-9372e035a962','Minuman'],['87a7e78c-fe78-3a3e-6958-dde47bbda51b','Dessert']];
export const defaultPosCategories=()=>defaults.map(([id,name],sortOrder)=>({id,name,sortOrder,version:1}));
export const categoryEligible=p=>['direct','finished','recipe'].includes(p.itemType||'direct');
export const posSellable=p=>categoryEligible(p)&&((p.salePrice??0)>0||p.stockUnit==='kg_butir');
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
export const posCategoryId=(s,p)=>Array.isArray(s.posCategories)?p.posCategoryId||null:inferredCategoryId(p);
export const posCategoryName=(s,p)=>posCategories(s).find(c=>c.id===posCategoryId(s,p))?.name||'Belum dikategorikan';
export function categoryName(value){const name=String(value??'').trim().replace(/\s+/g,' ');if(!name||name.length>50)throw Error('Nama kategori wajib, maksimal 50 karakter.');if(['semua','belum dikategorikan'].includes(name.toLowerCase()))throw Error('Gunakan nama kategori lain.');return name;}
export function categoryPayload(s,{id,categoryId,name,productIds}){
 name=categoryName(name);
 const categories=posCategories(s),category=categories.find(c=>c.id===categoryId);
 if(categories.some(c=>c.id!==categoryId&&c.name.toLowerCase()===name.toLowerCase()))throw Error('Nama kategori sudah digunakan.');
 const ids=[...new Set(productIds)].sort();if(ids.length>5000)throw Error('Maksimal 5.000 produk dalam satu kategori.');
 for(const id of ids){const p=s.products.find(p=>p.id===id);if(!p||!categoryEligible(p))throw Error('Pilih produk jual dari Master Barang.');}
 const selected=new Set(ids);
 const expectedAssignments=s.products.filter(p=>selected.has(p.id)||posCategoryId(s,p)===categoryId).map(p=>({id:p.id,categoryId:posCategoryId(s,p)})).sort((a,b)=>a.id.localeCompare(b.id));
 return {id,categoryId,name,expectedVersion:category?.version||0,productIds:ids,expectedAssignments};
}
export function savePosCategory(s,p){
 if((s.events||[]).some(e=>e.id===p.id&&e.action==='pos_category_save'))return;
 if(!Array.isArray(s.posCategories)){s.posCategories=defaultPosCategories();s.products.forEach(x=>x.posCategoryId=inferredCategoryId(x));}
 const expected=categoryPayload(s,p);
 if(JSON.stringify(expected)!==JSON.stringify(p))throw Error('Kategori atau pilihan produk sudah berubah. Perbarui data.');
 let category=s.posCategories.find(c=>c.id===p.categoryId);
 if(!category){category={id:p.categoryId,name:p.name,version:1,sortOrder:Math.max(-1,...s.posCategories.map(c=>c.sortOrder))+1};s.posCategories.push(category);}
 const ids=new Set(p.productIds),affected=new Set([p.categoryId]);
 for(const product of s.products)if(ids.has(product.id)||product.posCategoryId===p.categoryId){if(product.posCategoryId)affected.add(product.posCategoryId);product.posCategoryId=ids.has(product.id)?p.categoryId:null;}
 category.name=p.name;s.posCategories.forEach(c=>{if(affected.has(c.id))c.version++;});
 (s.events||=[]).push({id:p.id,action:'pos_category_save'});
}
// Stock-only polling updates availability without recreating product cards/images.
export function menuCatalogChanged(before,after){
 const a=posCategories(before),b=posCategories(after);
 if(a.length!==b.length||a.some((c,i)=>['id','name','sortOrder','version'].some(k=>c[k]!==b[i]?.[k])))return true;
 if(before.products.length!==after.products.length)return true;
 const prior=new Map(before.products.map(p=>[p.id,p]));
 const keys=['name','sku','barcode','variant','itemType','stockUnit','category','posCategoryId','durianOutput','salePrice','priceKg','pricePiece','photo'];
 return after.products.some(p=>{const old=prior.get(p.id);return !old||keys.some(k=>old[k]!==p[k]);});
}
