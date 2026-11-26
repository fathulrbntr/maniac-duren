import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID as id } from "node:crypto";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";

const db = await warehouseDatabase();
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const actor = (user) =>
  query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
const rpc = async (name, action, payload) =>
  (
    await query(`select public.${name}($1,$2) result`, [action, JSON.stringify(payload)])
  )[0].result;
const save = (p) => rpc("pos_warehouse_mutate", "cashier_expense_save", p);
const shift = (action, p) =>
  rpc("pos_cashier_shift_mutate", "cashier_shift_" + action, p);
const read = async () => (await query("select public.pos_read() as s"))[0].s;
try {
  for (const file of [
    "supplier-notes-112",
    "warehouse-workflow-114",
    "transfer-receive-119",
    "supplier-stock-122",
    "branch-sale-prices-123",
    "outbound-batches-126",
    "cash-flow-127",
    "cashier-expenses-128",
    "cashier-expenses-128",
  ])
    await db.exec(fs.readFileSync("database/" + file + ".sql", "utf8"));
  const store = id(),
    other = id(),
    owner = id(),
    cashier = id(),
    colleague = id(),
    kitchen = id();
  const [{ id: wh }] = await query(
    "select id from public.md_pos_stores where location_type='warehouse'",
  );
  await query("insert into public.md_pos_stores(id,name) values($1,'A'),($2,'B')", [
    store,
    other,
  ]);
  for (const [user, role] of [
    [owner, "owner"],
    [cashier, "cashier"],
    [colleague, "cashier"],
    [kitchen, "kitchen"],
  ]) {
    await query("insert into auth.users values($1,$2)", [user, user + "@example.test"]);
    await query("insert into public.md_pos_staff values($1)", [user]);
    await query(
      "insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)",
      [user, role, [store]],
    );
  }
  const [{ day }] = await query(
    "select ((now() at time zone 'Asia/Jakarta')::date)::text as day",
  );
  const base = {
    id: id(),
    storeId: store,
    shiftId: null,
    category: "Operasional",
    description: "Plastik kemasan",
    amount: 12000,
    payment: "Tunai",
    reference: "T-01",
  };
  await actor(cashier);
  let s = await save(base);
  assert.equal(s.cashierExpenseVersion, 128);
  assert.equal(s.myStoreExpenses[0].date, day);
  assert.equal(s.myStoreExpenses[0].store_id, store);
  assert.equal(s.expenses.length, 0);
  assert.equal(s.access.finance, false);
  assert.equal(s.cashDepositSummary.find((x) => x.storeId === store).pending, -12000);
  assert.equal((await save(base)).myStoreExpenses.length, 1);
  await assert.rejects(save({ ...base, amount: 15000 }), /data lain/);
  await assert.rejects(save({ ...base, id: id(), funding: "retail" }), /tidak dikenal/);
  await assert.rejects(save({ ...base, id: id(), date: "2026-01-01" }), /tidak dikenal/);
  for (const bad of [
    { amount: 0 },
    { amount: -1 },
    { description: "a" },
    { category: "X" },
    { payment: "X" },
  ])
    await assert.rejects(save({ ...base, id: id(), ...bad }));
  for (const branch of [other, wh])
    await assert.rejects(
      save({ ...base, id: id(), storeId: branch }),
      /Hak akses|tidak sesuai/,
    );
  await assert.rejects(
    rpc("pos_mutate_027", "expense_void", {
      id: id(),
      expenseId: base.id,
      storeId: store,
      reason: "Koreksi",
    }),
    /Hak akses/,
  );
  const sh = id();
  await shift("open", { id: sh, storeId: store, openingCash: 100000 });
  await assert.rejects(save({ ...base, id: id() }), /Shift kasir berubah/);
  const cash = { ...base, id: id(), shiftId: sh, amount: 10000 };
  s = await save(cash);
  assert.equal(s.cashierShifts[0].summary.expectedCash, 90000);
  assert.equal(s.cashierShifts[0].revision, 1);
  assert.equal((await save(cash)).cashierShifts[0].revision, 1);
  s = await save({ ...base, id: id(), payment: "QRIS", amount: 45000 });
  assert.equal(s.cashierShifts[0].summary.cashExpenses, 10000);
  assert.equal(s.cashDepositSummary.find((x) => x.storeId === store).pending, -22000);
  await actor(colleague);
  assert.equal((await read()).myStoreExpenses.length, 0);
  await assert.rejects(save(cash), /data lain/);
  await assert.rejects(save({ ...cash, id: id() }), /Shift kasir berubah/);
  await actor(kitchen);
  await assert.rejects(save({ ...base, id: id() }), /Hak akses/);
  await actor(owner);
  await assert.rejects(save({ ...base, id: id(), storeId: wh }), /Lokasi/);
  const office = await rpc("pos_mutate_027", "expense_save", {
    id: id(),
    storeId: store,
    date: day,
    funding: "retail",
    category: "Sewa",
    description: "Sewa toko dari pusat",
    amount: 200000,
    payment: "Transfer",
  });
  assert(office.expenses.some((x) => x.funding === "retail" && x.amount === 200000));
  assert(!office.myStoreExpenses.some((x) => x.description === "Sewa toko dari pusat"));
  await rpc("pos_mutate_027", "expense_void", {
    id: id(),
    expenseId: cash.id,
    storeId: store,
    reason: "Salah nominal",
  });
  await actor(cashier);
  s = await read();
  assert.equal(s.cashierShifts[0].revision, 2);
  assert.equal(s.cashierShifts[0].summary.expectedCash, 100000);
  assert.equal(s.myStoreExpenses.find((x) => x.id === cash.id).voided, true);
  const replacement = { ...cash, id: id(), amount: 5000 };
  s = await save(replacement);
  await assert.rejects(
    shift("close", { id: id(), shiftId: sh, expectedRevision: 2, closingCash: 95000 }),
    /berubah/,
  );
  await shift("close", {
    id: id(),
    shiftId: sh,
    expectedRevision: s.cashierShifts[0].revision,
    closingCash: 95000,
  });
  assert.equal((await save(replacement)).myStoreExpenses.length, 4);
  await assert.rejects(save({ ...replacement, id: id() }), /Shift kasir berubah/);
  await actor(owner);
  const report = (
    await query("select public.pos_cash_flow_read($1) as r", [
      JSON.stringify({ from: day, to: day, store }),
    ])
  )[0].r;
  const sum = (isCash) =>
    report.rows
      .filter((x) => x.kind === "store_expense" && x.is_cash === isCash)
      .reduce((n, x) => n + x.amount, 0);
  assert.equal(sum(true), 17000);
  assert.equal(sum(false), 45000);
  await rpc("pos_mutate_027", "expense_void", {
    id: id(),
    expenseId: replacement.id,
    storeId: store,
    reason: "Koreksi setelah tutup",
  });
  assert.equal(
    (
      await query(
        "select closing_summary->>'expectedCash' as n from public.md_pos_cashier_shifts where id=$1",
        [sh],
      )
    )[0].n,
    "95000",
  );
  console.log(
    "PASS cashier expenses: branch and actor isolation, single ledger, replay, shifts, reversals and cash flow.",
  );
} finally {
  await db.close();
}
