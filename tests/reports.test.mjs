import { dashboardReport } from "../pos/dashboard-report.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  salesReport,
  stockReport,
  deliveryReport,
  marginReport,
  expenseReport,
  periodRange,
  reportSheets,
} from "../pos/reports.mjs";
import { createStockDemo } from "../pos/stock-demo.mjs";
import { workbook } from "../pos/report-export.mjs";
const basic = {
  stores: [
    { id: "a", name: "Depok" },
    { id: "b", name: "Bekasi" },
  ],
  products: [
    { id: "p", name: "Monthong" },
    { id: "r", name: "Dessert" },
  ],
  suppliers: [{ id: "sup", name: "Supplier A" }],
  lots: [
    {
      id: "lot",
      productId: "p",
      supplierId: "sup",
      storeId: "a",
      date: "2026-10-01",
      receivedKg: 10,
      kg: 5,
      pieces: 2,
      unitCost: 10,
    },
  ],
  unitLots: [],
  events: [],
  journal: [],
  expenses: [],
  sales: [],
};
const f = { from: "2026-10-01", to: "2026-10-31", store: "" };
test("discount totals reconcile product, store and supplier; no duplicate same transaction; exclude unpaid/refunded", () => {
  const s = structuredClone(basic);
  s.orders = [
    {
      id: "o",
      store_id: "a",
      paid_date: "2026-10-02",
      status: "paid",
      payment_status: "paid",
      total: 90,
      lines: [
        {
          productId: "p",
          lotId: "lot",
          itemType: "fruit",
          qty: 2,
          kg: 2,
          pieces: 1,
          price: 30,
          unit: "KG",
        },
        {
          productId: "r",
          itemType: "recipe",
          lineId: "dessert",
          qty: 1,
          price: 40,
          unit: "porsi",
        },
      ],
      consumption: [{ lineId: "dessert", lotId: "lot", qty: 1, unitCost: 10 }],
    },
    {
      id: "refund",
      store_id: "a",
      paid_date: "2026-10-02",
      status: "cancelled",
      payment_status: "refunded",
      total: 200,
      lines: [],
    },
    { id: "unpaid", store_id: "b", status: "queued", total: 500, lines: [] },
  ];
  s.sales = [{ id: "o", storeId: "a", date: "2026-10-02", total: 90, lines: [] }];
  const a = salesReport(s, f);
  assert.equal(a.total, 90);
  assert.equal(a.tx.length, 1);
  for (const key of ["products", "suppliers"])
    assert.equal(
      a[key].reduce((n, x) => n + x.revenue, 0),
      90,
    );
  assert.equal(a.stores[0].total, 90);
  assert.equal(a.suppliers.find((x) => x.method === "Alokasi bahan").revenue, 36);
  assert.equal(salesReport(s, { ...f, store: "b" }).total, 0);
});
test("purchases come from original receipts, exclude transferred and opening lots; null cost never treated as complete", () => {
  const s = structuredClone(basic);
  s.lots.push({ ...s.lots[0], id: "transfer", storeId: "b", sourceLotId: "lot" });
  s.unitLots = [
    {
      id: "opening",
      kind: "opening",
      date: "2026-10-01",
      storeId: "a",
      receivedQty: 2,
      unitCost: 10,
    },
    {
      id: "purchase",
      kind: "purchase",
      date: "2026-10-01",
      storeId: "a",
      receivedQty: 2,
      unitCost: null,
    },
  ];
  s.expenses = [
    { id: "e", date: "2026-10-02", store_id: "a", amount: 50 },
    { id: "void", date: "2026-10-02", store_id: "a", amount: 100, voided: true },
  ];
  const x = expenseReport(s, f);
  assert.equal(x.purchases, 100);
  assert.equal(x.operating, 50);
  assert.equal(x.unknown, 1);
  assert.equal(x.rows.length, 3);
});
test("stock period reconstructs closing, rejects stay in physical stock, transfer both stores reconciles", () => {
  const s = structuredClone(basic);
  s.lots[0].kg = 5;
  s.journal = [
    {
      lot_id: "lot",
      product_id: "p",
      store_id: "a",
      qty: 10,
      unit: "kg",
      date: "2026-10-01",
      action: "receipt",
    },
    {
      lot_id: "lot",
      product_id: "p",
      store_id: "a",
      qty: -2,
      unit: "kg",
      date: "2026-10-02",
      action: "sale",
    },
    {
      lot_id: "lot",
      product_id: "p",
      store_id: "a",
      qty: -3,
      unit: "kg",
      date: "2026-10-03",
      action: "movement",
    },
  ];
  const r = stockReport(s, { ...f, to: "2026-10-02" }).rows[0];
  assert.equal(r.opening, 0);
  assert.equal(r.incoming, 10);
  assert.equal(r.sold, 2);
  assert.equal(r.closing, 8);
  assert.equal(r.current, 5);
  const later = stockReport(s, { ...f, from: "2026-10-03", to: "2026-10-03" }).rows[0];
  assert.equal(later.opening, 8);
  assert.equal(later.transferOut, 3);
  assert.equal(later.closing, 5);
});
test("period boundaries use Monday and handle new year / leap month", () => {
  assert.deepEqual(periodRange("week", "2026-01-01"), {
    from: "2025-12-29",
    to: "2026-01-04",
  });
  assert.deepEqual(periodRange("month", "2024-02-12"), {
    from: "2024-02-01",
    to: "2024-02-29",
  });
});
test("Excel is real XLSX and preserves untrusted strings without formulas", async () => {
  const s = [
    {
      name: "Data",
      headers: ["Text", "Angka"],
      rows: [
        ["=1+1", 1.25],
        ["A & B <test>", 2],
      ],
    },
  ];
  const blob = workbook(s);
  const b = Buffer.from(await blob.arrayBuffer());
  assert.equal(b.readUInt32LE(0), 0x04034b50);
  assert(!b.includes(Buffer.from("<f>")));
  fs.mkdirSync(new URL("../test-results/", import.meta.url), { recursive: true });
  fs.writeFileSync(new URL("../test-results/maniac071-test.xlsx", import.meta.url), b);
});
test("finance and stock access are applied to exported sheets", () => {
  const sheets = reportSheets(
    { ...basic, access: { reports: true, finance: false, trace: false } },
    f,
  );
  assert(!sheets.some((x) => ["Pengeluaran", "Stok", "Jejak stok"].includes(x.name)));
});

test("demo discards real documents, expense entries and admin history", () => {
  const s = createStockDemo({
    ...basic,
    documents: [{ id: "real" }],
    expenses: [{ id: "real" }],
    adminEvents: [{ id: "real" }],
  });
  assert.deepEqual(s.documents, []);
  assert.deepEqual(s.expenses, []);
  assert.deepEqual(s.adminEvents, []);
});

test("a cancelled order cannot reappear through a legacy sale with the same identifier", () => {
  const state = {
    ...basic,
    orders: [{ id: "voided", status: "cancelled", payment_status: "refunded" }],
    sales: [{ id: "voided", date: f.from, storeId: "a", lines: [], total: 30000 }],
  };
  assert.equal(salesReport(state, f).total, 0);
});

test("wholesale dispatch is sold stock in both report and export", () => {
  const state = {
    ...basic,
    journal: [
      {
        event_id: "dispatch",
        lot_id: "lot",
        product_id: "p",
        store_id: "a",
        date: f.from,
        qty: -2,
        unit: "kg",
        action: "wholesale_sale",
      },
    ],
  };
  const report = stockReport(state, f);
  assert.equal(report.rows[0].sold, 2);
  assert.equal(report.rows[0].other, 0);
  assert.equal(
    report.details.find((r) => r.event_id === "dispatch").label,
    "Penjualan grosir",
  );
  const exportRows = reportSheets(state, f, "stock");
  assert.equal(exportRows.find((sheet) => sheet.name === "Stok").rows[0][5], 2);
  assert(!exportRows.some((sheet) => sheet.name === "Pengeluaran"));
});

test("delivery period uses dispatch in Jakarta, includes either end and counts only posted shipments", () => {
  const first = {
    id: "1",
    sourceId: "a",
    targetId: "b",
    deliveryNo: "SJ-01",
    status: "received",
    createdAt: "2026-09-30T17:01:00Z",
    receivedAt: "2026-10-02T01:00:00Z",
  };
  const state = {
    ...basic,
    warehouseVersion: 107,
    access: { trace: true },
    branchNotes: [
      { number: "NT-01", transferId: "1" },
      { number: "NT-02", status: "approved" },
    ],
    transfers: [
      first,
      { ...first, id: "2", deliveryNo: "SJ-02", status: "cancelled", receivedAt: null },
      { ...first, id: "3", deliveryNo: "SJ-03", createdAt: "2026-10-31T17:00:00Z" },
    ],
  };
  for (const store of ["a", "b", ""]) {
    const r = deliveryReport(state, { ...f, store });
    assert.deepEqual(r.counts, { in_transit: 0, received: 1, cancelled: 1 });
    assert.equal(r.sheet.rows.length, 2);
  }
  assert.deepEqual(
    deliveryReport(state, { ...f, query: "nt-01", status: "received" }).sheet.rows,
    [
      [
        "2026-10-01",
        "SJ-01",
        "NT-01",
        "Depok",
        "Bekasi",
        "Diterima lengkap",
        "2026-10-02",
      ],
    ],
  );
  assert.equal(deliveryReport(state, { ...f, store: "c" }).sheet.rows.length, 0);
  assert(
    !reportSheets({ ...state, access: { finance: true } }, f).some(
      (x) => x.name === "Pengiriman",
    ),
  );
});

test("dashboard, margin and export agree on incomplete and subsequently reconciled costs", () => {
  const state = {
    ...structuredClone(basic),
    orders: [],
    money: [{ event_id: "w", store_id: "a", category: "loss", cost: 7 }],
    sales: [{ id: "s", storeId: "a", date: f.from, total: 50, lines: [] }],
  };
  function check(expected) {
    assert.equal(marginReport(state, f).result, expected);
    assert.equal(dashboardReport(state, f).financial.result, expected);
    assert.equal(
      reportSheets(state, f, "margin")[0].rows[0][4],
      expected ?? "Belum lengkap",
    );
  }
  check(null);
  state.sales[0].lines = [{ lotId: "lot", productId: "p", unit: "KG", kg: 1, total: 50 }];
  check(null);
  state.events.push({ id: "w", business_date: f.from });
  check(33);
});
