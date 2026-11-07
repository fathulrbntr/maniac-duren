// Validated on CAS CL5200: 92 + machine(2) + DDMMYY(6) + counter(6)
// + Item Code(4) + grams(6). Keep the label as text, including every zero.
export function parseTrackingBarcode(value) {
  const code=String(value ?? '');
  if(!code.startsWith('92'))return null;
  if(!/^92\d{24}$/.test(code))throw Error('Label tracking harus lengkap 26 digit dengan awalan 92.');
  const machineId=code.slice(2,4), date=code.slice(4,10);
  const day=Number(date.slice(0,2)),month=Number(date.slice(2,4)),year=2000+Number(date.slice(4));
  const parsed=new Date(Date.UTC(year,month-1,day));
  if(parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)
    throw Error('Tanggal pada barcode timbangan tidak valid. Periksa tanggal mesin.');
  const grams=Number(code.slice(20,26));
  if(grams<=0||grams>30000)throw Error('Berat label harus lebih dari 0 dan maksimal 30 kg untuk CAS CL5200-30B.');
  return {barcode:code,tracking:true,machineId,packedDate:parsed.toISOString().slice(0,10),sequence:code.slice(10,16),identity:code.slice(0,16),itemCode:code.slice(16,20),grams,kg:grams/1000};
}

export const fruitStatus={available:'Tersedia',sold:'Terjual',reject:'Reject',processed:'Diolah',waste:'Waste'};

export function trackedFruit(state,barcode,store,states=['available']) {
  const scale=parseTrackingBarcode(barcode);
  if(!scale)throw Error('Gunakan label tracking 26 digit.');
  if(state.fruitTrackingVersion!==101)throw Error('Pembaruan tracking barcode belum terpasang. Hubungi admin.');
  const unit=state.fruitUnits?.find(u=>u.barcode===barcode);
  if(!unit)throw Error('Barcode belum tercatat sebagai stok masuk. Scan di Barang masuk → Catat timbang aktual terlebih dahulu.');
  if(unit.storeId!==store)throw Error('Buah berada di outlet lain. Selesaikan transfer ke outlet ini terlebih dahulu.');
  if(!states.includes(unit.status))throw Error(`Buah sudah berstatus ${fruitStatus[unit.status]||unit.status}.`);
  return unit;
}

export function checkTrackedLines(state,store,lines) {
  const seen=new Set();
  for(const line of lines){
    const isTracked=line.barcode?.startsWith('92');
    if(!isTracked){
      if(state.fruitUnits?.some(u=>u.lotId===line.lotId))throw Error('Batch ini memakai tracking per buah. Scan barcode pada buah.');
      continue;
    }
    if(seen.has(line.barcode))throw Error('Barcode buah ini sudah ada dalam pesanan.');
    seen.add(line.barcode);
    const unit=trackedFruit(state,line.barcode,store);
    if(unit.lotId!==line.lotId||unit.productId!==line.productId||Number(line.kg)!==unit.grams/1000||Number(line.pieces)!==1)
      throw Error('Batch, produk, berat, atau jumlah berbeda dari barcode buah. Scan ulang.');
  }
}

export function checkReceiptLabels(state,lines) {
  const seen=new Set();
  for(const line of lines){
    let tracked=0;
    for(const row of line.weighings||[]){
      const scale=parseTrackingBarcode(row.barcode||'');if(!scale)continue;tracked++;
      if(state.fruitTrackingVersion!==101)throw Error('Pembaruan tracking barcode belum terpasang. Hubungi admin.');
      if(seen.has(scale.identity)||state.fruitUnits?.some(u=>u.barcode.slice(0,16)===scale.identity))throw Error('Barcode sudah tercatat. Stok tidak ditambahkan lagi.');
      seen.add(scale.identity);
      const matches=state.products.filter(p=>String(p.barcode||'').trim()===scale.itemCode);
      if(matches.length!==1||matches[0].id!==line.productId)throw Error(`Periksa pemetaan kode barang ${scale.itemCode} di Master Barang.`);
      if(Number(row.kg)!==scale.kg||Number(row.pieces)!==1)throw Error('Berat label tracking dan jumlah 1 butir tidak boleh diubah.');
    }
    if(tracked&&tracked!==line.weighings.length)throw Error('Selesaikan penerimaan produk ini dengan scan seluruh label tracking. Pisahkan catatan manual / label lama.');
  }
}
