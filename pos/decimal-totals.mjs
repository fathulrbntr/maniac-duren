// Match decimal arithmetic used by PostgreSQL numeric for checkout amounts.
// Convert only the finished sum back to Number; do not round each fruit price
// or introduce binary fractions such as 2.414 * 100000 = 241400.00000000003.
export function sumProducts(terms) {
  const products = terms.map(factors => factors.reduce((p, value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) throw Error('Nilai perhitungan tidak valid');
    const [mantissa, exponent = '0'] = String(n).split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    return { value: p.value * BigInt(whole + fraction), scale: p.scale + fraction.length - Number(exponent) };
  }, { value: 1n, scale: 0 }));
  const scale = Math.max(0, ...products.map(p => p.scale));
  const total = products.reduce((n, p) => n + p.value * 10n ** BigInt(scale - p.scale), 0n);
  const result = Number(`${total}e-${scale}`);
  if (!Number.isFinite(result)) throw Error('Total tidak valid');
  return result;
}
