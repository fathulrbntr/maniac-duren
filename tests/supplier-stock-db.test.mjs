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
  await db.exec(fs.readFileSync("database/transfer-receive-119.sql", "utf8"));
  const migration = fs.readFileSync("database/supplier-stock-122.sql", "utf8");
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
  const scalar = (
    await db.query(
      "select id,stock_unit from public.md_pos_products where stock_unit='pcs' and item_type<>'recipe' limit 1",
    )
  ).rows[0];
  const base = {
    storeId: wh,
    supplierId: supplier,
    date: "2026-11-16",
    shippingCost: 90,
  };
  // A fruit-only invoice opened before the migration keeps its scans and weight-based freight.
  const legacyPlan = id();
  await mut("receipt_plan_save", {
    ...base,
    id: legacyPlan,
    invoiceNo: "LEGACY",
    lines: products.map((productId, i) => ({
      productId,
      purchaseCost: 600 * (i + 1),
      expectedKg: 2,
      expectedPieces: 1,
    })),
  });
  const legacyScan = (revision, barcode) =>
    mut("receipt_scan", {
      id: id(),
      planId: legacyPlan,
      expectedSessionRevision: revision,
      barcode,
    });
  await legacyScan(0, code(71, 1, 4000));
  await db.exec(migration);
  await db.exec(migration);
  await legacyScan(1, code(72, 2, 2000));
  const legacyState = await mut("receipt_finish", {
    id: id(),
    planId: legacyPlan,
    expectedSessionRevision: 2,
    confirmed: true,
  });
  const shipment = legacyState.receiptPlans.find((p) => p.id === legacyPlan).receivedId;
  const legacyLots = legacyState.lots.filter((l) => l.shipmentId === shipment);
  assert.equal(legacyLots.find((l) => l.productId === products[0]).shippingCost, 60);
  assert.equal(legacyLots.find((l) => l.productId === products[1]).shippingCost, 30);
  for (const [i, mixed] of [false, true].entries()) {
    const pid = id(),
      plan = {
        ...base,
        id: pid,
        invoiceNo: "RECEIPT-" + i,
        lines: [{ productId: scalar.id, purchaseCost: 300, expectedQty: 6 }],
      };
    if (mixed)
      plan.lines.push({
        productId: products[0],
        purchaseCost: 600,
        expectedKg: 2,
        expectedPieces: 1,
      });
    await mut("receipt_plan_save", plan);
    const get = async () => (await read()).receiptPlans.find((x) => x.id === pid);
    const request = async (extra) => ({
      id: id(),
      planId: pid,
      expectedSessionRevision: (await get()).receiving.revision,
      ...extra,
    });
    await as(worker);
    const q = await request({
      productId: scalar.id,
      qty: mixed ? 4 : 5,
      expiry: "2027-01-01",
    });
    await assert.rejects(
      mut("receipt_finish", await request({ confirmed: true })),
      /jumlah aktual|hasil scan/,
    );
    await assert.rejects(mut("receipt_quantity", { ...q, qty: 1.5 }), /bilangan bulat/);
    await as(other);
    await assert.rejects(mut("receipt_quantity", q));
    await as(worker);
    await mut("receipt_quantity", q);
    await mut("receipt_quantity", q);
    if (mixed) await mut("receipt_scan", await request({ barcode: code(1) }));
    assert.equal((await get()).receiving.quantities[scalar.id].qty, q.qty);
    const end = await request({ confirmed: true });
    await mut("receipt_finish", end);
    await mut("receipt_finish", end);
    await as(owner);
    const state = await read(),
      unit = state.unitLots.find((u) => u.planId === pid);
    assert.equal(state.supplierStockVersion, 122);
    assert.equal(unit.qty, q.qty);
    assert.equal(unit.unitCost, mixed ? 82.5 : 78);
    assert.equal(unit.invoiceNo, plan.invoiceNo);
    assert.equal(unit.shippingCost, mixed ? 30 : 90);
    if (mixed) {
      const fruit = state.lots.find((x) => x.shipmentId === unit.shipmentId);
      assert.equal(fruit.shippingCost, 60);
      assert.equal(fruit.unitCost, 330);
    }
    await mut("receipt_reopen", await request({ reason: "Hitung ulang gudang" }));
    await mut(
      "receipt_quantity",
      await request({ productId: scalar.id, qty: 3, expiry: q.expiry }),
    );
    await mut("receipt_finish", await request({ confirmed: true }));
    assert.equal(
      (await read()).unitLots.find((u) => u.id === unit.id).unitCost,
      mixed ? 110 : 130,
    );
    const corrected = {
      ...plan,
      lines: plan.lines.map((l) => ({ ...l, purchaseCost: l.purchaseCost * 2 })),
      id: id(),
      planId: pid,
      ownerConfirmed: true,
      reason: "Pembetulan nilai invoice",
      expectedRevision: (await get()).revision,
    };
    await mut("supplier_note_correct", corrected);
    assert.equal(
      (await read()).unitLots.find((u) => u.id === unit.id).unitCost,
      mixed ? 210 : 230,
    );
  }
  await assert.rejects(
    db.query("select public.pos_adjust_product_stock($1)", [{ stock: {} }]),
    /nota supplier/,
  );
  await assert.rejects(
    db.query(
      "insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,kind) values($1,$2,$3,'pcs',1,1,current_date,'opening')",
      [id(), scalar.id, wh],
    ),
    /nota supplier/,
  );
  const getCost = async () =>
    (
      await db.query("select buy_price from public.md_pos_products where id=$1", [
        scalar.id,
      ])
    ).rows[0].buy_price;
  const old = await getCost();
  await db.query("update public.md_pos_products set buy_price=999 where id=$1", [
    scalar.id,
  ]);
  assert.equal(await getCost(), old);
} finally {
  await db.close();
}
