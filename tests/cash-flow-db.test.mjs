import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID as id } from "node:crypto";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";
import { cashFlowSheets } from "../pos/cash-flow.mjs";

const db = await warehouseDatabase();
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const readFile = (name) => fs.readFileSync("database/" + name + ".sql", "utf8");
try {
  for (const patch of [
    "supplier-notes-112",
    "warehouse-workflow-114",
    "transfer-receive-119",
    "supplier-stock-122",
    "branch-sale-prices-123",
    "outbound-batches-126",
  ])
    await db.exec(readFile(patch));
  const owner = id(),
    worker = id(),
    store = id(),
    other = id();
  const [{ id: wh }] = await query(
    "select id from public.md_pos_stores where location_type='warehouse'",
  );
  await query(
    "insert into public.md_pos_stores(id,name) values($1,'Toko A'),($2,'Toko B')",
    [store, other],
  );
  for (const [actor, role, location] of [
    [owner, "owner", store],
    [worker, "warehouse", wh],
  ]) {
    await query("insert into auth.users values($1,$2)", [actor, actor + "@example.test"]);
    await query("insert into public.md_pos_staff values($1)", [actor]);
    await query(
      "insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)",
      [actor, role, [location]],
    );
  }
  const as = (actor) =>
    query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await as(owner);
  const mut = async (action, payload, rpc = "pos_mutate_027") =>
    (
      await query(`select public.${rpc}($1,$2) result`, [action, JSON.stringify(payload)])
    )[0].result;
  const expense = {
    id: id(),
    storeId: store,
    date: "2026-02-02",
    category: "Gaji",
    description: "Contoh gaji",
    amount: 150,
    payment: "Transfer",
  };
  await mut("expense_save", expense);
  await db.exec(readFile("cash-flow-127"));
  await db.exec(readFile("cash-flow-127"));
  const read = async (from = "2026-02-01", to = "2026-02-28", filter = "") =>
    (
      await query("select public.pos_cash_flow_read($1) value", [
        JSON.stringify({ from, to, store: filter }),
      ])
    )[0].value;
  const value = (r, k, column = "amount") =>
    r.rows.filter((x) => x.kind === k).reduce((a, x) => a + x[column], 0);
  assert.equal(value(await read(), "unassigned_expense"), 150);
  const funding = { id: id(), expenseId: expense.id, storeId: store, funding: "retail" };
  await mut("expense_funding", funding, "pos_warehouse_mutate");
  await mut("expense_funding", funding, "pos_warehouse_mutate");
  await assert.rejects(
    mut(
      "expense_funding",
      { ...funding, id: id(), funding: "store" },
      "pos_warehouse_mutate",
    ),
    /sudah ditetapkan/,
  );
  await assert.rejects(
    mut("expense_save", { ...expense, id: id(), funding: "distribution" }),
    /sumber dana/,
  );
  await assert.rejects(mut("expense_save", { ...expense, id: id() }), /sumber dana/);
  await mut("expense_save", {
    ...expense,
    id: id(),
    funding: "store",
    payment: "Tunai",
    amount: 50,
  });
  await mut("expense_save", {
    ...expense,
    id: id(),
    storeId: other,
    funding: "retail",
    amount: 30,
  });
  // Historical sales and the duplicate sale projection of a paid order.
  await query("select public.pos_cashier_shift_mutate('cashier_shift_open',$1)", [
    JSON.stringify({ id: id(), storeId: store, openingCash: 200 }),
  ]);
  const orderId = id();
  await query(
    "insert into public.md_pos_order_runs(id,store_id,created_by,business_date,paid_date,status,lines,total,payment_status,paid,payment) values($1,$2,$3,'2026-01-31','2026-01-31','paid','[]',1000,'paid',1200,'Tunai')",
    [orderId, store, owner],
  );
  await query(
    "insert into public.md_pos_sales(id,store_id,sale_date,payment,paid,total,change,created_by) values($1,$2,'2026-01-31','Tunai',1200,1000,200,$3)",
    [orderId, store, owner],
  );
  const ref = id();
  await query(
    "insert into public.md_pos_sales(id,store_id,sale_date,payment,paid,total,change,created_by) values($1,$2,'2026-01-30','QRIS',70,70,0,$3)",
    [ref, store, owner],
  );
  await query(
    "update public.md_pos_sales set voided=true,voided_at='2026-02-03T10:00:00Z' where id=$1",
    [ref],
  );
  await query(
    "insert into public.md_pos_cash_deposits(id,store_id,deposit_date,created_at,amount,bank,cashier_id,cashier_name,created_by) values($1,$2,'2026-02-01','2026-02-01',400,'BCA',$3,'Test',$3)",
    [id(), store, owner],
  );
  const events = async (action, request = {}, tid = null, at = "2026-02-04") => {
    const eid = id();
    await query(
      "insert into md_supply.events(id,action,actor,request,transfer_id,at) values($1,$2,$3,$4,$5,$6)",
      [eid, action, owner, JSON.stringify(request), tid, at],
    );
    return eid;
  };
  const docs = {};
  for (const [kind, target, total, paid] of [
    ["transfer", store, 390, 90],
    ["wholesale", null, 120, 40],
  ]) {
    const doc = id();
    docs[kind] = doc;
    await query(
      "insert into md_supply.outbound_orders(id,kind,source_id,target_id,status,rates,invoice_no,payment_mode,total,paid,carrier,created_by,issued_at) values($1,$2,$3,$4,'dispatched','[]',$2,'pending',$5,$6,'Kurir',$7,'2026-01-31T10:00Z')",
      [doc, kind, wh, target, total, paid, owner],
    );
    const eid = await events("outbound_payment");
    await query(
      "insert into md_supply.outbound_payments values($1,$2,$3,'2026-02-04','transfer','Ref')",
      [eid, doc, paid],
    );
  }
  const transfer = async (doc, amount, paid) =>
    query(
      "insert into md_supply.transfers(id,invoice_no,delivery_no,source_id,target_id,lines,origin,destination,total,paid,carrier,created_by,created_at) values($1,$2,$2,$3,$4,'[]','{}','{}',$5,$6,'Kurir',$7,'2026-01-31')",
      [doc, doc.slice(0, 8), wh, store, amount, paid, owner],
    );
  await transfer(docs.transfer, 390, 90);
  const legacy = id();
  await transfer(legacy, 75, 25);
  await events("transfer_payment", { amount: 25 }, legacy);
  const sup = id(),
    plan = id();
  await query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier')", [
    sup,
  ]);
  await query(
    "insert into md_supply.receipt_plans(id,warehouse_id,supplier_id,invoice_no,date,shipping,lines,created_by) values($1,$2,$3,'N','2026-02-01',10,'[]',$4)",
    [plan, wh, sup, owner],
  );
  for (const [component, amount] of [
    ["invoice", 135],
    ["shipping", 10],
  ]) {
    const eid = await events("supplier_note_payment");
    await query(
      "insert into md_supply.note_payments(id,plan_id,component,amount,paid_on,method) values($1,$2,$3,$4,'2026-02-04','cash')",
      [eid, plan, component, amount],
    );
    if (component === "shipping") {
      const undo = await events("supplier_note_payment_void", {}, null, "2026-03-02");
      await query(
        "update md_supply.note_payments set void_event_id=$1,void_reason='Koreksi' where id=$2",
        [undo, eid],
      );
    }
  }
  const feb = await read(),
    jan = await read("2026-01-01", "2026-01-31"),
    branch = await read("2026-02-01", "2026-02-28", store);
  assert.equal(value(feb, "refund"), 70);
  assert.equal(value(feb, "sale"), 0);
  assert.equal(value(jan, "sale"), 1070);
  assert.equal(value(jan, "transfer_invoice"), 465);
  assert.equal(value(feb, "transfer_collection"), 115);
  assert.equal(value(feb, "wholesale_collection"), 40);
  assert.equal(value(feb, "supplier_invoice"), 135);
  assert.equal(value(feb, "supplier_shipping"), 10);
  assert.equal(value(await read("2026-03-01", "2026-03-31"), "supplier_shipping"), -10);
  assert.deepEqual(feb.receivables, { transfer: 350, wholesale: 80 });
  assert.deepEqual(jan.receivables, { transfer: 465, wholesale: 120 });
  assert.equal(value(branch, "retail_expense"), 150);
  assert.equal(value(branch, "supplier_invoice"), 0);
  assert.equal(value(branch, "wholesale_collection"), 0);
  const sheets = cashFlowSheets(feb, "", "2026-02-01", "2026-02-28");
  assert.equal(sheets[0].rows.at(-1)[1], 550);
  assert.equal(sheets[1].rows.at(-1)[1], 105);
  assert.equal(sheets[2].rows.at(-1)[1], 10);
  assert.equal(
    (await query("select public.pos_deposit_summary($1) x", [store]))[0].x.pending,
    550,
  );
  await as(worker);
  await assert.rejects(read(), /Hak akses/);
  await assert.rejects(
    mut("expense_funding", { ...funding, id: id() }, "pos_warehouse_mutate"),
    /Hak akses/,
  );
  assert.equal(
    (
      await query(
        "select has_function_privilege('anon','public.pos_cash_flow_read(jsonb)','execute') allowed",
      )
    )[0].allowed,
    false,
  );
  console.log(
    "PASS cash flow for store, retail and distribution, paid dates, historical expenses, transfers, receivables, reversals and permissions.",
  );
} finally {
  await db.close();
}
