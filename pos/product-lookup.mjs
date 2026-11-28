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
import { itemTypes } from "./catalog.mjs";
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
  if (unit) {
    const lot = (state.lots || []).find((l) => l.id === unit.lotId);
    rows.push(
      ["Status buah", fruitStatus[unit.status] || unit.status],
      ["Berat buah", `${num(unit.grams / 1000)} kg`],
      ["Lokasi buah", locationName],
    );
    if (inventory)
      rows.push(
        ["Batch", unit.lotId],
        ["Supplier", state.suppliers?.find((x) => x.id === lot?.supplierId)?.name],
        ["Tanggal masuk", lot?.date],
      );
  } else if (scale) rows.push(["Berat label", `${num(scale.kg)} kg`]);
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
  if (
    locationId &&
    workspace !== "warehouse" &&
    (!access || access.sell || access.backoffice)
  ) {
    const priced = pricesForBranch(state, locationId).products.find(
      (p) => p.id === product.id,
    );
    const prices = dual
      ? [
          ["kg", priced.priceKg],
          ["butir", priced.pricePiece],
        ]
      : [[product.stockUnit, priced.salePrice]];
    for (const [measure, price] of prices)
      if (price > 0) rows.push([`Harga jual / ${measure}`, money(price)]);
  }
  return {
    name: product.name,
    code,
    rows: rows.filter(([, value]) => value != null && value !== ""),
  };
}
