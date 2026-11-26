import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID as id } from "node:crypto";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";

const db = await warehouseDatabase();
try {
  for (const patch of [
    "supplier-notes-112",
    "warehouse-workflow-114",
    "transfer-receive-119",
    "supplier-stock-122",
    "branch-sale-prices-123",
    "outbound-batches-126",
    "cash-flow-127",
    "cashier-expenses-128",
    "petty-cash-130",
    "outbound-units-131",
    "outbound-units-131",
  ])
    await db.exec(fs.readFileSync("database/" + patch + ".sql", "utf8"));
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const as = (user) => q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const read = async () => (await q("select public.pos_read() s"))[0].s;
  const mut = async (a, p) =>
    (
      await q("select public.pos_warehouse_mutate($1,$2::jsonb) s", [
        a,
        JSON.stringify(p),
      ])
    )[0].s;
  const wh = (await q("select id from md_pos_stores where location_type='warehouse'"))[0]
    .id;
  const store = id(),
    owner = id(),
    worker = id(),
    cashier = id(),
    supplier = id(),
    other = id();
  await q("insert into md_pos_stores(id,name) values($1,'Toko uji')", [store]);
  await q("insert into md_pos_suppliers(id,name) values($1,'Supplier uji')", [supplier]);
  for (const [user, role, loc] of [
    [owner, "owner", wh],
    [worker, "warehouse", wh],
    [cashier, "cashier", store],
    [other, "cashier", wh],
  ]) {
    await q("insert into auth.users values($1,$2)", [user, user + "@test.local"]);
    await q("insert into md_pos_staff values($1)", [user]);
    await q(
      "insert into md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)",
      [user, role, [loc]],
    );
  }
  const fruit = (
    await q("select id from md_pos_products where stock_unit='kg_butir' limit 1")
  )[0].id;
  const pcs = (
    await q(
      "select id from md_pos_products where stock_unit='pcs' and item_type<>'recipe' limit 1",
    )
  )[0].id;
  const liquid = id();
  await q(
    "insert into md_pos_products(id,name,sku,item_type,stock_unit,category) values($1,'Susu','SUSU131','raw','ml',null)",
    [liquid],
  );
  await q("update md_pos_products set barcode='9913' where id=$1", [fruit]);
  const barcode = "92012611260000019913002000",
    planId = id();
  const day = (await q("select ((now() at time zone 'Asia/Jakarta')::date)::text d"))[0]
    .d;
  await as(owner);
  await mut("receipt_plan_save", {
    id: planId,
    storeId: wh,
    supplierId: supplier,
    date: day,
    invoiceNo: "SUP-131",
    shippingCost: 0,
    lines: [
      { productId: pcs, purchaseCost: 10000, expectedQty: 10 },
      { productId: liquid, purchaseCost: 50000, expectedQty: 500 },
      { productId: fruit, purchaseCost: 80000, expectedKg: 2, expectedPieces: 1 },
    ],
  });
  await as(worker);
  const receive = (action, rev, p) =>
    mut(action, { id: id(), planId, expectedSessionRevision: rev, ...p });
  await receive("receipt_quantity", 0, { productId: pcs, qty: 10 });
  await receive("receipt_quantity", 1, {
    productId: liquid,
    qty: 500,
    expiry: "2099-01-01",
  });
  await receive("receipt_scan", 2, { barcode });
  await receive("receipt_finish", 3, { confirmed: true });
  await as(owner);
  let state = await read();
  assert.equal(state.outboundBatchVersion, 131);
  const lot = state.unitLots.find((l) => l.productId === pcs),
    milk = state.unitLots.find((l) => l.productId === liquid),
    durian = state.lots.find((l) => l.productId === fruit);
  const pieceRate = {
    kind: "unit",
    sourceLotId: lot.id,
    productId: pcs,
    unit: "pcs",
    qty: 4,
    price: 1500,
  };
  const milkRate = {
    kind: "unit",
    sourceLotId: milk.id,
    productId: liquid,
    unit: "ml",
    qty: 25.5,
    price: 200,
  };
  const fruitRate = {
    sourceLotId: durian.id,
    productId: fruit,
    unit: "kg",
    price: 90000,
  };
  const save = (rates, extra = {}) =>
    mut("outbound_save", {
      id: id(),
      storeId: wh,
      kind: "transfer",
      paymentMode: "pending",
      targetId: store,
      carrier: "Kurir",
      rates,
      ...extra,
    });
  await assert.rejects(save([{ ...pieceRate, qty: 1.2 }]), /bilangan bulat/);
  await assert.rejects(save([{ ...pieceRate, qty: 11 }]), /melebihi stok/);
  await assert.rejects(save([{ ...pieceRate, unit: "ml" }]), /satuan/);
  await assert.rejects(save([{ ...pieceRate, productId: liquid }]), /Batch nonbuah/);
  await assert.rejects(save([pieceRate, pieceRate]), /sama/);
  await assert.rejects(
    save([pieceRate], { kind: "wholesale", buyer: { name: "Wholesale" } }),
    /transfer toko/,
  );
  const mixed = id(),
    single = id();
  await save([fruitRate, pieceRate, milkRate], { id: mixed });
  await assert.rejects(save([{ ...pieceRate, qty: 7 }]), /melebihi stok/);
  await save([{ ...pieceRate, qty: 6 }], { id: single });
  await assert.rejects(
    q("update md_pos_unit_lots set qty=9 where id=$1", [lot.id]),
    /dipesan/,
  );
  await assert.rejects(
    receive("receipt_reopen", 4, { reason: "Periksa barang" }),
    /penyiapan/,
  );
  const order = async (doc) => (await read()).outboundOrders.find((o) => o.id === doc);
  const command = async (doc, act, p = {}) =>
    mut(act, {
      id: id(),
      orderId: doc,
      expectedRevision: (await order(doc)).revision,
      ...p,
    });
  await as(worker);
  const counts = { [lot.id]: 4, [milk.id]: 25.5 };
  assert.equal(
    (await order(mixed)).rates.find((r) => r.kind === "unit").price,
    undefined,
  );
  await assert.rejects(
    command(mixed, "outbound_ready", { unitCounts: counts }),
    /Scan barang/,
  );
  await command(mixed, "outbound_scan", { barcode });
  await assert.rejects(command(mixed, "outbound_ready"), /jumlah fisik/);
  await assert.rejects(
    command(mixed, "outbound_ready", { unitCounts: { ...counts, [milk.id]: 25 } }),
    /Jumlah fisik/,
  );
  await command(mixed, "outbound_ready", { unitCounts: counts });
  await command(single, "outbound_ready", { unitCounts: { [lot.id]: 6 } });
  await as(owner);
  await assert.rejects(
    save([fruitRate, { ...pieceRate, qty: 3 }, milkRate], {
      orderId: mixed,
      expectedRevision: (await order(mixed)).revision,
    }),
    /Buka ulang/,
  );
  for (const doc of [mixed, single]) await command(doc, "outbound_issue");
  let issued = await order(mixed);
  assert.equal(issued.total, 191100);
  assert.ok(issued.invoiceNo && issued.deliveryNo);
  assert.equal(issued.lines.find((l) => l.productId === liquid).unitCost, 100);
  assert.equal((await read()).unitLots.find((l) => l.id === lot.id).qty, 10);
  await as(worker);
  for (const doc of [mixed, single]) {
    const dispatch = {
      id: id(),
      orderId: doc,
      expectedRevision: (await order(doc)).revision,
      confirmed: true,
    };
    await mut("outbound_dispatch", dispatch);
    await mut("outbound_dispatch", dispatch);
  }
  assert.equal((await read()).unitLots.find((l) => l.id === lot.id).qty, 0);
  await as(cashier);
  state = await read();
  assert.ok(!state.unitLots.some((l) => l.sourceLotId === lot.id));
  const accept = {
    id: id(),
    transferId: mixed,
    deliveryNo: issued.deliveryNo,
    confirmed: true,
    units: [
      { lotId: lot.id, qty: 4 },
      { lotId: milk.id, qty: 25.5 },
    ],
  };
  await assert.rejects(mut("transfer_receive", accept), /barcode/);
  await mut("transfer_scan", {
    id: id(),
    transferId: mixed,
    deliveryNo: issued.deliveryNo,
    barcodes: [barcode],
  });
  await assert.rejects(
    mut("transfer_receive", {
      ...accept,
      units: [
        { lotId: lot.id, qty: 3 },
        { lotId: milk.id, qty: 25.5 },
      ],
    }),
    /sesuai surat jalan/,
  );
  assert.ok(!(await read()).unitLots.some((l) => l.sourceLotId === milk.id));
  await as(other);
  await assert.rejects(mut("transfer_receive", accept), /akses/i);
  await as(cashier);
  await mut("transfer_receive", accept);
  await mut("transfer_receive", accept);
  const only = (await read()).transfers.find((t) => t.id === single);
  assert.equal(only.items.length, 0);
  await mut("transfer_receive", {
    id: id(),
    transferId: single,
    deliveryNo: only.deliveryNo,
    confirmed: true,
    units: [{ lotId: lot.id, qty: 6 }],
  });
  await as(owner);
  state = await read();
  const delivered = state.unitLots.filter((l) => l.sourceLotId === lot.id);
  assert.equal(delivered.length, 2);
  assert.equal(
    delivered.reduce((v, l) => v + l.qty, 0),
    10,
  );
  assert.ok(
    delivered.every(
      (l) => l.storeId === store && l.supplierUnitCost === 1000 && l.unitCost === 1500,
    ),
  );
  const poured = state.unitLots.find((l) => l.sourceLotId === milk.id);
  assert.equal(poured.qty, 25.5);
  assert.equal(poured.expiry, "2099-01-01");
  assert.equal(state.unitLots.find((l) => l.id === milk.id).qty, 474.5);
  const secondPlan = id();
  await mut("receipt_plan_save", {
    id: secondPlan,
    storeId: wh,
    supplierId: supplier,
    date: day,
    invoiceNo: "SUSU-2",
    shippingCost: 0,
    lines: [{ productId: liquid, purchaseCost: 2000, expectedQty: 10 }],
  });
  await as(worker);
  await mut("receipt_quantity", {
    id: id(),
    planId: secondPlan,
    expectedSessionRevision: 0,
    productId: liquid,
    qty: 10,
  });
  await mut("receipt_finish", {
    id: id(),
    planId: secondPlan,
    expectedSessionRevision: 1,
    confirmed: true,
  });
  await as(owner);
  const secondMilk = (await read()).unitLots.find((l) => l.planId === secondPlan);
  const twoLots = id();
  const secondRate = { ...milkRate, sourceLotId: secondMilk.id, qty: 2, price: 300 };
  await save([{ ...milkRate, qty: 1.5 }, secondRate], { id: twoLots });
  await as(worker);
  await command(twoLots, "outbound_ready", {
    unitCounts: { [milk.id]: 1.5, [secondMilk.id]: 2 },
  });
  await as(owner);
  await command(twoLots, "outbound_issue");
  const milkInvoice = await order(twoLots);
  assert.deepEqual(
    milkInvoice.lines.map((l) => [l.sourceLotId, l.qty, l.unitCost]),
    [
      [milk.id, 1.5, 100],
      [secondMilk.id, 2, 200],
    ],
  );
  assert.equal(milkInvoice.total, 900);
  await command(twoLots, "outbound_cancel", { reason: "Pembatalan pengiriman" });
  await save([{ ...secondRate, qty: 10 }]);
  assert.equal((await read()).unitLots.find((l) => l.id === secondMilk.id).qty, 10);
  console.log(
    "PASS: mixed and unit-only branch transfers, reservations, batch quantities, cost, invoice, dispatch and receipt retries.",
  );
} finally {
  await db.close();
}
