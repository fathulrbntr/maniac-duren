import {
  catalogCodeProduct,
  normalizeBarcode,
  parseScaleBarcode,
} from "./barcode-scanner.mjs";
import { defaultDeviceSettings } from "./device-settings.mjs";
import { pricesForBranch } from "./branch-prices.mjs";
import { productStock } from "./product-stock.mjs";
import { location } from "./warehouse-flow.mjs";
import { fruitStatus } from "./scale-label.mjs";
import { isMaterial, itemTypes } from "./catalog.mjs";
import { num, money } from "./core.mjs";

// The lookup also accepts materials, sold fruit and products without a selling price.
export function lookupItem(state, raw, storeId, workspace, { camera = false } = {}) {
  const code = normalizeBarcode(raw, defaultDeviceSettings());
  const products = state.products || [];
  const tracking = /^92\d{24}$/.test(code);
  const unit =
    tracking &&
    state.fruitUnits?.find(
      (u) =>
        u.barcode === code &&
        (u.storeId === storeId || (!storeId && workspace === "backoffice")),
    );
  if (tracking && !unit)
    throw Error("Label buah belum tercatat di lokasi yang dapat Anda lihat.");
  let product = unit
    ? products.find((p) => p.id === unit.productId)
    : catalogCodeProduct(products, code);
  if (!product && !tracking && camera && /^0\d{12}$/.test(code))
    product = catalogCodeProduct(products, code.slice(1));
  const scale = !product && !tracking ? parseScaleBarcode(code) : null;
  if (scale) {
    const matches = products.filter(
      (p) => p.stockUnit === "kg_butir" && p.barcode === scale.itemCode,
    );
    if (matches.length > 1) throw Error("Kode timbangan digunakan oleh beberapa barang.");
    product = matches[0];
  }
  if (!product) throw Error("Barang tidak ditemukan. Periksa barcode atau SKU.");
  const locationId = unit?.storeId || storeId;
  const locationName = location(state, locationId)?.name;
  const rows = [
    ["SKU", product.sku],
    ["Varian", product.variant],
    ["Jenis", itemTypes[product.itemType]],
    ["Kategori", product.category],
  ];
  const dual = product.stockUnit === "kg_butir";
  const access = state.access;
  const inventory =
    !access || access.stock || access.receive || access.backoffice || access.sell;
  const highlights = [];
  const priceNotes = [];
  const kg = unit ? unit.grams / 1000 : scale?.kg;
  if (kg > 0) highlights.push([unit ? "Berat buah" : "Berat label", `${num(kg)} kg`]);
  if (unit) {
    const lot = (state.lots || []).find((l) => l.id === unit.lotId);
    rows.push(
      ["Status buah", fruitStatus[unit.status] || unit.status],
      ["Lokasi buah", locationName],
    );
    if (inventory)
      rows.push(
        ["Batch", unit.lotId],
        ["Supplier", state.suppliers?.find((x) => x.id === lot?.supplierId)?.name],
        ["Tanggal masuk", lot?.date],
      );
  }
  if (
    inventory &&
    product.itemType !== "recipe" &&
    (locationId || workspace === "backoffice")
  ) {
    const stock = productStock(state, product.id, locationId || null, dual);
    rows.push([
      `Stok · ${locationName || (locationId ? "lokasi aktif" : "semua lokasi")}`,
      dual
        ? `${num(stock.kg)} kg · ${num(stock.pieces)} butir`
        : `${num(stock.qty)} ${product.stockUnit}`,
    ]);
  }
  const canSeePrices =
    workspace !== "warehouse" && (!access || access.sell || access.backoffice);
  if (canSeePrices && locationId) {
    const priced = pricesForBranch(state, locationId).products.find(
      (p) => p.id === product.id,
    );
    const rates = (
      dual
        ? [
            ["kg", priced.priceKg],
            ["butir", priced.pricePiece],
          ]
        : [[product.stockUnit, priced.salePrice]]
    ).filter(([, rate]) => Number.isFinite(Number(rate)) && rate > 0);
    if (kg > 0 && dual && rates.some(([measure]) => measure === "kg")) {
      highlights.push(["Harga sesuai berat", money(kg * priced.priceKg)]);
      for (const [measure, rate] of rates) priceNotes.push(`${money(rate)} / ${measure}`);
    } else {
      for (const [measure, rate] of rates)
        highlights.push([`Harga jual / ${measure}`, money(rate)]);
    }
    if (!rates.length && !isMaterial(product))
      priceNotes.push("Harga jual belum diatur.");
  } else if (canSeePrices && workspace === "backoffice" && !isMaterial(product)) {
    priceNotes.push("Pilih cabang untuk melihat harga jual.");
  }
  return {
    name: product.name,
    code,
    highlights,
    priceNotes,
    rows: rows.filter(([, value]) => value != null && value !== ""),
  };
}
