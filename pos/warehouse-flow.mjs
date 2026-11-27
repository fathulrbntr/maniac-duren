import { quantity } from "./production.mjs";
import { workflowActions, outboundStatuses } from "./warehouse-workflow.mjs";
import { escape as e, num, money } from "./core.mjs";
import { parseTrackingBarcode } from "./scale-label.mjs";
import { supplierNoteActions } from "./supplier-notes.mjs";
export const supplyActions = new Set([
  ...supplierNoteActions,
  ...workflowActions,
  "transfer_price_save",
  "branch_price_save",
  "receipt_plan_save",
  "branch_note_create",
  "branch_note_pack",
  "branch_note_draft",
  "branch_note_return",
  "branch_note_approve",
  "branch_note_ship",
  "branch_note_cancel",
  "transfer_dispatch",
  "transfer_scan",
  "transfer_receive",
  "transfer_cancel",
  "transfer_payment",
  "fruit_cut_check",
  "service_complete",
  "legacy_labels_register",
]);
const mergeScans = (old, changes, removed) => {
  const rows = new Map((old || []).map((x) => [x.barcode, x]));
  if (removed) rows.delete(removed);
  for (const x of changes || []) rows.set(x.barcode, x);
  return [...rows.values()];
};
export function applySupplyResponse(state, response) {
  if (response?.supplyDelta)
    return {
      ...state,
      receiptPlans: response.planId
        ? (state.receiptPlans || []).map((p) =>
            p.id === response.planId
              ? {
                  ...p,
                  receiving: response.receiving.scanChanges
                    ? {
                        ...response.receiving,
                        scans: mergeScans(
                          p.receiving?.scans,
                          response.receiving.scanChanges,
                          response.receiving.removedBarcode,
                        ),
                      }
                    : response.receiving,
                }
              : p,
          )
        : state.receiptPlans,
      outboundOrders: response.outbound
        ? [
            response.outbound.itemsDelta
              ? {
                  ...response.outbound,
                  items: mergeScans(
                    state.outboundOrders?.find((o) => o.id === response.outbound.id)
                      ?.items,
                    response.outbound.items,
                    response.outbound.removedBarcode,
                  ),
                }
              : response.outbound,
            ...(state.outboundOrders || []).filter((o) => o.id !== response.outbound.id),
          ]
        : state.outboundOrders,
      supplyEvents: [
        ...(state.supplyEvents || []).filter((e) => e.id !== response.event.id),
        response.event,
      ],
    };
  if (!response?.warehouseDelta) return response;
  const scans = new Map(response.scans.map((x) => [x.barcode, x]));
  return {
    ...state,
    transfers: (state.transfers || []).map((t) =>
      t.id === response.transferId
        ? {
            ...t,
            items: t.items.map((i) =>
              scans.has(i.barcode) ? { ...i, ...scans.get(i.barcode) } : i,
            ),
          }
        : t,
    ),
    supplyEvents: [
      ...(state.supplyEvents || []).filter((e) => e.id !== response.event.id),
      response.event,
    ],
  };
}
export const transferStatus = {
  in_transit: "Dalam perjalanan",
  received: "Diterima lengkap",
  cancelled: "Dibatalkan",
};
export function warehouseEnabled(s) {
  return s.warehouseVersion >= 107 && !s.stockDemo;
}
export function location(s, key) {
  return (s.locations || s.stores || []).find((x) => x.id === key);
}
export function warehouseId(s) {
  return (s.locations || s.stores || []).find((x) => x.locationType === "warehouse")?.id;
}
export function scanForDispatch(s, store, code, selected = []) {
  if (!parseTrackingBarcode(code)) throw Error("Gunakan barcode tracking 26 digit.");
  if (selected.includes(code)) throw Error("Barcode sudah masuk daftar kirim.");
  const u = s.fruitUnits?.find((x) => x.barcode === code);
  if (!u || u.storeId !== store || u.status !== "available")
    throw Error("Barcode belum terdaftar atau tidak tersedia di lokasi asal.");
  const l = s.lots.find((x) => x.id === u.lotId);
  if (l?.quality !== "ready") throw Error("Buah belum siap kirim.");
  if (
    !(s.branchStockVersion >= 132) &&
    !s.transferPrices?.some((x) => x.productId === u.productId)
  )
    throw Error("Harga transfer belum diatur admin.");
  return u;
}
// Batches arrive in receipt-date FIFO order from outboundInventory.
export function allocateBranchUnits(batches, product, requested) {
  const qty = quantity(requested, product.stockUnit);
  const units = [];
  const scale = 1_000_000;
  let remaining = Math.round(qty * scale);
  for (const lot of batches) {
    if (lot.productId !== product.id || lot.unit !== product.stockUnit) continue;
    const take = Math.min(remaining, Math.round(lot.available.qty * scale));
    units.push({ lotId: lot.id, qty: take / scale });
    remaining -= take;
    if (remaining === 0) return units;
  }
  throw Error("Jumlah kirim melebihi stok tersedia di cabang asal.");
}
export function branchFruit(fruitByBarcode, productId, code) {
  if (!parseTrackingBarcode(code)) throw Error("Gunakan barcode tracking 26 digit.");
  const fruit = fruitByBarcode.get(code);
  if (!fruit) throw Error("Barcode tidak tersedia untuk dikirim dari cabang asal.");
  if (fruit.productId !== productId) throw Error("Barcode bukan milik SKU yang dipilih.");
  return fruit;
}
export function scanForReceipt(t, code, selected = []) {
  if (selected.includes(code) || t.items.some((x) => x.barcode === code && x.scannedAt))
    throw Error("Barcode sudah dipindai untuk penerimaan ini.");
  if (!t.items.some((x) => x.barcode === code))
    throw Error("Barcode tidak tercantum pada surat jalan ini.");
  return code;
}
export function transferPreview(s, codes, units = []) {
  const rows = new Map();
  const internal = s.branchStockVersion >= 132;
  for (const code of codes) {
    const u = s.fruitUnits.find((x) => x.barcode === code);
    if (!u) throw Error("Barcode tidak dikenal.");
    const key = u.lotId,
      rate = internal
        ? { unit: "kg", price: null }
        : s.transferPrices.find((x) => x.productId === u.productId);
    if (!rate) throw Error("Harga transfer belum diatur.");
    const r = rows.get(key) || {
      sourceLotId: key,
      productId: u.productId,
      kg: 0,
      pieces: 0,
      unit: rate.unit,
      price: rate.price,
    };
    r.kg += u.grams / 1000;
    r.pieces++;
    r.qty = rate.unit === "kg" ? r.kg : r.pieces;
    rows.set(key, r);
  }
  for (const unit of units) {
    const lot = s.unitLots.find((x) => x.id === unit.lotId),
      rate =
        internal && lot
          ? { unit: lot.unit, price: null }
          : s.transferPrices?.find((x) => x.productId === lot?.productId);
    if (!rate || rate.unit !== lot.unit)
      throw Error("Harga transfer bahan belum sesuai.");
    rows.set(lot.id, {
      sourceLotId: lot.id,
      productId: lot.productId,
      qty: Number(unit.qty),
      unit: rate.unit,
      price: rate.price,
    });
  }
  return [...rows.values()].map((x) => ({
    ...x,
    productName: s.products.find((p) => p.id === x.productId)?.name || "Barang",
    total: Math.round(x.qty * x.price * 100) / 100,
  }));
}
export function batchLocationRows(s, rootId) {
  const rows = new Map();
  for (const u of s.fruitUnits || []) {
    if (u.receiptLotId !== rootId) continue;
    const t = (s.transfers || []).find(
      (t) => t.status === "in_transit" && t.items.some((i) => i.barcode === u.barcode),
    );
    const place =
      u.status === "in_transit"
        ? `${t?.origin?.name || location(s, u.storeId)?.name || "Gudang"} → ${t?.destination?.name || "Toko tujuan"}`
        : location(s, u.storeId)?.name || "Lokasi di luar akses";
    const key = place + "|" + u.status,
      r = rows.get(key) || { place, status: u.status, grams: 0, pieces: 0 };
    r.grams += u.grams;
    r.pieces++;
    rows.set(key, r);
  }
  return [...rows.values()].map((r) => ({ ...r, kg: r.grams / 1000 }));
}
export function inTransitLots(s) {
  return (s.transfers || [])
    .filter((t) => t.status === "in_transit")
    .flatMap((t) =>
      t.lines.map((l) => ({
        id: "transit:" + t.id + ":" + l.sourceLotId,
        sourceLotId: l.sourceLotId,
        storeId: t.sourceId,
        productId: l.productId,
        supplierId: l.supplierId,
        unitCost: l.unitCost,
        date: t.createdAt.slice(0, 10),
        quality: "in_transit",
        transit: true,
        targetStoreId: t.targetId,
        deliveryNo: t.deliveryNo,
        locationLabel: `Dalam perjalanan: ${t.origin.name} → ${t.destination.name}`,
        note: t.deliveryNo,
        ...(l.kind === "fruit"
          ? { receivedKg: l.kg, receivedPieces: l.pieces, kg: l.kg, pieces: l.pieces }
          : { receivedQty: l.qty, qty: l.qty, unit: l.unit }),
      })),
    );
}
export function transferDocument(t, type = "delivery") {
  const invoice = type === "invoice" && t.invoiceNo !== null,
    title = invoice
      ? t.kind === "wholesale"
        ? "INVOICE WHOLESALE"
        : "INVOICE TRANSFER"
      : t.invoiceNo === null
        ? "SURAT JALAN MUTASI ANTARCABANG"
        : "SURAT JALAN",
    number = invoice ? t.invoiceNo : t.deliveryNo;
  const fruit = t.lines.reduce((v, l) => v + (l.pieces || 0), 0),
    kg = t.lines.reduce((v, l) => v + (l.kg || 0), 0);
  return `<!doctype html><html lang="id"><meta charset="utf-8"><title>${e(number)}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#182129;line-height:1.5;max-width:800px;margin:24px auto}h1{font-size:24px;margin:0}h2{font-size:18px}header{display:flex;justify-content:space-between;border-bottom:3px solid #263b33;padding-bottom:18px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}table{border-collapse:collapse;width:100%;margin:18px 0}thead{display:table-header-group}th,td{border-bottom:1px solid #d5dcd8;text-align:left;padding:9px 7px;vertical-align:top}tr{break-inside:avoid}.number{text-align:right}.total{font-size:18px;text-align:right}small{display:block;color:#58655d}code{font-size:11px}.signatures{display:flex;justify-content:space-between;margin-top:40px}.signatures p{padding-top:50px}.barcodes{columns:2;column-gap:24px}.barcodes div{break-inside:avoid;padding:5px;border-bottom:1px solid #eee}.status{padding:10px;background:#eef3ee}@media print{button{display:none}body{margin:0}}</style><body><button onclick="window.print()">Cetak / simpan PDF</button><header><div><h1>${e(t.origin.name)}</h1><p>${e(t.origin.address || "")}<br>${e(t.origin.phone || "")}</p></div><div><h2>${title}</h2><b>${e(number)}</b><small>${e(new Date(t.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }))} WIB</small></div></header><div class="meta"><div><small>${invoice ? "Ditagihkan kepada" : "Dikirim kepada"}</small><b>${e(t.destination.name)}</b><br>${e(t.destination.address || "")}<br>${e(t.destination.phone || "")}</div><div>Surat jalan: <b>${e(t.deliveryNo)}</b>${t.invoiceNo ? `<br>Invoice: <b>${e(t.invoiceNo)}</b>` : ""}<br>${t.invoiceNo === null ? "Pengirim" : "Pengantar / kendaraan"}: ${e(t.carrier)}</div></div><p class="status">${e(transferStatus[t.status] || outboundStatuses[t.status])}${t.status === "cancelled" ? " · " + e(t.cancelReason) : ""}</p><table><thead><tr><th>Barang / batch supplier</th><th>Jumlah kirim</th>${invoice ? '<th class="number">Harga satuan</th><th class="number">Tagihan</th>' : ""}</tr></thead><tbody>${t.lines.map((l) => `<tr><td><b>${e(l.productName)}</b><small>${e(l.supplierName || "—")} · ${e(l.sourceLotId.slice(0, 8))}</small></td><td>${l.kind === "fruit" ? `${num(l.kg)} kg / ${l.pieces} butir` : `${num(l.qty)} ${e(l.unit)}`}</td>${invoice ? `<td class="number">${money(l.price)} / ${e(l.unit)}</td><td class="number">${money(l.total)}</td>` : ""}</tr>`).join("")}</tbody></table><p>Buah: <b>${fruit} butir · ${num(kg)} kg</b> · ${t.lines.length} baris batch/produk</p>${invoice ? `<p class="total">Total tagihan <b>${money(t.total)}</b></p><p class="number">Dibayar ${money(t.paid)} · Sisa ${money(t.total - t.paid)}</p><p>${t.kind === "wholesale" ? "Penjualan wholesale." : "Tagihan transfer internal."} Harga disimpan saat penerbitan.</p>` : `<p>${t.invoiceNo === null ? "Cocokkan jumlah fisik per batch dengan surat jalan sebelum menerima kiriman." : t.kind === "wholesale" ? "Barang diserahkan sesuai daftar barcode pada invoice. Simpan bukti serah terima." : "Penerima memindai barcode buah dan memeriksa jumlah barang nonbuah per batch. Stok toko masuk setelah konfirmasi lengkap."}</p><h3>Daftar barcode buah (${t.items.length})</h3><div class="barcodes">${t.items.map((i) => `<div><code>${e(i.barcode)}</code> · ${num(i.grams / 1000)} kg</div>`).join("")}</div>`}<p>Catatan: ${e(t.note || "—")}</p><div class="signatures"><div>${t.invoiceNo === null ? "Disiapkan pengirim" : "Disiapkan gudang"}<p>(________________)</p></div><div>Pengantar<p>(________________)</p></div><div>Diterima tujuan<p>(________________)</p></div></div></body></html>`;
}
