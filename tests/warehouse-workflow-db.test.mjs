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
  for (const n of [3, 2, 5, 4]) await receipt("receipt_scan", { barcode: code(n) });
  await receipt("receipt_scan", { barcode: code(6, 2) });
  await receipt("receipt_pause");
  await assert.rejects(receipt("receipt_scan", { barcode: code(7) }), /terkunci|dijeda/);
  await as(other);
  assert.equal((await read()).receiptPlans.length, 0);
  await assert.rejects(mut("receipt_scan", scan));
  await as(worker);
  await receipt("receipt_resume");
  assert.deepEqual(
    (await getPlan()).receiving.scans.map((x) => x.barcode),
    [code(1), code(3), code(2), code(5), code(4), code(6, 2)],
    "saved rows reload in scan order regardless of label number",
  );
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
  const save = async (kind = "transfer", mode = "pending", priced = [products[0]]) => {
    await as(owner);
    const q = {
      id: id(),
      storeId: wh,
      kind,
      targetId: kind === "transfer" ? store : null,
      buyer: { name: "Pembeli <uji>", phone: "081", address: "Alamat" },
      carrier: "Kurir",
      rates: priced.map((productId) => ({ productId, unit: "kg", price: 100000 })),
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
  const multi = await save("transfer", "pending", products);
  const labels = [code(4), code(6, 2)];
  await as(worker);
  for (const barcode of labels) await out(multi, "outbound_scan", { barcode });
  await out(multi, "outbound_ready");
  await as(owner);
  await out(multi, "outbound_issue");
  await as(worker);
  await out(multi, "outbound_dispatch", { confirmed: true });
  await as(cashier);
  const delivery = (await read()).transfers.find((x) => x.id === multi);
  assert.equal(delivery.lines.length, 2);
  const confirm = {
    id: id(),
    transferId: multi,
    deliveryNo: delivery.deliveryNo,
    confirmed: true,
  };
  await mut("transfer_scan", { ...confirm, id: id(), barcodes: labels });
  const patch = fs.readFileSync("database/transfer-receive-119.sql", "utf8");
  await db.exec(patch);
  await db.exec(patch);
  // A genuine mismatch must identify the unit and reject the whole receipt.
  await db.query(
    "update public.md_pos_fruit_units set transfer_id=null where barcode=$1",
    [labels[1]],
  );
  await assert.rejects(mut("transfer_receive", confirm), new RegExp(labels[1]));
  assert.equal((await read()).transfers.find((x) => x.id === multi).status, "in_transit");
  await db.query("update public.md_pos_fruit_units set transfer_id=$1 where barcode=$2", [
    multi,
    labels[1],
  ]);
  await mut("transfer_receive", confirm);
  await mut("transfer_receive", confirm);
  const received = (await read()).transfers.find((x) => x.id === multi);
  assert.equal(received.status, "received");
  assert.equal(received.items.filter((x) => x.scannedAt).length, labels.length);
  const posted = await db.query(
    `select fu.barcode, fu.status, fu.transfer_id, fu.store_id,
            fu.lot_id = i.target_lot_id as correct_lot
     from md_supply.items i join public.md_pos_fruit_units fu using (barcode)
     where i.transfer_id=$1 order by fu.barcode`,
    [multi],
  );
  assert.equal(posted.rows.length, labels.length);
  for (const unit of posted.rows) {
    assert.equal(unit.status, "available");
    assert.equal(unit.store_id, store);
    assert.equal(unit.transfer_id, null);
    assert.equal(unit.correct_lot, true);
  }
  const journal = await db.query(
    `select count(*)::int as lots, sum(pieces)::int as pieces, sum(qty)::int as kg
     from public.md_pos_stock_journal where event_id=$1`,
    [confirm.id],
  );
  assert.deepEqual(journal.rows, [{ lots: 2, pieces: 2, kg: 4 }]);
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
  // Upgrade an open product-priced order, leaving issued documents intact.
  const legacy = await save();
  await as(worker);
  await out(legacy, "outbound_scan", { barcode: code(8, 1, 3000) });
  for (const patch of [
    "supplier-stock-122",
    "branch-sale-prices-123",
    "outbound-batches-126",
    "outbound-batches-126",
    "cash-flow-127",
    "cashier-expenses-128",
    "petty-cash-130",
  ]) {
    await db.exec(fs.readFileSync("database/" + patch + ".sql", "utf8"));
  }
  await out(legacy, "outbound_ready");
  await as(owner);
  assert.equal((await order(legacy)).total, 300000);
  assert.equal((await order(transfer)).total, invoice.total);
  const rateA = {
    productId: products[0],
    unit: "kg",
    price: 105000,
    sourceLotId: root.id,
  };
  const edit = {
    storeId: wh,
    kind: "transfer",
    targetId: store,
    carrier: "Pengantar",
    paymentMode: "pending",
  };
  await out(legacy, "outbound_save", { ...edit, rates: [rateA] });
  assert.equal((await order(legacy)).total, 315000);
  await out(legacy, "outbound_repack");

  const otherPlan = {
    ...plan,
    id: id(),
    invoiceNo: "SECOND-126",
    shippingCost: 20000,
    lines: [
      { productId: products[0], purchaseCost: 180000, expectedKg: 2, expectedPieces: 1 },
    ],
  };
  await mut("receipt_plan_save", otherPlan);
  await as(worker);
  await mut("receipt_scan", {
    id: id(),
    planId: otherPlan.id,
    expectedSessionRevision: 0,
    barcode: code(12),
  });
  const completed = await mut("receipt_finish", {
    id: id(),
    planId: otherPlan.id,
    expectedSessionRevision: 1,
    confirmed: true,
  });
  const lotB = completed.fruitUnits.find((u) => u.barcode === code(12)).lotId;
  const rateB = { ...rateA, sourceLotId: lotB, unit: "butir", price: 220000 };
  await assert.rejects(
    out(legacy, "outbound_scan", { barcode: code(12) }),
    /batch barcode/,
  );
  assert.equal((await order(legacy)).items.length, 1);
  await as(owner);
  for (const [rates, error] of [
    [[rateB], /sudah dipindai/],
    [[rateA, rateA], /sama sudah dipilih/],
    [[{ ...rateA, sourceLotId: null }], /Pilih batch/],
    [[{ ...rateA, productId: products[1] }], /produk dan gudang/],
    [[{ ...rateA, sourceLotId: received.lines[0].targetLotId }], /produk dan gudang/],
  ])
    await assert.rejects(out(legacy, "outbound_save", { ...edit, rates }), error);
  const updated = {
    ...edit,
    rates: [rateA, rateB],
    id: id(),
    orderId: legacy,
    expectedRevision: (await order(legacy)).revision,
  };
  await mut("outbound_save", updated);
  await mut("outbound_save", updated);
  assert.deepEqual((await order(legacy)).rates, updated.rates);
  await as(worker);
  await out(legacy, "outbound_scan", { barcode: code(12) });
  const ready = (await out(legacy, "outbound_ready")).outbound;
  assert(ready.rates.every((r) => r.sourceLotId && !("price" in r)));
  assert(ready.lines.every((l) => !("unitCost" in l)));
  await as(owner);
  await out(legacy, "outbound_issue");
  const issued = await order(legacy);
  assert.equal(issued.total, 535000);
  const lineB = issued.lines.find((line) => line.sourceLotId === lotB);
  assert.equal(lineB.unitCost, 100000);
  assert.equal(lineB.total, 220000);
  const lineA = issued.lines.find((line) => line.sourceLotId === root.id);
  assert.equal(lineA.total, 315000);
  assert.notEqual(lineA.unitCost, lineB.unitCost);
  await as(worker);
  await out(legacy, "outbound_dispatch", { confirmed: true });
  await as(owner);
  const sent = await order(legacy);
  assert.ok(sent.invoiceNo && sent.deliveryNo);
  const day = (
    await db.query("select ((now() at time zone 'Asia/Jakarta')::date)::text d")
  ).rows[0].d;
  const payment = {
    amount: 10000,
    date: day,
    method: "transfer",
    reference: "PT-130",
    paymentConfirmed: true,
  };
  await assert.rejects(out(legacy, "outbound_payment", payment), /Saldo PT Retail/);
  await db.query(
    "insert into public.md_pos_cash_deposits(id,store_id,deposit_date,created_at,amount,bank,cashier_id,cashier_name,created_by) values($1,$2,$3,now(),2000000,'BCA',$4,'Kasir',$4)",
    [id(), store, day, cashier],
  );
  const beforePayment = (await read()).retailBalance;
  await out(legacy, "outbound_payment", payment);
  assert.equal((await read()).retailBalance, beforePayment - payment.amount);
  console.log(
    "PASS batch rates: legacy upgrade, wrong-batch scan, reserved scans, repricing, distinct units/costs, retry, redaction and dispatch.",
  );
  console.log(
    "PASS warehouse workflow SQL: persistent scans, pause/reload/lock/reopen, correction without duplicate stock, barcode reservations, split destinations, custom pricing, payments, real transfers/wholesale sales, retries, redaction and access isolation.",
  );
} finally {
  await db.close();
}
