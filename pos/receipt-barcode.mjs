import { normalizeBarcode, parseScaleBarcode } from './barcode-scanner.mjs';
import { isLegacyStock } from './catalog.mjs';

// Receiving reads the scale's weight without requiring sale prices or ready stock.
export function receiptBarcode(raw, products, productId, settings) {
  const code = normalizeBarcode(raw, settings);
  const scale = parseScaleBarcode(code);
  if (!scale) throw Error('Scan label timbangan CAS tracking 26 digit (awalan 92) atau label lama POS KG 13 digit (awalan 21). Barcode produk biasa tidak memuat berat.');
  const matches = products.filter(p => String(p.barcode || '').trim() === scale.itemCode);
  if (!matches.length) throw Error(`Kode barang ${scale.itemCode} belum terdaftar. Cocokkan kolom Barcode durian di Master Barang dengan kode pada timbangan.`);
  if (matches.length > 1) throw Error(`Kode barang ${scale.itemCode} dipakai lebih dari satu produk. Perbaiki pemetaan Barcode di Master Barang.`);
  const product = matches[0];
  if (!isLegacyStock(product)) throw Error('Label harus terhubung ke durian utuh dengan satuan Kg + butir.');
  if (product.id !== productId) throw Error(`Label ini untuk ${product.name}. Pilih produk tersebut di penerimaan sebelum mencatat timbang.`);
  return { barcode: code, kg: scale.kg, pieces: 1 };
}
