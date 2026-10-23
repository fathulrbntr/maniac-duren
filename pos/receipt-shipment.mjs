import { isLegacyStock } from './catalog.mjs?v=77';

export function weighingTotals(rows, purchase = 0, shipping = 0) {
  if (!Array.isArray(rows) || rows.length > 1000) throw Error('Maksimal 1.000 penimbangan');
  let kg = 0, pieces = 0;
  for (const row of rows) {
    const weight = Number(row.kg), count = Number(row.pieces);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 9000000000 || !Number.isSafeInteger(count) || count <= 0) throw Error('Isi berat lebih dari 0 dan butir berupa bilangan bulat');
    kg += weight; pieces += count;
  }
  kg = Number(kg.toFixed(9));
  if (kg > 9000000000 || pieces > 2147483647) throw Error('Jumlah terlalu besar');
  purchase = Number(purchase); shipping = Number(shipping);
  if (!Number.isFinite(purchase) || purchase < 0 || !Number.isFinite(shipping) || shipping < 0 || purchase + shipping > 9000000000000000) throw Error('Biaya tidak valid');
  const total = purchase + shipping;
  return { kg, pieces, purchase, shipping, total, purchaseKg: kg ? purchase / kg : 0, purchasePiece: pieces ? purchase / pieces : 0, costKg: kg ? total / kg : 0, costPiece: pieces ? total / pieces : 0 };
}

export function shipmentTotals(lines, shipping = 0) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 50) throw Error('Isi 1–50 produk dalam kiriman');
  const base = lines.map(line => weighingTotals(line.weighings, line.purchaseCost));
  const kg = base.reduce((sum, t) => sum + t.kg, 0), pieces = base.reduce((sum, t) => sum + t.pieces, 0);
  shipping = weighingTotals([], 0, shipping).shipping;
  let allocated = 0;
  const last = base.findLastIndex(t => t.kg > 0);
  const items = base.map((t, i) => {
    const share = !kg || !t.kg ? 0 : i === last ? shipping - allocated : shipping * t.kg / kg;
    allocated += share;
    return weighingTotals(lines[i].weighings, t.purchase, share);
  });
  const purchase = items.reduce((sum, t) => sum + t.purchase, 0);
  weighingTotals([], purchase, shipping);
  return { items, kg: Number(kg.toFixed(9)), pieces, purchase, shipping, total: purchase + shipping };
}

export function validateShipment(payload, state) {
  if (!payload.id || payload.unloadingComplete !== true) throw Error('Konfirmasi penurunan barang selesai terlebih dahulu');
  if (!state.stores.some(x => x.id === payload.storeId) || !state.suppliers.some(x => x.id === payload.supplierId)) throw Error('Pilih store dan supplier yang tersedia');
  const invoice = String(payload.invoiceNo || '').trim();
  if (!invoice || invoice.length > 100) throw Error('Nomor nota wajib diisi, maksimal 100 karakter');
  const date = String(payload.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Jakarta'})) throw Error('Tanggal masuk tidak valid');
  if (payload.shippingCost === '' || payload.shippingCost == null) throw Error('Isi ongkir bersama');
  const totals = shipmentTotals(payload.lines, payload.shippingCost), selected = new Set(), ids = new Set();
  payload.lines.forEach(line => {
    if (!state.products.some(p => p.id === line.productId && isLegacyStock(p))) throw Error('Pilih produk durian utuh');
    if (selected.has(line.productId)) throw Error('Produk terduplikasi dalam kiriman');
    if (!line.id || ids.has(line.id) || state.lots?.some(l => l.id === line.id)) throw Error('ID penerimaan sudah digunakan');
    selected.add(line.productId); ids.add(line.id);
    if (line.purchaseCost === '' || line.purchaseCost == null) throw Error('Isi harga nota setiap produk');
    if (!line.weighings.length) throw Error('Catat penimbangan setiap produk');
  });
  return totals;
}

export function receiveShipmentDemo(state, payload) {
  if (state.access && !state.access.stock) throw Error('Hak akses stock diperlukan');
  const totals = validateShipment(payload, state);
  payload.lines.forEach((line, index) => {
    const t = totals.items[index];
    state.lots.push({id:line.id, shipmentId:payload.id, invoiceNo:payload.invoiceNo.trim(), storeId:payload.storeId,
      supplierId:payload.supplierId, productId:line.productId, date:payload.date, note:payload.note || '',
      receivedKg:t.kg, receivedPieces:t.pieces, kg:t.kg, pieces:t.pieces, quality:'ready',
      purchaseCost:t.purchase, shippingCost:t.shipping, totalCost:t.total, unitCost:t.costKg,
      weighings:structuredClone(line.weighings)});
    state.journal.push({id:line.id,event_id:payload.id,store_id:payload.storeId,product_id:line.productId,
      supplier_id:payload.supplierId,lot_id:line.id,qty:t.kg,pieces:t.pieces,unit:'kg',cost:t.total});
  });
}
