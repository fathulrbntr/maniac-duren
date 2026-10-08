import { productDetails } from "./product-details.mjs?v=9";
export const categories = ["Buah", "Dessert", "Minuman", "Olahan Duren"];
export const itemTypes = {
  direct: "Product Jual Langsung",
  raw: "Bahan Baku",
  prep: "Bahan Produksi",
  recipe: "Product Menu",
  finished: "Pruduct Olahan",
};
export const stockUnits = {
  kg_butir: "Kg + butir",
  kg: "Kilogram",
  g: "Gram",
  ml: "Mililiter",
  pcs: "Pcs",
  porsi: "Porsi",
};
export const isMaterial = (p) => ["raw", "prep"].includes(p.itemType);
export const productDefaults = (p) => ({
  category: "Buah",
  itemType: "direct",
  stockUnit: "kg_butir",
  salePrice: null,
  ...p,
});
export const isLegacyStock = (p) => {
  const x = productDefaults(p);
  return x.itemType === "direct" && x.stockUnit === "kg_butir";
};
export function normalizeProduct(p) {
  const x = productDefaults(p);
  x.name = String(x.name ?? "").trim();
  x.sku = String(x.sku ?? "").trim();
  if (!x.name || x.name.length > 100)
    throw Error("Nama wajib, maksimal 100 karakter");
  if (!x.sku || x.sku.length > 40)
    throw Error("SKU wajib, maksimal 40 karakter");
  if (
    !Object.hasOwn(itemTypes, x.itemType) ||
    !Object.hasOwn(stockUnits, x.stockUnit)
  )
    throw Error("Jenis item atau satuan tidak valid");
  if (isMaterial(x)) x.category = null;
  else if (!categories.includes(x.category)) throw Error("Pilih kategori jual");
  if (
    x.stockUnit === "kg_butir" &&
    (x.itemType !== "direct" || x.category !== "Buah")
  )
    throw Error(`Kg + butir khusus ${itemTypes.direct} kategori Buah`);
  if (x.itemType === "recipe" && x.stockUnit !== "porsi")
    throw Error(`${itemTypes.recipe} memakai satuan porsi`);
  if (x.itemType !== "recipe" && x.stockUnit === "porsi")
    throw Error(`Satuan porsi khusus ${itemTypes.recipe}`);
  const price = (v, label) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0)
      throw Error(label + " harus lebih dari 0");
    return n;
  };
  x.priceKg = isLegacyStock(x) ? price(x.priceKg, "Harga/kg") : null;
  x.pricePiece = isLegacyStock(x) ? price(x.pricePiece, "Harga/butir") : null;
  x.salePrice =
    !isMaterial(x) && !isLegacyStock(x)
      ? x.itemType === "finished" && (x.salePrice == null || x.salePrice === "")
        ? null
        : price(x.salePrice, "Harga jual")
      : null;
  return {
    name: x.name,
    sku: x.sku,
    category: x.category,
    itemType: x.itemType,
    stockUnit: x.stockUnit,
    priceKg: x.priceKg,
    pricePiece: x.pricePiece,
    salePrice: x.salePrice,
    ...productDetails(x),
  };
}
export function saveProduct(s, p, editing = false) {
  const index = s.products.findIndex((x) => x.id === p.id);
  if (!editing && index !== -1) return;
  if (editing && index === -1) throw Error("Produk tidak ditemukan");
  const x = normalizeProduct(p);
  if (
    s.products.some(
      (other) =>
        other.id !== p.id && other.sku.toLowerCase() === x.sku.toLowerCase(),
    )
  )
    throw Error("SKU sudah digunakan");
  if (editing) {
    const old = productDefaults(s.products[index]);
    const used =
      (s.unitLots || []).some((l) => l.productId === p.id) ||
      (s.recipes || []).some(
        (r) =>
          r.outputId === p.id ||
          r.ingredients.some((l) => l.productId === p.id),
      ) ||
      s.lots.some((l) => l.productId === p.id) ||
      s.sales.some((sale) => sale.lines.some((l) => l.productId === p.id));
    if (used && (old.stockUnit !== x.stockUnit || old.itemType !== x.itemType))
      throw Error(
        "Jenis dan satuan terkunci karena sudah dipakai dalam resep atau stok/transaksi",
      );
    s.products[index] = { ...s.products[index], ...x };
  } else s.products.push({ id: p.id, ...x });
}
