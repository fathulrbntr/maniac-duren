import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID as id } from "node:crypto";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";
const db = await warehouseDatabase();
try {
  await db.exec(fs.readFileSync("database/supplier-notes-112.sql", "utf8"));
  const sql = fs.readFileSync("database/warehouse-workflow-114.sql", "utf8");
  await db.exec(sql);
  await db.exec(sql);
  const owner = id(),
    worker = id(),
    cashier = id(),
    other = id(),
    supplier = id(),
    store = id();
  const wh = (
    await db.query("select id from public.md_pos_stores where location_type='warehouse'")
  ).rows[0].id;
  const products = (
    await db.query(
      "select id from public.md_pos_products where stock_unit='kg_butir' order by sku limit 2",
    )
  ).rows.map((x) => x.id);
  await db.query("insert into public.md_pos_stores(id,name) values($1,'Toko uji')", [
    store,
  ]);
  await db.query(
    "insert into public.md_pos_suppliers(id,name) values($1,'Supplier uji')",
    [supplier],
  );
  for (const [user, role, loc] of [
    [owner, "owner", wh],
    [worker, "warehouse", wh],
    [cashier, "cashier", store],
    [other, "warehouse", store],
  ]) {
    await db.query("insert into auth.users values($1,$2)", [user, user + "@test.local"]);
    await db.query("insert into public.md_pos_staff values($1)", [user]);
    await db.query(
      "insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)",
      [user, role, [loc]],
    );
  }
  for (let i = 0; i < 2; i++)
    await db.query("update public.md_pos_products set barcode=$1 where id=$2", [
      String(i + 1).padStart(4, "0"),
      products[i],
    ]);
  const as = (user) =>
    db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const read = async () => (await db.query("select public.pos_read() s")).rows[0].s;
  const mut = async (a, p) =>
    (
      await db.query("select public.pos_warehouse_mutate($1,$2::jsonb) s", [
        a,
        JSON.stringify(p),
      ])
    ).rows[0].s;
  const code = (n, product = 1, grams = 2000) =>
    "9201161126" +
    String(n).padStart(6, "0") +
    String(product).padStart(4, "0") +
    String(grams).padStart(6, "0");
  await as(owner);
  const plan = {
    id: id(),
    storeId: wh,
    supplierId: supplier,
    invoiceNo: "RECEIVE-114",
    date: "2026-11-16",
    shippingCost: 60000,
    lines: [
      {
        productId: products[0],
        purchaseCost: 600000,
        expectedKg: 20,
        expectedPieces: 10,
      },
      { productId: products[1], purchaseCost: 120000, expectedKg: 4, expectedPieces: 2 },
    ],
  };
  await mut("receipt_plan_save", plan);
  const getPlan = async () => (await read()).receiptPlans.find((x) => x.id === plan.id);
  const receipt = async (a, extra = {}) =>
    mut(a, {
      id: id(),
      planId: plan.id,
      expectedSessionRevision: (await getPlan()).receiving.revision,
      ...extra,
    });
  await as(worker);
  let s = await read();
  let p = await getPlan();
  assert.equal(p.expected[products[0]].kg, 20);
  assert.equal(p.shippingCost, undefined);
  assert.equal(p.lines[0].purchaseCost, undefined);
  assert.equal(s.transferPrices, undefined);
  await assert.rejects(
    mut("receipt_plan_save", { ...plan, id: id(), invoiceNo: "NO" }),
    /akses|izin|permission/i,
  );
  await assert.rejects(receipt("receipt_reopen", { reason: "Tidak boleh" }));
  const scan = {
    id: id(),
    planId: plan.id,
    expectedSessionRevision: p.receiving.revision,
    barcode: code(1),
  };
  const firstScan = await mut("receipt_scan", scan);
  assert.equal(
    firstScan.receiving.scans,
    undefined,
    "scan response does not resend the complete session",
  );
  assert.equal(firstScan.receiving.scanChanges.length, 1);
  await mut("receipt_scan", scan);
  assert.equal((await getPlan()).receiving.scans.length, 1);
  await assert.rejects(mut("receipt_scan", { ...scan, barcode: code(2) }), /ID operasi/);
  await assert.rejects(
    mut("receipt_scan", { ...scan, id: id(), barcode: code(2) }),
    /Sesi berubah/,
  );
  for (let n = 2; n <= 5; n++) await receipt("receipt_scan", { barcode: code(n) });
  await receipt("receipt_scan", { barcode: code(6, 2) });
  await receipt("receipt_pause");
  await assert.rejects(receipt("receipt_scan", { barcode: code(7) }), /terkunci|dijeda/);
  await as(other);
  assert.equal((await read()).receiptPlans.length, 0);
  await assert.rejects(mut("receipt_scan", scan));
  await as(worker);
  await receipt("receipt_resume");
  assert.equal((await getPlan()).receiving.scans.length, 6);
  await receipt("receipt_scan", { barcode: code(7) });
  await receipt("receipt_scan_remove", { barcode: code(7) });
  await receipt("receipt_finish", { confirmed: true });
  p = await getPlan();
  assert.equal(p.receiving.status, "completed");
  assert(p.receivedId);
  const root = (
    await db.query(
      "select * from public.md_pos_lots where shipment_id=$1 and product_id=$2",
      [p.receivedId, products[0]],
    )
  ).rows[0];
  assert.equal(Number(root.kg), 10);
  assert.equal(root.pieces, 5);
  await assert.rejects(receipt("receipt_scan", { barcode: code(8) }), /terkunci/);
  await assert.rejects(
    mut("transfer_dispatch", {
      id: id(),
      storeId: wh,
      toStoreId: store,
      barcodes: [code(1)],
    }),
    /Back Office/,
  );
  await as(owner);
  await receipt("receipt_reopen", { reason: "Satu label salah, koreksi fisik" });
  await as(worker);
  await receipt("receipt_scan_remove", { barcode: code(5) });
  await receipt("receipt_scan", { barcode: code(8, 1, 3000) });
  await receipt("receipt_finish", { confirmed: true });
  assert.equal(
    (await db.query("select count(*)::int n from public.md_pos_receipt_shipments"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query("select status from public.md_pos_fruit_units where barcode=$1", [
        code(5),
      ])
    ).rows[0].status,
    "void",
  );
  assert.equal(
    Number(
      (await db.query("select kg from public.md_pos_lots where id=$1", [root.id])).rows[0]
        .kg,
    ),
    11,
  );
  const save = async (kind = "transfer", mode = "pending") => {
    await as(owner);
    const q = {
      id: id(),
      storeId: wh,
      kind,
      targetId: kind === "transfer" ? store : null,
      buyer: { name: "Pembeli <uji>", phone: "081", address: "Alamat" },
      carrier: "Kurir",
      rates: [{ productId: products[0], unit: "kg", price: 100000 }],
      paymentMode: mode,
    };
    await mut("outbound_save", q);
    return q.id;
  };
  const order = async (oid) => (await read()).outboundOrders.find((x) => x.id === oid);
  const out = async (oid, a, extra = {}) =>
    mut(a, {
      id: id(),
      orderId: oid,
      expectedRevision: (await order(oid)).revision,
      ...extra,
    });
  const transfer = await save();
  await as(worker);
  await out(transfer, "outbound_scan", { barcode: code(1) });
  await out(transfer, "outbound_scan", { barcode: code(1) });
  assert.equal((await order(transfer)).items.length, 1);
  assert.equal((await order(transfer)).rates[0].price, undefined);
  await assert.rejects(out(transfer, "outbound_issue"), /akses|izin|permission/i);
  await as(owner);
  await assert.rejects(
    receipt("receipt_reopen", { reason: "Bentrok pengiriman" }),
    /pengiriman/,
  );
  const second = await save("wholesale");
  await as(worker);
  await assert.rejects(
    out(second, "outbound_scan", { barcode: code(1) }),
    /pengiriman lain/,
  );
  // Reservation rejects legacy stock mutations atomically.
  await assert.rejects(
    db.query("select public.pos_tracking_change($1,$2,'test',$3,'reject')", [
      code(1),
      id(),
      root.id,
    ]),
    /pengiriman lain/,
  );
  await out(transfer, "outbound_ready");
  await as(owner);
  await out(transfer, "outbound_issue");
  assert.equal((await order(transfer)).total, 200000);
  await as(worker);
  const dispatch = {
    id: id(),
    orderId: transfer,
    expectedRevision: (await order(transfer)).revision,
    confirmed: true,
  };
  await mut("outbound_dispatch", dispatch);
  await mut("outbound_dispatch", dispatch);
  let t = (await read()).transfers.find((x) => x.id === transfer);
  assert.equal(t.total, undefined);
  assert.equal(t.lines[0].price, undefined);
  await as(cashier);
  await assert.rejects(
    mut("transfer_receive", {
      id: id(),
      transferId: transfer,
      deliveryNo: t.deliveryNo,
      confirmed: true,
    }),
    /belum dipindai/,
  );
  await mut("transfer_scan", {
    id: id(),
    transferId: transfer,
    deliveryNo: t.deliveryNo,
    barcodes: [code(1)],
  });
  await mut("transfer_receive", {
    id: id(),
    transferId: transfer,
    deliveryNo: t.deliveryNo,
    confirmed: true,
  });
  await as(owner);
  await out(transfer, "outbound_payment", {
    amount: 100000,
    date: "2026-11-16",
    method: "transfer",
    reference: "BANK-114",
    paymentConfirmed: true,
  });
  assert.equal((await order(transfer)).paid, 100000);
  await assert.rejects(
    out(transfer, "outbound_payment", {
      amount: 100001,
      date: "2026-11-16",
      method: "transfer",
      reference: "BANK-114",
      paymentConfirmed: true,
    }),
    /melebihi/,
  );
  await as(worker);
  await out(second, "outbound_scan", { barcode: code(2) });
  await out(second, "outbound_ready");
  await as(owner);
  await out(second, "outbound_issue");
  await as(worker);
  await out(second, "outbound_dispatch", { confirmed: true });
  await as(owner);
  s = await read();
  const sale = s.sales.find((x) => x.id === second);
  assert.equal(sale.total, 200000);
  assert.equal(sale.paymentStatus, "pending");
  assert.equal(sale.sourceType, "wholesale");
  assert.equal(
    (
      await db.query("select status from public.md_pos_fruit_units where barcode=$1", [
        code(2),
      ])
    ).rows[0].status,
    "sold",
  );
  await out(second, "outbound_payment", {
    amount: 200000,
    date: "2026-11-16",
    method: "cash",
    reference: "TUNAI-114",
    paymentConfirmed: true,
  });
  assert.equal((await read()).sales.find((x) => x.id === second).paymentStatus, "paid");
  await assert.rejects(
    db.query("select public.pos_tracking_mutate('pos_mutate','void',$1::jsonb)", [
      JSON.stringify({ id: id(), saleId: second }),
    ]),
    /wholesale/,
  );
  const paid = await save("wholesale", "paid");
  await as(worker);
  await out(paid, "outbound_scan", { barcode: code(3) });
  await out(paid, "outbound_ready");
  await as(owner);
  await assert.rejects(out(paid, "outbound_issue"), /Konfirmasi uang/);
  await out(paid, "outbound_issue", {
    date: "2026-11-16",
    method: "cash",
    reference: "BAYAR-LUNAS",
    paymentConfirmed: true,
  });
  assert.equal((await order(paid)).paid, 200000);
  await assert.rejects(
    out(paid, "outbound_cancel", { reason: "Tidak jadi kirim" }),
    /belum dibayar/,
  );
  await as(worker);
  await out(paid, "outbound_dispatch", { confirmed: true });
  await as(owner);
  assert.equal((await read()).sales.find((x) => x.id === paid).paid, 200000);
  // Reopening preserves downstream movements and only changes the original receipt.
  await receipt("receipt_reopen", { reason: "Tambahan buah tertinggal" });
  await as(worker);
  await assert.rejects(
    receipt("receipt_scan_remove", { barcode: code(1) }),
    /sudah bergerak/,
  );
  await receipt("receipt_scan", { barcode: code(9) });
  await receipt("receipt_finish", { confirmed: true });
  await as(owner);
  s = await read();
  assert.equal(s.transfers.find((x) => x.id === transfer).total, 200000);
  assert.equal(s.sales.filter((x) => x.sourceType === "wholesale").length, 2);
  const original = (
    await db.query("select * from public.md_pos_receipt_shipments where id=$1", [
      (await getPlan()).receivedId,
    ])
  ).rows[0];
  await db.exec(sql);
  assert.deepEqual(
    (
      await db.query("select * from public.md_pos_receipt_shipments where id=$1", [
        original.id,
      ])
    ).rows[0],
    original,
  );
  assert.equal((await getPlan()).receiving.scans.length, 7);
  const security = (
    await db.query(`select
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='md_supply' and c.relkind='r' and not c.relrowsecurity) unprotected_tables,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='md_supply' and has_function_privilege('authenticated',p.oid,'EXECUTE')) exposed_helpers
  `)
  ).rows[0];
  assert.deepEqual(security, { unprotected_tables: 0, exposed_helpers: 0 });
  const invoice = await order(transfer);
  assert.equal(
    invoice.items[0].sourceLotId,
    root.id,
    "outbound item retains source batch after store receiving",
  );
  const expectedBefore = (await getPlan()).expected;
  await assert.rejects(
    receipt("receipt_expected_edit", {
      expectedRevision: (await getPlan()).revision,
      reason: "Uji nilai invalid",
      lines: [
        { productId: products[0], expectedKg: -1, expectedPieces: 3 },
        { productId: products[1], expectedKg: 2, expectedPieces: 1 },
      ],
    }),
  );
  assert.deepEqual((await getPlan()).expected, expectedBefore);
  await receipt("receipt_expected_edit", {
    expectedRevision: (await getPlan()).revision,
    reason: "Koreksi angka pada nota supplier",
    lines: [
      { productId: products[0], expectedKg: 22, expectedPieces: 11 },
      { productId: products[1], expectedKg: 4, expectedPieces: 2 },
    ],
  });
  assert.equal((await getPlan()).expected[products[0]].kg, 22);
  // POS payment and shift guards still apply to ordinary sales.
  await assert.rejects(
    db.query(
      "insert into public.md_pos_sales(id,store_id,sale_date,payment,paid,total,change,created_by) values($1,$2,'2026-11-16','Transfer',0,100,0,$3)",
      [id(), wh, owner],
    ),
    /Pembayaran|Shift|shift/,
  );
  const privileges = (
    await db.query(
      "select has_function_privilege('anon','public.pos_warehouse_mutate(text,jsonb)','EXECUTE') a,has_function_privilege('authenticated','public.pos_warehouse_mutate_before_114(text,jsonb)','EXECUTE') b,has_table_privilege('authenticated','md_supply.receipt_scans','INSERT') c",
    )
  ).rows[0];
  assert.deepEqual(privileges, { a: false, b: false, c: false });
  console.log(
    "PASS warehouse workflow SQL: persistent scans, pause/reload/lock/reopen, correction without duplicate stock, barcode reservations, split destinations, custom pricing, payments, real transfers/wholesale sales, retries, redaction and access isolation.",
  );
} finally {
  await db.close();
}
