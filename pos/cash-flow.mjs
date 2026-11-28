import { sumProducts } from "./decimal-totals.mjs";

export const companyName = "PT. Altara Rasa Nusantara";

export const fundingNames = {
  store: "Toko",
  petty: "Petty cash toko",
  retail: companyName,
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
  const allMethods = report.turnoverDepositVersion >= 138;
  const turnover = (column) => add(total("sale", column), -total("refund", column));
  const cashChange = (column) =>
    allMethods
      ? add(turnover(column), -total("deposit", column))
      : add(
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
  const petty = report.pettyCashVersion >= 130;
  const movement = (column) =>
    add(total("petty_disbursement", column), -total("petty_expense", column));
  const retail = (column) =>
    add(
      total("deposit", column),
      -total("transfer_collection", column),
      -total("retail_expense", column),
      -total("retail_supplier_invoice", column),
      -total("retail_supplier_shipping", column),
      -total("petty_disbursement", column),
    );
  const result = [
    sheet("Transaksi Toko", [
      ["Penjualan tunai", total("sale", "amount", true)],
      ["Penjualan nontunai", total("sale", "amount", false)],
      ["Refund tunai", -total("refund", "amount", true)],
      ["Refund nontunai", -total("refund", "amount", false)],
      ["Pengeluaran dibayar toko · tunai", -total("store_expense", "amount", true)],
      ["Pengeluaran dibayar toko · nontunai", -total("store_expense", "amount", false)],
      ...(petty
        ? [
            ["Saldo awal petty cash", movement("opening")],
            [`Pengisian petty cash dari ${companyName}`, total("petty_disbursement")],
            ["Pengeluaran petty cash", -total("petty_expense")],
            ["Saldo akhir petty cash", add(movement("opening"), movement("amount"))],
          ]
        : []),
      ...(allMethods ? [["Omzet wajib setor pada periode ini", turnover("amount")]] : []),
      [`Setoran ke ${companyName}`, -deposits],
      [
        (allMethods ? "Saldo setoran cabang sebelum " : "Uang kas tercatat sebelum ") +
          from,
        opening,
      ],
      [
        (allMethods ? "Saldo setoran cabang sampai " : "Uang kas tercatat sampai ") + to,
        add(opening, cashChange("amount")),
      ],
    ]),
    sheet(companyName, [
      ["Setoran dari toko", deposits],
      ...(report.branchStockVersion >= 132
        ? [
            ["Pembayaran nota supplier cabang", -total("retail_supplier_invoice")],
            ["Pembayaran ongkir supplier cabang", -total("retail_supplier_shipping")],
          ]
        : []),
      ...(!(report.branchStockVersion >= 132) || transfers
        ? [["Pembayaran nota ke PT Distribusi", -transfers]]
        : []),
      ...expenses("retail_expense"),
      [`Total operasional toko dibayar ${companyName}`, -total("retail_expense")],
      ...(petty ? [["Pencairan petty cash ke toko", -total("petty_disbursement")]] : []),
      [`Arus bersih ${companyName}`, retail("amount")],
      ...(petty
        ? [
            [
              outlet ? "Saldo kumulatif terkait cabang" : `Saldo akhir ${companyName}`,
              add(retail("opening"), retail("amount")),
            ],
          ]
        : []),
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
  if (
    report.branchStockVersion >= 132 &&
    !rows.some(
      (r) =>
        [
          "transfer_collection",
          "wholesale_collection",
          "transfer_invoice",
          "wholesale_invoice",
          "supplier_invoice",
          "supplier_shipping",
          "distribution_expense",
        ].includes(r.kind) &&
        (r.amount || r.opening),
    ) &&
    !Object.values(report.receivables).some(Boolean)
  ) {
    return result.filter(
      (s) => !["PT Distribusi (Gudang)", "Tagihan PT Distribusi"].includes(s.name),
    );
  }
  return result;
}
