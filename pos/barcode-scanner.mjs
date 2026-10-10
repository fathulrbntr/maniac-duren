import {posVisible} from './pos-categories.mjs?v=52';
import {readDeviceSettings,validateDeviceSettings} from './device-settings.mjs?v=58';

export function normalizeBarcode(raw, settings = readDeviceSettings()) {
  const scanner = validateDeviceSettings(settings).scanner;
  if (!scanner.enabled) throw Error('Barcode scanner dinonaktifkan di Pengaturan perangkat.');
  let code = String(raw ?? '').replace(/[\r\n\t]+$/g, '').trim();
  if (!code || code.length > 256 || /[\x00-\x1f\x7f]/.test(code)) throw Error('Barcode kosong atau tidak valid.');
  if (scanner.prefix) {
    if (!code.startsWith(scanner.prefix)) throw Error('Awalan barcode tidak sesuai pengaturan scanner.');
    code = code.slice(scanner.prefix.length);
  }
  if (scanner.suffix) {
    if (!code.endsWith(scanner.suffix)) throw Error('Akhiran barcode tidak sesuai pengaturan scanner.');
    code = code.slice(0, -scanner.suffix.length);
  }
  if (!code || code.length > 80) throw Error('Kode produk harus berisi 1–80 karakter.');
  return code; // Keep leading zeroes; barcode is an identifier, never a number.
}
export function barcodeProduct(state, raw, settings = readDeviceSettings()) {
  const code = normalizeBarcode(raw, settings);
  const products = state.products || [];
  const scale = parseScaleBarcode(code);
  if (scale) {
    // CAS I means Item Code. Match the four-digit master barcode exactly;
    // never infer a product from its name, SKU, PLU number or printed price.
    const matches = products.filter(p => String(p.barcode || '').trim() === scale.itemCode);
    if (matches.length > 1) throw Error(`Kode timbangan ${scale.itemCode} dipakai lebih dari satu produk. Perbaiki Barcode di Master Barang.`);
    if (!matches.length) throw Error(`Kode timbangan ${scale.itemCode} belum terdaftar. Isi Barcode produk di Master Barang dengan ${scale.itemCode}.`);
    const product = matches[0];
    if (!posVisible(product) || product.stockUnit !== 'kg_butir') throw Error('Kode timbangan harus terhubung ke buah dengan satuan stok Kg + butir.');
    if (!Number.isFinite(Number(product.priceKg)) || !(Number(product.priceKg) > 0)) throw Error('Harga jual per kg belum valid. Periksa Master Barang dan samakan dengan timbangan.');
    return { code, product, scale };
  }
  let matches = products.filter(p => String(p.barcode || '').trim() === code);
  if (!matches.length) matches = products.filter(p => String(p.sku || '').trim().toLowerCase() === code.toLowerCase());
  if (matches.length > 1) throw Error('Kode dipakai lebih dari satu produk. Perbaiki barcode/SKU di Master Barang.');
  if (!matches.length) {
    if (/^14\d{11}$/.test(code)) throw Error('Label timbangan lama berawalan 14 belum didukung. Cetak ulang dengan format POS KG berawalan 21.');
    throw Error('Barcode/SKU belum terdaftar di Master Barang.');
  }
  if (!posVisible(matches[0])) throw Error('Produk ini adalah bahan dan tidak dijual di POS.');
  return { code, product: matches[0] };
}
// Confirmed CAS CL5200-30B format: 21 + IIII + WWWWWW + C.
// Six weight digits are grams; the final digit is the EAN-13 checksum.
export function parseScaleBarcode(code) {
  if (!/^21\d{11}$/.test(code)) return null;
  const sum = [...code.slice(0, 12)].reduce((n, digit, i) => n + Number(digit) * (i % 2 ? 3 : 1), 0);
  if ((10 - sum % 10) % 10 !== Number(code[12])) throw Error('Barcode timbangan tidak valid (digit pemeriksa). Scan ulang label lengkap 13 digit.');
  const grams = Number(code.slice(6, 12));
  if (grams <= 0 || grams > 30000) throw Error('Berat label harus lebih dari 0 dan maksimal 30 kg untuk CAS CL5200-30B.');
  return { itemCode: code.slice(2, 6), grams, kg: grams / 1000 };
}
// Listen only on the scan field. Typing notes, prices or passwords elsewhere
// must never add a product or trigger a payment.
export function bindBarcodeInput(input, { getSettings = readDeviceSettings, onScan, onError }) {
  let busy = false;
  const scan = async () => {
    if (busy) return;
    busy = true;
    try {
      const settings = getSettings();
      normalizeBarcode(input.value, settings);
      if (await onScan(input.value, settings) !== false) input.value = '';
      else { input.focus();input.select?.(); }
    } catch (error) { onError(error.message);input.focus();input.select?.(); }
    finally { busy = false; }
  };
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!['Enter','Tab'].includes(event.key)) return;
    let settings;
    try { settings=getSettings(); } catch(error) { event.preventDefault();onError(error.message);return; }
    if (event.key !== settings.scanner.terminator) return;
    event.preventDefault();
    if (!event.repeat) return scan();
  });
  return scan;
}
