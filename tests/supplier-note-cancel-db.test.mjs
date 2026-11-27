import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID as id } from "node:crypto";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";
import { noteBalance } from "../pos/supplier-notes.mjs";

const db = await warehouseDatabase();
try {
  const sql = (name) => fs.readFileSync("database/" + name + ".sql", "utf8");
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
    await db.exec(sql(name));
  const one = async (q, args = []) => (await db.query(q, args)).rows[0];
  const mutate = async (action, payload) =>
    (
      await one("select public.pos_warehouse_mutate($1,$2::jsonb) s", [
        action,
        JSON.stringify(payload),
      ])
    ).s;
  const read = async () => (await one("select public.pos_read() s")).s;
  const active = async (pid) => (await read()).receiptPlans.find((p) => p.id === pid);
  const as = (user) => one("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const warehouse = (
    await one("select id from md_pos_stores where location_type='warehouse' limit 1")
  ).id;
  const location = id(),
    owner = id(),
    admin = id(),
    staff = id(),
    supplier = id();
  await db.query("insert into md_pos_stores(id,name) values($1,'Jababeka')", [location]);
  await db.query("insert into md_pos_suppliers(id,name) values($1,'Supplier uji')", [
    supplier,
  ]);
  for (const [u, role] of [
    [owner, "owner"],
    [admin, "admin"],
    [staff, "manager"],
  ]) {
    await db.query("insert into auth.users values($1,$2)", [u, u + "@test.local"]);
    await db.query("insert into md_pos_staff values($1)", [u]);
    await db.query(
      "insert into md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)",
      [u, role, [location]],
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
  await db.query("update md_pos_products set barcode='9913' where id=$1", [fruit]);
  const note = {
    id: id(),
    storeId: warehouse,
    supplierId: supplier,
    date: "2026-10-01",
    invoiceNo: "CANCEL-134",
    shippingCost: 1000,
    lines: [
      { productId: fruit, purchaseCost: 10000, expectedKg: 2, expectedPieces: 1 },
      { productId: box, purchaseCost: 2000, expectedQty: 2 },
    ],
  };
  await as(owner);
  await mutate("receipt_plan_save", note);
  for (const name of [
    "branch-stock-132",
    "office-stock-transfers-133",
    "supplier-note-cancel-134",
    "supplier-note-cancel-134",
  ])
    await db.exec(sql(name));
  assert.equal((await read()).supplierNoteCancelVersion, 134);
  const request = async (pid) => {
    const p = await active(pid);
    return {
      id: id(),
      planId: pid,
      reason: "Nota ganda dari supplier",
      expectedRevision: p.revision,
      expectedSessionRevision: p.receiving.revision,
    };
  };
  const legacy = note.id;
  for (const component of ["shipping", "invoice"]) {
    const payment = {
      ...(await request(legacy)),
      component,
      amount: 500,
      date: note.date,
      method: "cash",
      reference: "Uji",
    };
    await mutate("supplier_note_payment", payment);
    await assert.rejects(
      mutate("supplier_note_cancel", await request(legacy)),
      /pembayaran.*aktif/,
    );
    await mutate("supplier_note_payment_void", {
      ...(await request(legacy)),
      paymentId: payment.id,
      reason: "Koreksi pencatatan pembayaran",
    });
  }
  await mutate("supplier_note_cancel", await request(legacy));
  assert.equal(
    (await read()).cancelledReceiptPlans[0].payments.filter((x) => x.voided).length,
    2,
  );
  const newNote = { ...note, storeId: location, id: id() };
  await mutate("receipt_plan_save", newNote);
  await assert.rejects(
    mutate("receipt_plan_save", { ...newNote, id: id() }),
    /unique|duplicate/i,
  );
  const pid = newNote.id,
    code = "92012611260000019913002000",
    stale = await request(pid);
  await as(staff);
  await assert.rejects(mutate("supplier_note_cancel", stale), /akses/i);
  const scan = { id: id(), planId: pid, expectedSessionRevision: 0, barcode: code };
  await mutate("receipt_scan", scan);
  await mutate("receipt_quantity", {
    id: id(),
    planId: pid,
    expectedSessionRevision: 1,
    productId: box,
    qty: 2,
  });
  await mutate("receipt_pause", { id: id(), planId: pid, expectedSessionRevision: 2 });
  await as(admin);
  await assert.rejects(mutate("supplier_note_cancel", stale), /berubah/);
  const cancel = await request(pid);
  await assert.rejects(
    mutate("supplier_note_cancel", { ...cancel, reason: "  " }),
    /alasan/,
  );
  let s = await mutate("supplier_note_cancel", cancel);
  s = await mutate("supplier_note_cancel", cancel);
  await assert.rejects(
    mutate("supplier_note_cancel", { ...cancel, reason: "Alasan lain" }),
    /ID operasi/,
  );
  const archived = s.cancelledReceiptPlans.filter((p) => p.id === pid);
  assert.equal(archived.length, 1);
  const [p] = archived;
  assert.equal(p.cancelled.reason, cancel.reason);
  assert.equal(p.cancelled.actor, "admin");
  assert.equal(p.receiving.scans[0].barcode, code);
  assert.equal(p.receiving.quantities[box].qty, 2);
  assert.equal(noteBalance(p, "invoice").remaining, 0);
  assert.equal(noteBalance(p, "shipping").remaining, 0);
  assert(!s.receiptPlans.some((x) => x.id === pid));
  assert(!s.lots.some((l) => l.productId === fruit));
  assert(!s.unitLots.some((l) => l.productId === box));
  for (const action of [
    "receipt_finish",
    "receipt_quantity",
    "receipt_scan",
    "receipt_expected_edit",
    "receipt_resume",
    "supplier_note_payment",
    "supplier_note_correct",
  ]) {
    await as(owner);
    await assert.rejects(mutate(action, { ...cancel, id: id() }), /dibatalkan/);
  }
  await as(staff);
  assert.deepEqual((await read()).cancelledReceiptPlans, []);
  assert(!(await read()).receiptPlans.some((p) => p.id === pid));
  await as(owner);
  const next = id();
  await mutate("receipt_plan_save", { ...newNote, id: next });
  await mutate("receipt_scan", { ...scan, id: id(), planId: next });
  await mutate("receipt_quantity", {
    id: id(),
    planId: next,
    expectedSessionRevision: 1,
    productId: box,
    qty: 2,
  });
  await mutate("receipt_finish", {
    id: id(),
    planId: next,
    expectedSessionRevision: 2,
    confirmed: true,
  });
  await assert.rejects(mutate("supplier_note_cancel", await request(next)), /dibukukan/);
  console.log(
    "PASS supplier cancellation, permissions, draft archive, stock/payment guards, retries and reuse of invoice and barcode",
  );
} finally {
  await db.close();
}
