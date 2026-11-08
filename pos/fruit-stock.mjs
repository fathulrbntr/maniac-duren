import {parseTrackingBarcode,trackedFruit} from './scale-label.mjs';

export const fruitLot=(state,lotId)=>(state.lots||[]).find(l=>l.id===lotId);
const active=u=>['available','reject'].includes(u.status);
export function stockScanCandidate(state,code,store,lotId,states){
 const parsed=parseTrackingBarcode(code);
 if(!parsed)throw Error('Gunakan label tracking buah 26 digit dengan awalan 92.');
 const known=state.fruitUnits?.find(u=>u.barcode===code);
 if(known)return {...trackedFruit(state,code,store,states),pendingLink:false};
 if(state.fruitUnits?.some(u=>u.barcode.slice(0,16)===parsed.identity))throw Error('Nomor label sudah tercatat dengan isi berbeda. Cetak label baru.');
 if(!(state.fruitStockVersion>=105))throw Error('Barcode belum tercatat pada penerimaan. Perbarui fitur stok barcode sebelum menautkan stok lama.');
 const lot=fruitLot(state,lotId),products=(state.products||[]).filter(p=>String(p.barcode||'').trim()===parsed.itemCode);
 if(products.length!==1||products[0].stockUnit!=='kg_butir')throw Error('Kode barang '+parsed.itemCode+' belum dipetakan tepat di Master Barang.');
 if(!lot||lot.storeId!==store||lot.productId!==products[0].id)throw Error('Pilih batch asal '+products[0].name+' yang sesuai label ini.');
 const status=lot.quality==='reject'?'reject':'available';
 if(!['ready','unripe','reject'].includes(lot.quality)||!states.includes(status))throw Error('Status batch tidak sesuai tindakan ini.');
 return {barcode:code,grams:parsed.grams,productId:lot.productId,lotId:lot.id,storeId:store,status,pendingLink:true};
}
export function checkFruitStockSelection(state,lotId,units){
 const lot=fruitLot(state,lotId);
 if(!lot||!units.length)throw Error('Scan minimal satu barcode buah.');
 if(units.some(u=>u.lotId!==lotId))throw Error('Proses satu batch per pencatatan. Simpan batch ini sebelum memindai batch lain.');
 if(new Set(units.map(u=>u.barcode.slice(0,16))).size!==units.length)throw Error('Barcode buah sudah ada dalam daftar.');
 const kg=units.reduce((n,u)=>n+u.grams,0)/1000,pieces=units.length;
 if(kg>Number(lot.kg)+1e-8||pieces>Number(lot.pieces))throw Error('Hasil scan melebihi sisa stok batch. Perbarui stok dan periksa label.');
 if((Math.abs(Number(lot.kg)-kg)<1e-8)!==(Number(lot.pieces)===pieces))throw Error('Sisa kg dan butir batch tidak seimbang. Periksa selisih timbang sebelum melanjutkan.');
 const linked=(state.fruitUnits||[]).filter(u=>u.lotId===lotId&&active(u)),fresh=units.filter(u=>u.pendingLink);
 if(fresh.length){
  const reservedKg=(linked.reduce((n,u)=>n+u.grams,0)+fresh.reduce((n,u)=>n+u.grams,0))/1000,reservedPieces=linked.length+fresh.length;
  if(reservedKg>Number(lot.kg)+1e-8||reservedPieces>Number(lot.pieces))throw Error('Sisa stok yang belum tertaut label tidak cukup. Periksa batch asal.');
  if((Math.abs(Number(lot.kg)-reservedKg)<1e-8)!==(Number(lot.pieces)===reservedPieces))throw Error('Berat label dan sisa butir yang belum tertaut tidak seimbang. Periksa batch asal.');
 }
 return {fruitStockMode:'barcode',barcodes:units.map(u=>u.barcode),linkBarcodes:fresh.map(u=>u.barcode),kg,pieces};
}
