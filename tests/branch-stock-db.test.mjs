import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID as id } from "node:crypto";
import {
  balanceAt,
  inventorySnapshot,
  inventoryHistory,
  inventoryTotals,
} from "../pos/office-inventory.mjs";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";

const db = await warehouseDatabase();
try {
  for (const name of [
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
  ])
    await db.exec(fs.readFileSync("database/" + name + ".sql", "utf8"));
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const one = async (sql, args = []) => (await q(sql, args))[0];
  const as = (user) => q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const mut = async (action, payload) =>
    (
      await one("select public.pos_warehouse_mutate($1,$2::jsonb) result", [
        action,
        JSON.stringify(payload),
      ])
    ).result;
  const read = async () => (await one("select public.pos_read() s")).s;
  const wh = (await one("select id from md_pos_stores where location_type='warehouse'"))
    .id;
  const origin = id(),
    target = id(),
    office = id(),
    admin = id(),
    sender = id(),
    receiver = id(),
    supplier = id(),
    plan = id();
  await q(
    "insert into md_pos_stores(id,name) values ($1,'Cikarang'),($2,'Harapan Indah')",
    [origin, target],
  );
  await q("insert into md_pos_suppliers(id,name) values ($1,'Supplier Uji')", [supplier]);
  for (const [user, role, loc] of [
    [office, "owner", origin],
    [admin, "admin", target],
    [sender, "manager", origin],
    [receiver, "cashier", target],
  ]) {
    await q("insert into auth.users values($1,$2)", [user, user + "@test.local"]);
    await q("insert into md_pos_staff values($1)", [user]);
    await q(
      "insert into md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)",
      [user, role, [loc]],
    );
  }
  const fruit = (
    await one("select id from md_pos_products where stock_unit='kg_butir' limit 1")
  ).id;
  const box = (
    await one(
      "select id from md_pos_products where stock_unit='pcs' and item_type<>'recipe' limit 1",
    )
  ).id;
  const day = (await one("select ((now() at time zone 'Asia/Jakarta')::date)::text d")).d;
  const labels = Array.from(
    { length: 100 },
    (_, i) => "9201261126" + String(i + 1).padStart(6, "0") + "9913002000",
  );
  await q("update md_pos_products set barcode='9913' where id=$1", [fruit]);
  await as(office);
  const note = {
    id: plan,
    storeId: origin,
    supplierId: supplier,
    date: day,
    invoiceNo: "DIRECT-001",
    shippingCost: 0,
    lines: [
      { productId: fruit, purchaseCost: 10000000, expectedKg: 200, expectedPieces: 100 },
      { productId: box, purchaseCost: 11000, expectedQty: 10 },
    ],
  };
  const warehousePlan = id();
  await mut("receipt_plan_save", {
    ...note,
    id: warehousePlan,
    storeId: wh,
    invoiceNo: "GUDANG-LAMA-001",
    lines: [{ productId: box, purchaseCost: 2200, expectedQty: 2 }],
  });
  const migration = fs.readFileSync("database/branch-stock-132.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration);
  await assert.rejects(mut("receipt_plan_save", { ...note, storeId: wh }), /Lokasi/);
  await mut("receipt_plan_save", note);
  await assert.rejects(
    one("select public.pos_admin_mutate('expense_save',$1::jsonb)", [
      JSON.stringify({
        id: id(),
        storeId: wh,
        funding: "distribution",
        date: day,
        category: "Lainnya",
        amount: 1000,
        payment: "transfer",
        description: "Biaya gudang",
      }),
    ]),
    /saldo PT Retail/,
  );
  await assert.rejects(mut("outbound_save", { id: id(), storeId: wh }), /Distribusi/);
  await as(receiver);
  assert.equal((await read()).receiptPlans.length, 0);
  await assert.rejects(
    mut("receipt_scan", {
      id: id(),
      planId: plan,
      expectedSessionRevision: 0,
      barcode: labels[0],
    }),
    /akses/,
  );
  await as(sender);
  assert.equal((await read()).branchStockVersion, 132);
  assert.ok((await read()).locations.some((l) => l.id === target));
  const receive = (action, rev, extra) =>
    mut(action, { id: id(), planId: plan, expectedSessionRevision: rev, ...extra });
  for (const [i, barcode] of labels.entries())
    await receive("receipt_scan", i, { barcode });
  await receive("receipt_quantity", 100, { productId: box, qty: 10 });
  await receive("receipt_finish", 101, { confirmed: true });
  const state = await read(),
    lot = state.lots.find((l) => l.productId === fruit && l.storeId === origin),
    unit = state.unitLots.find((l) => l.productId === box && l.storeId === origin);
  assert.equal(lot.pieces, 100);
  assert.equal(lot.kg, 200);
  assert.equal(unit.qty, 10);
  const send = {
    id: id(),
    storeId: origin,
    toStoreId: target,
    senderEmployeeId: sender,
    carrier: state.people.find((p) => p.id === sender).name,
    barcodes: labels.slice(0, 30),
    units: [{ lotId: unit.id, qty: 3 }],
  };
  const transferPolicy = fs.readFileSync(
    "database/office-stock-transfers-133.sql",
    "utf8",
  );
  const installedRpc = (
    await one(
      "select pg_get_functiondef('public.pos_warehouse_mutate(text,jsonb)'::regprocedure) def",
    )
  ).def;
  await db.exec(installedRpc.replace(/\r?\n/g, "\r\n"));
  await db.exec(transferPolicy);
  await db.exec(transferPolicy.replace(/\r?\n/g, "\r\n"));
  await assert.rejects(mut("transfer_dispatch", send), /akses/i);
  assert.equal((await read()).lots.find((l) => l.id === lot.id).pieces, 100);
  await as(admin);
  await assert.rejects(
    mut("transfer_dispatch", { ...send, toStoreId: origin }),
    /tujuan/,
  );
  await assert.rejects(
    mut("transfer_dispatch", { ...send, barcodes: [labels[0], labels[0]] }),
    /terduplikasi/,
  );
  await assert.rejects(
    mut("transfer_dispatch", { ...send, units: [{ lotId: unit.id, qty: 11 }] }),
    /cukup|valid/,
  );
  await mut("transfer_dispatch", send);
  await mut("transfer_dispatch", send);
  let s = await read();
  assert.equal(s.lots.find((l) => l.id === lot.id).pieces, 70);
  const t = s.transfers.find((t) => t.id === send.id);
  const moving = inventorySnapshot(s);
  const fruitInTransit = moving.find((r) => r.product.id === fruit);
  assert.deepEqual(fruitInTransit.balance, {
    onHand: 140,
    pieces: 70,
    transit: 60,
    transitPieces: 30,
  });
  assert.equal(balanceAt(fruitInTransit, origin).transitPieces, 0);
  assert.equal(balanceAt(fruitInTransit, target).transitPieces, 30);
  assert.deepEqual(inventoryTotals(moving).get("pcs"), {
    onHand: 7,
    pieces: 0,
    transit: 3,
    transitPieces: 0,
  });
  assert.equal(t.carrier, send.carrier);
  assert.equal(
    (
      await one(
        "select request->>'senderEmployeeId' emp from md_supply.events where id=$1",
        [send.id],
      )
    ).emp,
    sender,
  );
  assert.equal(t.invoiceNo, null);
  assert.match(t.deliveryNo, /^SJ-CBG-/);
  assert.equal(t.items.length, 30);
  assert.equal(s.fruitUnits.filter((u) => u.status === "in_transit").length, 30);
  assert.equal(s.unitLots.find((l) => l.id === unit.id).qty, 7);
  await assert.rejects(mut("transfer_dispatch", { ...send, id: id() }), /tersedia/);
  const accept = {
    id: id(),
    transferId: t.id,
    deliveryNo: t.deliveryNo,
    confirmed: true,
    fruitCounts: { [lot.id]: 30 },
    units: [{ lotId: unit.id, qty: 3 }],
  };
  await as(sender);
  await assert.rejects(mut("transfer_receive", accept), /akses/);
  await as(receiver);
  await assert.rejects(
    mut("transfer_receive", { ...accept, fruitCounts: { [lot.id]: 29 } }),
    /Jumlah fisik/,
  );
  await assert.rejects(
    mut("transfer_receive", { ...accept, units: [{ lotId: unit.id, qty: 2 }] }),
    /sesuai surat jalan/,
  );
  await mut("transfer_receive", accept);
  await mut("transfer_receive", accept);
  await as(office);
  s = await read();
  const dest = s.lots.find((l) => l.storeId === target && l.sourceLotId === lot.id);
  assert.equal(dest.pieces, 30);
  assert.equal(dest.kg, 60);
  const delivered = inventorySnapshot(s);
  assert.deepEqual(delivered.find((r) => r.product.id === fruit).balance, {
    onHand: 200,
    pieces: 100,
    transit: 0,
    transitPieces: 0,
  });
  assert.equal(inventoryTotals(delivered, target).get("pcs").onHand, 3);
  const history = inventoryHistory(s, fruit, "");
  const dispatched = history.find((j) => j.action === "transfer_dispatch");
  assert.equal(dispatched.pieces, -30);
  assert.equal(dispatched.reference, t.deliveryNo);
  assert.equal(dispatched.route, "Cikarang → Harapan Indah");
  const accepted = inventoryHistory(s, box, target).filter(
    (j) => j.action === "transfer_receive",
  );
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].qty, 3);
  assert.equal(accepted[0].reference, t.deliveryNo);
  assert.ok(history.some((j) => j.reference === "DIRECT-001" && j.pieces === 100));

  assert.equal(dest.unitCost, 50000);
  assert.equal(dest.supplierId, supplier);
  assert.equal(
    s.fruitUnits.filter(
      (u) =>
        u.storeId === target && u.status === "available" && u.receiptLotId === lot.id,
    ).length,
    30,
  );
  assert.equal(s.lots.find((l) => l.id === lot.id).pieces, 70);
  assert.equal(
    s.unitLots.find((l) => l.storeId === target && l.sourceLotId === unit.id).unitCost,
    1100,
  );
  assert.equal(s.outboundOrders.length, 0);
  assert.equal(s.transfers[0].total, 0);
  await assert.rejects(
    mut("transfer_payment", { id: id(), transferId: t.id, amount: 1, reference: "Uji" }),
    /tidak memiliki tagihan/,
  );
  const cashFlow = (
    await one("select pos_cash_flow_read($1) r", [JSON.stringify({ from: day, to: day })])
  ).r;
  assert.equal(cashFlow.branchStockVersion, 132);
  assert.ok(!cashFlow.rows.some((r) => r.kind === "transfer_invoice"));
  const pay = {
    id: id(),
    planId: plan,
    expectedRevision: s.receiptPlans.find((p) => p.id === plan).revision,
    component: "invoice",
    amount: 1000,
    date: day,
    method: "transfer",
    reference: "Bukti",
  };
  await assert.rejects(mut("supplier_note_payment", pay), /Saldo PT Retail/);
  await q(
    "insert into public.md_pos_cash_deposits(id,store_id,deposit_date,created_at,amount,bank,cashier_id,cashier_name,created_by) values ($1,$2,$3,now(),10000,'BCA',$4,'Petugas',$4)",
    [id(), origin, day, office],
  );
  await mut("supplier_note_payment", pay);
  await mut("supplier_note_payment", pay);
  assert.equal((await read()).retailBalance, 9000);
  const rpt = (
    await one("select pos_cash_flow_read($1) r", [
      JSON.stringify({ from: day, to: day, store: origin }),
    ])
  ).r;
  assert.equal(rpt.rows.find((r) => r.kind === "retail_supplier_invoice").amount, 1000);
  assert.ok(!rpt.rows.some((r) => r.kind === "supplier_invoice"));
  await mut("supplier_note_correct", {
    id: id(),
    planId: plan,
    expectedRevision: (await read()).receiptPlans.find((p) => p.id === plan).revision,
    ownerConfirmed: true,
    reason: "Koreksi nilai nota supplier",
    shippingCost: 0,
    lines: [
      { productId: fruit, purchaseCost: 10200000 },
      { productId: box, purchaseCost: 12000 },
    ],
  });
  const revised = await read();
  assert.equal(revised.lots.find((l) => l.id === dest.id).unitCost, 51000);
  assert.equal(
    revised.unitLots.find((l) => l.storeId === target && l.sourceLotId === unit.id)
      .unitCost,
    1200,
  );
  // A note already opened in the warehouse can be finished and its remaining stock moved once.
  await mut("receipt_quantity", {
    id: id(),
    planId: warehousePlan,
    expectedSessionRevision: 0,
    productId: box,
    qty: 2,
  });
  await mut("receipt_finish", {
    id: id(),
    planId: warehousePlan,
    expectedSessionRevision: 1,
    confirmed: true,
  });
  const remaining = (await read()).unitLots.find(
    (l) => l.storeId === wh && l.productId === box,
  );
  const moveOld = {
    id: id(),
    storeId: wh,
    toStoreId: target,
    carrier: "Pindah stok lama",
    barcodes: [],
    units: [{ lotId: remaining.id, qty: 2 }],
  };
  await as(sender);
  await assert.rejects(mut("transfer_dispatch", moveOld), /akses|lokasi/i);
  await as(office);
  await mut("transfer_dispatch", moveOld);
  const legacyMove = (await read()).transfers.find((t) => t.id === moveOld.id);
  assert.equal(legacyMove.invoiceNo, null);
  await as(receiver);
  await mut("transfer_receive", {
    id: id(),
    transferId: moveOld.id,
    deliveryNo: legacyMove.deliveryNo,
    confirmed: true,
    fruitCounts: {},
    units: moveOld.units,
  });
  await as(office);
  const moved = (await read()).unitLots.find(
    (l) => l.sourceLotId === remaining.id && l.storeId === target,
  );
  assert.equal(moved.qty, 2);
  assert.equal(moved.unitCost, 1100);
  const oldOrder = id(),
    keeper = id();
  await q("insert into auth.users values($1,$2)", [keeper, keeper + "@test.local"]);
  await q("insert into md_pos_staff values($1)", [keeper]);
  await q(
    "insert into md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,'Petugas','warehouse',$2)",
    [keeper, [wh]],
  );
  await q(
    "insert into md_supply.outbound_orders(id,kind,source_id,target_id,rates,payment_mode,carrier,created_by) values($1,'transfer',$2,$3,'[]','pending','Petugas',$4)",
    [oldOrder, wh, target, office],
  );
  const legacyPayload = {
    id: id(),
    orderId: oldOrder,
    expectedRevision: 0,
    confirmed: true,
  };
  await as(keeper);
  await assert.rejects(mut("outbound_dispatch", legacyPayload), /akses/i);
  await as(admin);
  await assert.rejects(mut("outbound_dispatch", legacyPayload), /menerbitkan dokumen/i);
  console.log(
    "PASS 133: supplier to Cikarang 100 fruit + 10 packs, transfer 30 fruit + 3 packs, receipt, location isolation, retries and no invoice.",
  );
  await db.exec(fs.readFileSync("database/supplier-note-cancel-134.sql", "utf8"));
  const staged = fs.readFileSync("database/branch-transfer-notes-135.sql", "utf8");
  await db.exec(staged);
  await db.exec(staged);
  await as(office);
  const create = {
    id: id(),
    storeId: origin,
    toStoreId: target,
    senderEmployeeId: sender,
    lines: [
      { productId: fruit, qty: 12 },
      { productId: box, qty: 3 },
    ],
  };
  const noteStatus = async () =>
    (await read()).branchNotes.find((x) => x.id === create.id);
  const step = (action, rev, extra = {}) =>
    mut("branch_note_" + action, {
      id: id(),
      noteId: create.id,
      revision: rev,
      ...extra,
    });
  await assert.rejects(mut("transfer_dispatch", { ...send, id: id() }), /nota transfer/i);
  await mut("branch_note_create", create);
  await mut("branch_note_create", create);
  assert.equal((await noteStatus()).deliveryNo, null);
  await assert.rejects(step("approve", 0), /status/);
  await as(receiver);
  assert.equal(await noteStatus(), undefined);
  await assert.rejects(step("pack", 0, { barcodes: [], quantities: [] }), /akses/i);
  await as(sender);
  await assert.rejects(step("approve", 0), /akses/i);
  await assert.rejects(
    step("pack", 0, { barcodes: [labels[0]], quantities: [] }),
    /Barcode/,
  );
  await assert.rejects(
    step("pack", 0, { barcodes: [labels[70], labels[70]], quantities: [] }),
    /Barcode/,
  );
  const pack = {
    barcodes: labels.slice(70, 75),
    quantities: [{ productId: box, qty: 2 }],
  };
  await assert.rejects(
    step("pack", 0, { ...pack, quantities: [{ productId: box, qty: 200 }] }),
    /melebihi stok/,
  );
  const beforeShip = (await read()).lots.find((x) => x.id === lot.id).pieces;
  await step("pack", 0, pack);
  assert.equal((await noteStatus()).lines.find((x) => x.kind === "fruit").kg, 10);
  await assert.rejects(
    q("update md_pos_fruit_units set status=status where barcode=$1", [labels[70]]),
    /nota transfer/,
  );
  await assert.rejects(
    q("update md_pos_unit_lots set qty=0 where id=$1", [unit.id]),
    /dipesan/,
  );
  await assert.rejects(step("ship", 1), /status/);
  await as(office);
  await step("return", 1);
  await as(sender);
  await step("pack", 2, pack);
  await as(office);
  await assert.rejects(step("approve", 1), /berubah/);
  await step("approve", 3);
  const approved = await noteStatus();
  assert.match(approved.deliveryNo, /^SJ-CBG-/);
  assert.equal((await read()).lots.find((x) => x.id === lot.id).pieces, beforeShip);
  await as(sender);
  const ship = { id: id(), noteId: create.id, revision: 4 };
  await mut("branch_note_ship", ship);
  await mut("branch_note_ship", ship);
  const sent = await noteStatus();
  assert.equal(sent.transferStatus, "in_transit");
  assert.equal((await read()).lots.find((x) => x.id === lot.id).pieces, beforeShip - 5);
  await as(receiver);
  await mut("transfer_receive", {
    id: id(),
    transferId: sent.transferId,
    deliveryNo: approved.deliveryNo,
    confirmed: true,
    fruitCounts: { [lot.id]: 5 },
    units: [{ lotId: unit.id, qty: 2 }],
  });
  await as(office);
  assert.equal((await noteStatus()).transferStatus, "received");
  assert.equal(
    (await read()).transfers.find((t) => t.id === sent.transferId).invoiceNo,
    null,
  );
  const earlierReceipt = id();
  const previousDay = (await one("select ($1::date-1)::text d", [day])).d;
  await mut("receipt_plan_save", {
    ...note,
    id: earlierReceipt,
    invoiceNo: "FIFO-135",
    date: previousDay,
    lines: [{ productId: box, purchaseCost: 2000, expectedQty: 1 }],
  });
  await mut("receipt_quantity", {
    id: id(),
    planId: earlierReceipt,
    expectedSessionRevision: 0,
    productId: box,
    qty: 1,
  });
  await mut("receipt_finish", {
    id: id(),
    planId: earlierReceipt,
    expectedSessionRevision: 1,
    confirmed: true,
  });
  const earlierLot = (
    await one("select id from md_pos_unit_lots where receipt_plan_id=$1", [
      earlierReceipt,
    ])
  ).id;
  const draftId = id(),
    otherId = id();
  for (const noteId of [draftId, otherId])
    await mut("branch_note_create", { ...create, id: noteId });
  const holds = { barcodes: [labels[85]], quantities: [{ productId: box, qty: 3 }] };
  const draftPayload = { id: id(), noteId: draftId, revision: 0, ...holds };
  await as(sender);
  await mut("branch_note_draft", draftPayload);
  await mut("branch_note_draft", draftPayload);
  const saved = (await read()).branchNotes.find((n) => n.id === draftId);
  assert.equal(saved.status, "packing");
  assert.deepEqual(
    saved.lines.filter((l) => l.kind === "unit").map((l) => [l.sourceLotId, l.qty]),
    [
      [earlierLot, 1],
      [unit.id, 2],
    ],
  );
  await assert.rejects(
    mut("branch_note_pack", { id: id(), noteId: otherId, revision: 0, ...holds }),
    /Barcode/,
  );
  await as(office);
  await mut("branch_note_cancel", { id: id(), noteId: draftId, revision: 1 });
  await as(sender);
  await mut("branch_note_pack", { id: id(), noteId: otherId, revision: 0, ...holds });
  assert.equal((await read()).branchNotes.find((n) => n.id === otherId).status, "ready");
  console.log(
    "PASS 135: estimate, source packing, stock reservations, approval, actual dispatch and destination receipt.",
  );
} finally {
  await db.close();
}
