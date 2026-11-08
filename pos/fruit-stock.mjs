import {parseTrackingBarcode,trackedFruit} from './scale-label.mjs';

export const fruitLot=(state,lotId)=>(state.lots||[]).find(l=>l.id===lotId);
export function stockScanCandidate(state,code,store,lotId,states){
 const parsed=parseTrackingBarcode(code);
 if(!parsed)throw Error('Gunakan label tracking buah 26 digit dengan awalan 92.');
 const known=state.fruitUnits?.find(u=>u.barcode===code);
 if(!known)throw Error('Barcode belum tercatat pada batch penerimaan. Periksa pencatatan Barang masuk; barcode tidak dapat ditambahkan di sini.');
 const unit=trackedFruit(state,code,store,states),lot=fruitLot(state,lotId);
 if(!lot||unit.lotId!==lotId)throw Error('Barcode bukan milik batch yang dipilih. Pilih batch asal yang benar; batch tidak diganti otomatis.');
 if(lot.storeId!==store||unit.productId!==lot.productId)throw Error('Produk atau outlet barcode tidak sesuai batch asal.');
 return {...unit};
}
export function checkFruitStockSelection(state,lotId,units){
 const lot=fruitLot(state,lotId);
 if(!lot||!units.length)throw Error('Scan minimal satu barcode buah.');
 const checked=units.map(u=>{
  const known=stockScanCandidate(state,u.barcode,lot.storeId,lotId,['available','reject']);
  if(u.lotId!==lotId||u.grams!==known.grams||u.productId!==known.productId)throw Error('Batch dan berat harus sesuai barcode terdaftar.');
  return known;
 });
 if(new Set(checked.map(u=>u.barcode.slice(0,16))).size!==checked.length)throw Error('Barcode buah sudah ada dalam daftar.');
 const kg=checked.reduce((n,u)=>n+u.grams,0)/1000,pieces=checked.length;
 if(kg>Number(lot.kg)+1e-8||pieces>Number(lot.pieces))throw Error('Hasil scan melebihi sisa stok batch. Perbarui stok dan periksa label.');
 if((Math.abs(Number(lot.kg)-kg)<1e-8)!==(Number(lot.pieces)===pieces))throw Error('Sisa kg dan butir batch tidak seimbang. Periksa selisih timbang sebelum melanjutkan.');
 return {fruitStockMode:'barcode',barcodes:checked.map(u=>u.barcode),kg,pieces};
}
