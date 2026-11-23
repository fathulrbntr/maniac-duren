export function pricesForBranch(state, storeId) {
  if (!storeId || state.stockDemo || !state.branchPrices?.length) return state;
  const rates = new Map(
    state.branchPrices
      .filter((row) => row.storeId === storeId)
      .map((row) => [row.productId, row]),
  );
  if (!rates.size) return state;
  return {
    ...state,
    products: state.products.map((product) =>
      productWithRate(product, rates.get(product.id)),
    ),
  };
}
export function productWithRate(product, row) {
  if (
    !row ||
    row.stockUnit !== product.stockUnit ||
    (row.salePrice == null && row.priceKg == null)
  )
    return product;
  return product.stockUnit === "kg_butir"
    ? { ...product, priceKg: row.priceKg, pricePiece: row.pricePiece }
    : { ...product, salePrice: row.salePrice };
}
