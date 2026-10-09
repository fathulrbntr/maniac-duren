// Local catalogue illustrations only. Never copy fallback URLs into product.photo
// or into a database payload. An uploaded product photo always takes precedence.
const normalized=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/durian/g,'duren').replace(/[^a-z0-9]+/g,' ').trim();
const aliases=new Map();
const add=(key,names)=>names.forEach(name=>aliases.set(normalized(name),key));
add('brown-sugar',['gula merah','gula aren','gulmer']);
add('sago-raw',['mutiara raw','sagu mutiara raw','sagu mutiara mentah']);
add('condensed-milk',['skm dairy champ','skm','susu kental manis']);
add('rice',['beras ketan putih','beras ketan']);
add('white-powder',['nutrijel bubuk cincau','nutrijel bubuk plain','nutrijel bubuk melon','nutrijel bubuk kelapa','nutrijel melon','nutrijel cincau','nutrijel plain','nutrijel kelapa','tepung beras rosebrand','tepung beras','tepung tapioka pak tani','tepung tapioka','gula halus claris','gula halus','milk powder','susu bubuk','cheese macchiato powder','krimer bubuk','krimer','kapur sirih']);
add('milk',['uht full cream','susu uht full cream','susu uht','santan kara','santan','santan air']);
add('brown-syrup',['caramel sauce','saus karamel','gulmer cair','gula merah cair','gula aren cair']);
add('strawberry-syrup',['strawberry squash raw','strawberry squash','sirup strawberry']);
add('taro-powder',['taro cream powder','taro powder','bubuk taro']);
add('matcha-powder',['matcha powder','matcha','bubuk matcha']);
add('sugar',['gula pasir']);
add('tea',['teh celup','teh']);
add('coffee',['kopi kapal api','kopi bubuk']);
add('seeds',['selasih raw','selasih','biji selasih']);
add('cheese',['keju parut','keju']);
add('pandan',['pandan','daun pandan']);
add('water',['air galon','air']);
add('ice',['es kristal','es batu']);
add('jelly-green',['jelly melon','jeli melon']);
add('jelly-black',['jelly cincau','jeli cincau','cincau']);
add('jelly-white',['jelly kelapa','jelly plain','jelly kelapa kelapa fresh','kelapa fresh']);
add('sago-cooked',['mutiara','sagu mutiara','mutiara matang']);
add('nangka',['nangka','daging nangka']);
add('cendol',['cendol','dawet']);
add('sticky-rice',['ketan','ketan putih','ketan polos']);
add('crystaline',['crystaline','crystalline','air mineral crystaline','air mineral crystalline','air mineral']);
add('es-teler-durian',['es teler duren']);
add('es-teler-original',['es teler original']);
add('es-dawet-ketan-durian',['es dawet duren ketan','es dawet ketan duren']);
add('es-dawet-durian',['es dawet duren']);
add('es-dawet-original',['es dawet original']);
add('es-cendol-durian',['cendol duren','es cendol duren']);
add('es-cendol-original',['cendol original','es cendol original']);
add('es-cendol-nangka-durian',['es cendol nangka duren','cendol nangka duren']);
add('ketan-durian',['ketan duren original','ketan duren']);
add('ketan-durian-keju',['ketan duren keju']);
add('ketan-pandan-durian-original',['ketan pandan duren original','ketan pandan duren']);
add('ketan-pandan-durian-keju',['ketan pandan duren keju']);
add('ketan-ube-durian-original',['ketan ube duren original','ketan ube duren']);
add('ketan-ube-durian-keju',['ketan ube duren keju']);
add('sop-durian',['sop duren','sop duren original','sop duren keju','es duren']);
add('matcha-drink',['matcha original','es matcha','matcha latte']);
add('matcha-durian',['matcha duren','es matcha duren']);
add('pancake',['pancake','pancake duren','pancake durian mini']);

export function dummyPhotoKey(product={}) {
  // Exact source/output links are more reliable than a family display name.
  const linked={durpas500:'durpas',durpas1000:'durpas',coral:'coral',daging:'daging'}[product.durianOutput];
  if(linked)return linked;
  const name=normalized(product.name),group=normalized(product.variantGroupName);
  if(/^(durpas|duren kupas)( |$)/.test(name))return 'durpas';
  if(/^coral( |$)/.test(name))return 'coral';
  if(/^daging duren( |$)/.test(name))return 'daging';
  if(product.stockUnit==='kg_butir'||/^duren( |$)/.test(name))return 'durian';
  const exact=aliases.get(name)||aliases.get(group);if(exact)return exact;
  if(/^(durpas|duren kupas)( |$)/.test(group))return 'durpas';
  if(/^coral( |$)/.test(group))return 'coral';
  if(/^daging duren( |$)/.test(group))return 'daging';
  if(/^duren( |$)/.test(group))return 'durian';
  // Match known pack sizes without classifying arbitrary new products by category.
  const unpacked=name.replace(/ \d+(?: \d+)? (?:gr|gram|g|kg|ml|liter|l|pcs|porsi)$/, '');
  return aliases.get(unpacked)||'';
}
export function dummyProductPhoto(product) {
  const key=dummyPhotoKey(product);
  return key?new URL(`./assets/dummy-products/${key}.webp`,import.meta.url).href:'';
}
export const productPhoto=product=>String(product?.photo||'').trim()||dummyProductPhoto(product);
