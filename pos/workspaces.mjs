export function spacesFor(state) {
  if (!state.warehouseVersion) return [];
  const spaces = [];
  if (state.access?.backoffice) spaces.push("backoffice");
  const oldWarehouse = state.stores.find((x) => x.locationType === "warehouse");
  const hasOldWork =
    oldWarehouse &&
    (state.lots?.some((l) => l.storeId === oldWarehouse.id && l.kg > 0) ||
      state.unitLots?.some((l) => l.storeId === oldWarehouse.id && l.qty > 0) ||
      state.receiptPlans?.some(
        (p) => p.storeId === oldWarehouse.id && p.receiving?.status !== "completed",
      ) ||
      state.outboundOrders?.some((o) =>
        ["packing", "ready", "approved"].includes(o.status),
      ));
  if (
    oldWarehouse &&
    (!(state.branchStockVersion >= 132) ||
      hasOldWork ||
      !state.stores.some((x) => x.locationType === "store"))
  )
    spaces.push("warehouse");
  if (state.stores.some((x) => x.locationType !== "warehouse")) spaces.push("store");
  return spaces;
}
export const spaceTitles = {
  backoffice: "Back office",
  warehouse: "Gudang",
  store: "Toko",
};
export function defaultSpace(s) {
  const spaces = spacesFor(s);
  if (s.branchStockVersion >= 132 && !s.access?.backoffice && spaces.includes("store"))
    return "store";
  return spaces[0] || "store";
}
// Branch terminology applies only in the Toko workspace.
export const storePageTitles = {
  storehome: "Dashboard",
  receiving: "Penerimaan Barang",
  stock: "Inventory",
  waste: "Reject",
  orders: "POS",
  salesreport: "Penjualan",
  production: "Produksi",
  cutting: "Pemeriksaan Buah",
};

export function workspaceGroups(a) {
  const all = a.backoffice,
    groups =
      a.workspace === "backoffice"
        ? [
            {
              id: "central",
              label: "Back office",
              pages: [
                "backoffice",
                ...(a.pettyCash ? [] : ["dashboard"]),
                "supplierNotes",
                "transfers",
                ...(a.branchStock && a.legacyOutbound ? ["legacyTransfers"] : []),
                ...(a.branchStock ? ["costPrices"] : []),
                "pricing",
                "reports",
                ...(a.pettyCash ? ["retailFunds"] : ["documents"]),
              ],
            },
            {
              id: "masters",
              label: "Data & administrasi",
              pages: [
                "products",
                "recipes",
                "suppliers",
                "stores",
                "employees",
                "payments",
                "discounts",
                "crm",
              ],
            },
          ]
        : a.workspace === "warehouse"
          ? [
              {
                id: "warehouse",
                label: a.branchStock ? "Gudang lama" : "Gudang pusat",
                pages: [
                  "warehouse",
                  "supplierNotes",
                  "transfers",
                  "waste",
                  "stock",
                  "reports",
                ],
              },
            ]
          : [
              { id: "store", label: "Toko", pages: ["storehome"], standalone: true },
              {
                id: "store_stock",
                label: "Stok & Penerimaan",
                pages: a.branchStock
                  ? ["supplierNotes", "receiving", "stock", "waste"]
                  : ["receiving", "stock", "waste"],
              },
              {
                id: "cashier",
                label: "Kasir",
                pages: ["orders", "salesreport", "storeExpenses", "shifts"],
              },
              { id: "kitchen", label: "Kitchen", pages: ["kitchen", "production"] },
              { id: "service", label: "Waiters", pages: ["service"] },
              { id: "cutter", label: "Tukang Potong", pages: ["cutting"] },
              { id: "store_reports", label: "Manajemen Toko", pages: ["reports"] },
            ];
  const allowed = {
    backoffice: all,
    dashboard: all,
    pricing: all,
    supplierNotes: all || a.stock,
    transfers: a.workspace === "backoffice" ? all : a.dispatch,
    costPrices: all,
    legacyTransfers: all,
    warehouse: all || a.stock,
    storehome: true,
    receiving: a.receive,
    service: a.serve,
    cutting: a.cut,
    stock: a.stock || a.produce || a.receive,
    shifts: a.sell,
    orders: a.sell,
    salesreport: a.sell || a.reports,
    storeExpenses: a.sell && a.cashierExpenses,
    kitchen: a.kitchen,
    production: a.produce,
    waste: a.waste,
    reports: a.reports || a.trace,
    retailFunds: all && a.finance && a.pettyCash,
    documents: all,
    products: all,
    recipes: all,
    suppliers: all,
    stores: all,
    employees: a.employees,
    payments: a.cashierOwner,
    discounts: a.cashierOwner,
    crm: a.crmAdmin,
    attendance: a.attendance,
    guide: true,
    devices: a.sell || a.stock || all,
  };
  return [
    ...groups,
    ...(a.pettyCash
      ? [
          {
            id: "staff_attendance",
            label: "Karyawan",
            pages: ["attendance"],
            standalone: true,
          },
        ]
      : []),
    {
      id: "common",
      label: a.pettyCash ? "Perangkat & bantuan" : "Akun & perangkat",
      pages: a.pettyCash ? ["devices", "guide"] : ["attendance", "devices", "guide"],
    },
  ]
    .map((g) => ({ ...g, pages: g.pages.filter((p) => allowed[p]) }))
    .filter((g) => g.pages.length);
}
