import { sumProducts } from "./decimal-totals.mjs";

export const fundingNames = {
  store: "Toko",
  retail: "PT Retail",
  distribution: "PT Distribusi",
};
export const fundingOptions = (warehouse) =>
  warehouse ? ["distribution"] : ["store", "retail"];

// Every figure on screen and in exports is built from the same dated movements.
export function cashFlowSheets(report, outlet, from, to) {
  const rows = report.rows;
  const total = (kind, column = "amount", cash) =>
    sumProducts(
      rows
        .filter((r) => r.kind === kind && (cash === undefined || r.is_cash === cash))
        .map((r) => [r[column]]),
    );
  const add = (...values) => sumProducts(values.map((n) => [n]));
  const cashChange = (column) =>
    add(
      total("sale", column, true),
      -total("refund", column, true),
      -total("store_expense", column, true),
      -total("deposit", column),
    );
  const expenses = (kind) => {
    const categories = [
      ...new Set(
        rows.filter((r) => r.kind === kind && r.amount !== 0).map((r) => r.detail),
      ),
    ].sort();
    return categories.map((category) => [
      `Pengeluaran · ${category}`,
      -sumProducts(
        rows
          .filter((r) => r.kind === kind && r.detail === category)
          .map((r) => [r.amount]),
      ),
    ]);
  };
  const sheet = (name, rows, unit = "Nilai (Rp)") => ({
    name,
    headers: ["Komponen", unit],
    rows: rows.map(([label, value]) => [label, value === 0 ? 0 : value]),
  });
  const deposits = total("deposit"),
    transfers = total("transfer_collection"),
    wholesale = total("wholesale_collection");
  const opening = cashChange("opening");
  const result = [
    sheet("Transaksi Toko", [
      ["Penjualan tunai", total("sale", "amount", true)],
      ["Penjualan nontunai", total("sale", "amount", false)],
      ["Refund tunai", -total("refund", "amount", true)],
      ["Refund nontunai", -total("refund", "amount", false)],
      ["Pengeluaran dibayar toko · tunai", -total("store_expense", "amount", true)],
      ["Pengeluaran dibayar toko · nontunai", -total("store_expense", "amount", false)],
      ["Setoran ke PT Retail", -deposits],
      ["Uang kas tercatat sebelum " + from, opening],
      ["Uang kas tercatat sampai " + to, add(opening, cashChange("amount"))],
    ]),
    sheet("PT Retail", [
      ["Setoran dari toko", deposits],
      ["Pembayaran nota ke PT Distribusi", -transfers],
      ...expenses("retail_expense"),
      ["Total operasional toko dibayar PT Retail", -total("retail_expense")],
      ["Arus bersih PT Retail", add(deposits, -transfers, -total("retail_expense"))],
    ]),
    sheet("PT Distribusi (Gudang)", [
      ["Penerimaan pembayaran nota toko", transfers],
      ...(outlet
        ? []
        : [
            ["Penerimaan pembayaran wholesale", wholesale],
            ["Pembayaran nota supplier", -total("supplier_invoice")],
            ["Pembayaran ongkir supplier", -total("supplier_shipping")],
            ...expenses("distribution_expense"),
          ]),
      [
        outlet ? "Arus bersih terkait cabang" : "Arus bersih PT Distribusi",
        outlet
          ? transfers
          : add(
              transfers,
              wholesale,
              -total("supplier_invoice"),
              -total("supplier_shipping"),
              -total("distribution_expense"),
            ),
      ],
    ]),
    sheet("Tagihan PT Distribusi", [
      ["Nilai nota toko terbit dalam periode", total("transfer_invoice")],
      ["Piutang nota toko per " + to, report.receivables.transfer ?? 0],
      ...(outlet
        ? []
        : [
            ["Nilai invoice wholesale terbit dalam periode", total("wholesale_invoice")],
            ["Piutang wholesale per " + to, report.receivables.wholesale ?? 0],
          ]),
    ]),
  ];
  const pending = total("unassigned_expense"),
    cumulative = add(pending, total("unassigned_expense", "opening"));
  if (pending || cumulative || report.undatedRefunds)
    result.push(
      sheet(
        "Perlu diperiksa",
        [
          ["Pengeluaran tanpa sumber dana dalam periode (Rp)", pending],
          ["Pengeluaran tanpa sumber dana sampai " + to + " (Rp)", cumulative],
          ...(report.undatedRefunds
            ? [["Refund tanpa tanggal · jumlah transaksi", report.undatedRefunds]]
            : []),
        ],
        "Nilai",
      ),
    );
  return result;
}
