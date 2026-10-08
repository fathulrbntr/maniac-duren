// Product IDs, not names, connect each fruit to its reject-processing outputs.
export const wasteOutputs = [
  { key: "durpas500", label: "Durpas 500 gr", unit: "pcs", weight: 0.5 },
  { key: "durpas1000", label: "Durpas 1 kg", unit: "pcs", weight: 1 },
  { key: "coral", label: "Coral", unit: "kg", weight: 1 },
];

export function wasteOutputProducts(state, sourceId) {
  const source = state.products.find((p) => p.id === sourceId);
  return wasteOutputs.map((spec) => {
    const matches = state.products.filter(
      (p) => p.durianSourceId === sourceId && p.durianOutput === spec.key,
    );
    let error = "";
    if (!source) error = "Pilih durian asal terlebih dahulu.";
    else if (matches.length !== 1)
      error = `${spec.label} untuk ${source.name} ${matches.length ? "memiliki hubungan ganda" : "belum dihubungkan"}. Periksa master turunan durian.`;
    const product = matches.length === 1 ? matches[0] : null;
    if (!error && (product.stockUnit !== spec.unit ||
        !["finished", "direct"].includes(product.itemType) ||
        product.category !== "Olahan Duren"))
      error = `Jenis atau satuan ${spec.label} untuk ${source.name} tidak sesuai.`;
    return { ...spec, product: error ? null : product, error };
  });
}
