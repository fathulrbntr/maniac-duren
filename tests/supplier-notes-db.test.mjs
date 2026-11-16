import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID as id } from "node:crypto";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";
import { noteBalance, noteUnitCosts } from "../pos/supplier-notes.mjs";
import { batchReports } from "../pos/batch-report.mjs";
const db = await warehouseDatabase();
try {
  const owner = id(),
    admin = id(),
    worker = id(),
    outsider = id(),
    store = id(),
    supplier = id();
  const wh = (
    await db.query("select id from public.md_pos_stores where location_type='warehouse'")
  ).rows[0].id;
  const products = (
    await db.query(
      "select id from public.md_pos_products where stock_unit='kg_butir' order by sku limit 2",
    )
  ).rows.map((r) => r.id);
  await db.query("insert into public.md_pos_stores(id,name) values($1,'Outlet uji')", [
    store,
  ]);
  for (const [user, role, location] of [
    [owner, "owner", wh],
    [admin, "admin", wh],
    [worker, "warehouse", wh],
    [outsider, "cashier", store],
  ]) {
    await db.query("insert into auth.users values($1,$2)", [user, user + "@test.local"]);
    await db.query("insert into public.md_pos_staff values($1)", [user]);
    await db.query(
      "insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)",
      [user, role, [location]],
    );
  }
  const as = (user) =>
    db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const read = async () => (await db.query("select public.pos_read() s")).rows[0].s;
  const mut = async (action, payload) =>
    (
      await db.query("select public.pos_warehouse_mutate($1,$2::jsonb) s", [
        action,
        JSON.stringify(payload),
      ])
    ).rows[0].s;
  await as(owner);
  await db.query(
    "insert into public.md_pos_suppliers(id,name) values($1,'Supplier uji')",
    [supplier],
  );
  await db.query("update public.md_pos_products set barcode='0001' where id=$1", [
    products[0],
  ]);
  const plan = {
    id: id(),
    storeId: wh,
    supplierId: supplier,
    invoiceNo: "NOTA-112",
    date: "2026-11-13",
    shippingCost: 10000,
    lines: [{ productId: products[0], purchaseCost: 400000 }],
  };
  await mut("receipt_plan_save", plan);
  const sql = fs.readFileSync("database/supplier-notes-112.sql", "utf8");
  await db.exec(sql);
  await db.exec(sql);
  let s = await read();
  let p = s.receiptPlans.find((p) => p.id === plan.id);
  assert.equal(s.supplierNotesVersion, 112);
  assert.equal(noteBalance(p, "invoice").status, "unknown");
  assert.equal(noteBalance(p, "shipping").status, "unknown");
  const fresh = { ...plan, id: id(), invoiceNo: "NEW-112" };
  s = await mut("receipt_plan_save", fresh);
  assert.equal(
    noteBalance(
      s.receiptPlans.find((p) => p.id === fresh.id),
      "invoice",
    ).status,
    "unpaid",
  );
  const revision = async () =>
    (await read()).receiptPlans.find((p) => p.id === plan.id).revision;
  const request = async (extra = {}) => ({
    id: id(),
    planId: plan.id,
    expectedRevision: await revision(),
    ...extra,
  });
  const correction = async (extra = {}) =>
    request({
      reason: "Koreksi salah input harga supplier",
      shippingCost: 20000,
      lines: [{ productId: products[0], purchaseCost: 500000 }],
      ownerConfirmed: true,
      ...extra,
    });
  await as(admin);
  await assert.rejects(mut("supplier_note_correct", await correction()), /Hanya owner/);
  const partial = await request({
    component: "invoice",
    amount: 100000,
    date: "2026-11-13",
    method: "transfer",
    reference: "BANK-0001",
  });
  s = await mut("supplier_note_payment", partial);
  p = s.receiptPlans.find((p) => p.id === plan.id);
  assert.equal(noteBalance(p, "invoice").status, "partial");
  assert.equal(noteBalance(p, "shipping").status, "unknown");
  await mut("supplier_note_payment", partial);
  await assert.rejects(
    mut("supplier_note_payment", { ...partial, amount: 100001 }),
    /ID operasi/,
  );
  await assert.rejects(
    mut("supplier_note_payment", { ...partial, id: id() }),
    /Nota berubah/,
  );
  const ship = await request({
    component: "shipping",
    amount: 10000,
    date: "2026-11-14",
    method: "cash",
    reference: "Sopir",
  });
  s = await mut("supplier_note_payment", ship);
  p = s.receiptPlans.find((p) => p.id === plan.id);
  assert.equal(noteBalance(p, "shipping").status, "paid");
  assert.equal(noteBalance(p, "invoice").remaining, 300000);
  for (const extra of [
    { amount: 300001 },
    { amount: -1 },
    { amount: 0 },
    { amount: 1.001 },
    { amount: "NaN" },
    { component: "other" },
    { date: "2999-01-01" },
  ]) {
    await assert.rejects(
      mut(
        "supplier_note_payment",
        await request({
          component: "invoice",
          amount: 1,
          date: "2026-11-13",
          method: "transfer",
          ...extra,
        }),
      ),
    );
  }
  const payReq = await request({
    component: "invoice",
    amount: 1.001,
    date: "2026-11-13",
    method: "transfer",
  });
  await assert.rejects(mut("supplier_note_payment", payReq), /rupiah/);
  await as(worker);
  await assert.rejects(
    mut("supplier_note_payment", await request({ ...partial, id: id() })),
  );
  assert.equal((await read()).receiptPlans.length, 2);
  await as(outsider);
  assert.equal((await read()).receiptPlans.length, 0);
  await assert.rejects(mut("supplier_note_payment", { ...partial, id: id() }));
  await as(owner);
  await assert.rejects(
    mut("supplier_note_correct", await correction({ ownerConfirmed: false })),
    /Konfirmasi/,
  );
  await assert.rejects(
    mut("supplier_note_correct", await correction({ reason: "x" })),
    /alasan/,
  );
  await assert.rejects(
    mut(
      "supplier_note_correct",
      await correction({ lines: [{ productId: products[1], purchaseCost: 500000 }] }),
    ),
    /Produk/,
  );
  const edit = await correction();
  s = await mut("supplier_note_correct", edit);
  p = s.receiptPlans.find((p) => p.id === plan.id);
  assert.equal(p.lines[0].purchaseCost, 500000);
  assert.equal(p.shippingCost, 20000);
  assert.equal(p.corrections.length, 1);
  assert.equal(noteBalance(p, "invoice").remaining, 400000);
  assert.equal(noteBalance(p, "shipping").remaining, 10000);
  await mut("supplier_note_correct", edit);
  assert.equal(
    (await read()).receiptPlans.find((p) => p.id === plan.id).corrections.length,
    1,
  );
  const code = (n) => "9201131126" + String(n).padStart(6, "0") + "0001002000";
  const batch = {
    id: id(),
    planId: plan.id,
    storeId: wh,
    supplierId: supplier,
    date: plan.date,
    invoiceNo: plan.invoiceNo,
    shippingCost: 20000,
    unloadingComplete: true,
    lines: [
      {
        id: id(),
        productId: products[0],
        purchaseCost: 500000,
        weighings: [1, 2, 3].map((n) => ({
          id: id(),
          barcode: code(n),
          kg: 2,
          pieces: 1,
          createdAt: new Date().toISOString(),
        })),
      },
    ],
  };
  const receive = async (payload) =>
    (
      await db.query("select public.pos_receive_shipment($1::jsonb) s", [
        JSON.stringify(payload),
      ])
    ).rows[0].s;
  await as(worker);
  await receive(batch);
  await as(owner);
  await mut("transfer_price_save", {
    id: id(),
    productId: products[0],
    unit: "kg",
    price: 120000,
  });
  const transfer = {
    id: id(),
    storeId: wh,
    toStoreId: store,
    carrier: "Kurir",
    barcodes: [code(1)],
    units: [],
  };
  const dispatched = await mut("transfer_dispatch", transfer);
  const deliveryNo = dispatched.transfers.find((t) => t.id === transfer.id).deliveryNo;
  await as(outsider);
  await mut("transfer_scan", {
    id: id(),
    transferId: transfer.id,
    deliveryNo,
    barcodes: [code(1)],
  });
  await mut("transfer_receive", {
    id: id(),
    transferId: transfer.id,
    deliveryNo,
    confirmed: true,
  });
  await as(owner);
  // A mixed processed lot, its transfer and downstream production retain distinct
  // supplier attribution and outlet valuation after a root price correction.
  const output = (
    await db.query("select id from public.md_pos_products where stock_unit='pcs' limit 1")
  ).rows[0].id;
  const ingredient = id(),
    processed = id(),
    unitTransfer = id(),
    downstream = id(),
    recipe = id();
  await db.query(
    "insert into public.md_pos_recipes(id,name,output_id,yield_qty) values($1,'Resep uji', $2, 2)",
    [recipe, output],
  );
  for (const [lot, loc, cost, source] of [
    [ingredient, wh, 10000, null],
    [processed, wh, 48333.333333, null],
    [unitTransfer, store, 90000, processed],
    [downstream, store, 100000, null],
  ]) {
    await db.query(
      "insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,kind,unit_cost,transfer_source_id) values($1,$2,$3,'pcs',2,2,'2026-11-13',$4,$5,$6)",
      [
        lot,
        output,
        loc,
        source ? "transfer" : lot === ingredient ? "purchase" : "production",
        cost,
        source,
      ],
    );
  }
  for (const [lot, loc, used] of [
    [
      processed,
      wh,
      [
        { lotId: batch.lines[0].id, qty: 1 },
        { lotId: ingredient, qty: 1 },
      ],
    ],
    [
      downstream,
      store,
      [
        { lotId: unitTransfer, qty: 1 },
        { lotId: ingredient, qty: 1 },
      ],
    ],
  ]) {
    await db.query(
      "insert into public.md_pos_productions(id,store_id,recipe_id,output_id,production_date,snapshot) values($1,$2,$3,$4,'2026-11-13',$5)",
      [lot, loc, recipe, output, JSON.stringify({ used })],
    );
  }
  const before = await read();
  const quantity = before.lots.map((l) => [l.id, l.kg, l.pieces]);
  const labels = before.fruitUnits;
  const oldRequest = (
    await db.query("select payload from public.md_pos_receipt_shipments where id=$1", [
      batch.id,
    ])
  ).rows[0].payload;
  s = await mut(
    "supplier_note_correct",
    await correction({
      shippingCost: 30000,
      lines: [{ productId: products[0], purchaseCost: 600000 }],
    }),
  );
  const root = s.lots.find((l) => l.id === batch.lines[0].id),
    target = s.lots.find((l) => l.sourceLotId === root.id);
  assert.equal(root.unitCost, 105000);
  assert.deepEqual(noteUnitCosts(root), { perKg: 105000, perPiece: 210000 });
  assert.equal(root.purchaseCost, 600000);
  assert.equal(root.shippingCost, 30000);
  assert.equal(target.unitCost, 120000, "issued transfer valuation remains fixed");
  assert.equal(target.supplierUnitCost, 105000);
  assert.deepEqual(
    s.lots.map((l) => [l.id, l.kg, l.pieces]),
    quantity,
  );
  assert.deepEqual(s.fruitUnits, labels);
  assert.equal(s.transfers[0].total, 240000);
  const unit = (k) => s.unitLots.find((l) => l.id === k);
  assert.equal(unit(processed).unitCost, 57500);
  assert.equal(unit(processed).supplierUnitCost, 57500);
  assert.equal(unit(unitTransfer).unitCost, 90000);
  assert.equal(unit(unitTransfer).supplierUnitCost, 57500);
  assert.equal(unit(downstream).unitCost, 50000);
  assert.equal(unit(downstream).supplierUnitCost, 33750);
  assert.deepEqual(
    s.unitLots.map((l) => [l.id, l.qty]),
    before.unitLots.map((l) => [l.id, l.qty]),
  );
  assert.deepEqual(
    (
      await db.query("select payload from public.md_pos_receipt_shipments where id=$1", [
        batch.id,
      ])
    ).rows[0].payload,
    oldRequest,
    "retry request stays immutable",
  );
  const report = batchReports(s).find((r) => r.root.id === root.id);
  assert.equal(report.root.unitCost, 105000);
  const snapshot = (
    await db.query("select snapshot from public.md_pos_productions where id=$1", [
      processed,
    ])
  ).rows[0].snapshot;
  await db.query("update public.md_pos_productions set snapshot=$1 where id=$2", [
    JSON.stringify({
      used: [
        { lotId: batch.lines[0].id, qty: 1 },
        { lotId: processed, qty: 1 },
      ],
    }),
    processed,
  ]);
  const revisionBefore = await revision();
  await assert.rejects(
    mut("supplier_note_correct", await correction({ shippingCost: 40000 })),
    /melingkar/,
  );
  assert.equal(await revision(), revisionBefore);
  assert.equal(
    (
      await db.query("select purchase_cost from public.md_pos_lots where id=$1", [
        root.id,
      ])
    ).rows[0].purchase_cost,
    "600000",
  );
  await db.query("update public.md_pos_productions set snapshot=$1 where id=$2", [
    JSON.stringify(snapshot),
    processed,
  ]);
  await as(worker);
  await receive(batch); // historical receipt retry after correction is still exactly once
  await as(owner);
  await mut(
    "supplier_note_correct",
    await correction({
      shippingCost: 0,
      lines: [{ productId: products[0], purchaseCost: 50000 }],
    }),
  );
  p = (await read()).receiptPlans.find((p) => p.id === plan.id);
  assert.equal(noteBalance(p, "invoice").status, "overpaid");
  assert.equal(noteBalance(p, "shipping").remaining, -10000);
  const voidRequest = await request({
    paymentId: partial.id,
    reason: "Pembayaran salah nomor referensi",
  });
  await as(admin);
  await assert.rejects(mut("supplier_note_payment_void", voidRequest), /owner/);
  await as(owner);
  s = await mut("supplier_note_payment_void", voidRequest);
  p = s.receiptPlans.find((p) => p.id === plan.id);
  assert.equal(noteBalance(p, "invoice").paid, 0);
  assert(p.payments.find((p) => p.id === partial.id).voided);
  await mut("supplier_note_payment_void", voidRequest);
  await db.exec(sql);
  assert.equal(
    (await read()).receiptPlans.find((p) => p.id === plan.id).corrections.length,
    3,
  );
  // Unknown legacy history can be explicitly confirmed, independently of freight.
  await mut("supplier_note_confirm_unpaid", await request({ component: "invoice" }));
  await assert.rejects(
    mut("supplier_note_confirm_unpaid", await request({ component: "shipping" })),
    /sudah memiliki/,
  );
  await as(admin);
  await assert.rejects(mut("supplier_note_correct", { ...edit, id: id() }), /owner/);
  await as(owner);
  const multi = {
    ...plan,
    id: id(),
    invoiceNo: "MULTI-112",
    shippingCost: 6000,
    lines: [
      { productId: products[0], purchaseCost: 500000 },
      { productId: products[1], purchaseCost: 100000 },
    ],
  };
  await mut("receipt_plan_save", multi);
  await db.query("update public.md_pos_products set barcode='0002' where id=$1", [
    products[1],
  ]);
  const multiBatch = {
    ...multi,
    id: id(),
    planId: multi.id,
    unloadingComplete: true,
    lines: multi.lines.map((l, i) => ({
      ...l,
      id: id(),
      weighings: [
        {
          id: id(),
          barcode: i ? "92011311260000100002004000" : code(9),
          kg: i ? 4 : 2,
          pieces: 1,
          createdAt: new Date().toISOString(),
        },
      ],
    })),
  };
  await receive(multiBatch);
  s = await mut("supplier_note_correct", {
    id: id(),
    planId: multi.id,
    expectedRevision: 0,
    ownerConfirmed: true,
    reason: "Koreksi nota berisi dua jenis buah",
    shippingCost: 9000,
    lines: [
      { productId: products[0], purchaseCost: 600000 },
      { productId: products[1], purchaseCost: 200000 },
    ],
  });
  assert.deepEqual(
    multiBatch.lines.map((l) => s.lots.find((x) => x.id === l.id).shippingCost),
    [3000, 6000],
  );
  assert.deepEqual(
    multiBatch.lines.map((l) => s.lots.find((x) => x.id === l.id).unitCost),
    [301500, 51500],
  );
  assert.equal(
    noteBalance(
      s.receiptPlans.find((x) => x.id === multi.id),
      "invoice",
    ).total,
    800000,
  );
  assert.deepEqual(
    multiBatch.lines.map((l) => noteUnitCosts(s.lots.find((x) => x.id === l.id))),
    [
      { perKg: 301500, perPiece: 603000 },
      { perKg: 51500, perPiece: 206000 },
    ],
  );
  const privileges = (
    await db.query(
      "select has_table_privilege('authenticated','md_supply.note_payments','SELECT') allowed,has_function_privilege('anon','public.pos_warehouse_mutate(text,jsonb)','EXECUTE') anon_rpc,has_function_privilege('authenticated','public.pos_warehouse_mutate_before_112(text,jsonb)','EXECUTE') bypass",
    )
  ).rows[0];
  assert.deepEqual(privileges, { allowed: false, anon_rpc: false, bypass: false });
  console.log(
    "PASS supplier notes SQL: migration repeat, legacy unknown/new unpaid, split payments, dates, partial/overpaid, owner corrections/void, revisions/retries, receipt retry, transferred batch recost, immutable quantities/barcodes/invoices, and access isolation.",
  );
} finally {
  await db.close();
}
