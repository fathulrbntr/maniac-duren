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
    admin = id(),
    kitchen = id();
  await query("insert into public.md_pos_stores(id,name) values($1,'A'),($2,'B')", [
    store,
    other,
  ]);
  for (const [user, role] of [
    [owner, "owner"],
    [cashier, "cashier"],
    [admin, "admin"],
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
  await actor(cashier);
  const legacy = {
    id: id(),
    storeId: store,
    shiftId: null,
    category: "Operasional",
    description: "Biaya lama",
    amount: 5000,
    payment: "Tunai",
  };
  await save(legacy);
  const install = fs.readFileSync("database/petty-cash-130.sql", "utf8");
  await db.exec(install);
  await db.exec(install);
  const petty = (a, p) => rpc("pos_petty_mutate", "petty_" + a, p);
  const request = {
    id: id(),
    storeId: store,
    amount: 200000,
    note: "Dana awal kas kecil",
  };
  const decision = {
    id: id(),
    storeId: store,
    requestId: request.id,
    note: "Transfer bank 001",
  };
  const newExpense = {
    id: id(),
    storeId: store,
    funding: "petty",
    category: "Operasional",
    description: "Es dan kemasan",
    amount: 200000,
    payment: "Tunai",
  };
  assert.equal((await read()).pettyCashVersion, 130);
  await assert.rejects(save(newExpense), /Saldo petty cash/);
  await assert.rejects(save({ ...legacy, id: id() }), /tidak dikenal|petty cash/);
  await assert.rejects(petty("request", { ...request, storeId: other }), /Hak akses/);
  await petty("request", request);
  await petty("request", request);
  await assert.rejects(petty("request", { ...request, id: id() }), /menunggu/);
  await assert.rejects(petty("pay", decision), /Hak akses/);
  await actor(owner);
  await assert.rejects(petty("pay", decision), /Saldo PT Retail/);
  await actor(cashier);
  const shiftId = id();
  await shift("open", { id: shiftId, storeId: store, openingCash: 100000 });
  await query(
    "insert into public.md_pos_sales(id,store_id,sale_date,payment,paid,total,change,created_by) values($1,$2,$3,'Tunai',1500000,1500000,0,$4)",
    [id(), store, day, cashier],
  );
  await actor(owner);
  await assert.rejects(petty("pay", decision), /Saldo PT Retail/);
  await query(
    "insert into public.md_pos_cash_deposits(id,store_id,deposit_date,created_at,amount,bank,cashier_id,cashier_name,created_by) values($1,$2,$3,now(),1000000,'BCA',$4,'Kasir',$4)",
    [id(), store, day, cashier],
  );
  let state = await petty("pay", decision);
  assert.equal(state.retailBalance, 800000);
  assert.equal((await petty("pay", decision)).pettyBalances[store], 200000);
  await assert.rejects(petty("pay", { ...decision, id: id() }), /sudah diproses/);
  await actor(cashier);
  state = await read();
  const expectedCash = state.cashierShifts[0].summary.expectedCash;
  const pending = state.cashDepositSummary.find((x) => x.storeId === store).pending;
  await assert.rejects(save({ ...newExpense, category: "Gaji" }), /Back Office/);
  state = await save(newExpense);
  assert.equal(state.myStoreExpenses.find((x) => x.id === legacy.id).funding, "store");
  assert.equal(
    state.myStoreExpenses.find((x) => x.id === newExpense.id).funding,
    "petty",
  );
  assert.equal(state.pettyBalances[store], 0);
  assert.equal(state.retailBalance, null);
  assert.equal(state.cashierShifts[0].summary.expectedCash, expectedCash);
  assert.equal(
    state.cashDepositSummary.find((x) => x.storeId === store).pending,
    pending,
  );
  assert.equal((await save(newExpense)).pettyBalances[store], 0);
  await assert.rejects(save({ ...newExpense, id: id(), amount: 1 }), /Saldo petty cash/);
  const replenish = { ...request, id: id(), note: "Reimburse kemasan" };
  await petty("request", replenish);
  await actor(admin);
  state = await petty("pay", { ...decision, id: id(), requestId: replenish.id });
  assert.equal(state.retailBalance, 600000);
  assert.equal(state.pettyBalances[store], 200000);
  const rent = {
    ...newExpense,
    id: id(),
    date: day,
    category: "Sewa",
    description: "Sewa cabang",
    funding: "retail",
    amount: 100000,
  };
  const normal = (a, p) => rpc("pos_mutate_027", a, p);
  await assert.rejects(
    normal("expense_save", { ...rent, id: id(), funding: "store" }),
    /saldo PT/,
  );
  await assert.rejects(
    normal("expense_save", { ...rent, id: id(), amount: 600001 }),
    /Saldo PT Retail/,
  );
  state = await normal("expense_save", rent);
  assert.equal(state.retailBalance, 500000);
  const rpt = (
    await query("select public.pos_cash_flow_read($1) r", [
      JSON.stringify({ from: day, to: day, store }),
    ])
  )[0].r;
  assert.equal(rpt.rows.find((x) => x.kind === "sale").amount, 1500000);
  assert.equal(rpt.rows.find((x) => x.kind === "petty_disbursement").amount, 400000);
  assert.equal(rpt.rows.find((x) => x.kind === "petty_expense").amount, 200000);
  assert.equal(rpt.rows.find((x) => x.kind === "retail_expense").amount, 100000);
  for (const action of ["document_save", "document_issue", "document_cancel"])
    await assert.rejects(
      normal(action, { id: id(), storeId: store }),
      /diarsipkan|nota supplier/i,
    );
  assert.equal(state.access.employees, true);
  assert.equal(state.access.master, true);
  await query("select pos_crm_require(true)");
  await query("select pos_crm_read($1)", [JSON.stringify({ export: true })]);
  const employee = {
    id: id(),
    employeeId: id(),
    name: "Akun operasional",
    username: "operasional",
    email: "op@example.test",
    role: "cashier",
    storeIds: [store],
    permissions: [],
    active: true,
  };
  state = await normal("employee_save", employee);
  assert.equal(
    state.employees.find((e) => e.id === employee.employeeId)?.role,
    "cashier",
  );
  const acct = (k) => query("select pos_account_target($1) r", [k]);
  assert.equal((await acct(employee.employeeId))[0].r.email, employee.email);
  await assert.rejects(acct(owner), /Hanya owner/);
  await assert.rejects(
    normal("employee_save", { ...employee, id: id(), role: "admin" }),
    /Hanya owner/,
  );
  await assert.rejects(
    normal("employee_save", {
      ...employee,
      id: id(),
      username: "privtest",
      email: "another@example.test",
      employeeId: owner,
    }),
    /Hanya owner/,
  );
  const authUser = id(),
    unrelated = id();
  await query("alter table auth.users add column raw_app_meta_data jsonb");
  await query(
    "insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3),($4,$5,null)",
    [
      authUser,
      employee.email,
      JSON.stringify({ employee_id: employee.employeeId }),
      unrelated,
      "unrelated@test.local",
    ],
  );
  await assert.rejects(
    normal("employee_link", {
      id: id(),
      employeeId: employee.employeeId,
      userId: unrelated,
    }),
    /tidak diterbitkan/,
  );
  await rpc("pos_mutate", "employee_link", {
    id: id(),
    employeeId: employee.employeeId,
    userId: authUser,
  });
  assert.equal((await acct(employee.employeeId))[0].r.userId, authUser);
  await assert.rejects(query("select pos_employee_document($1)", [owner]), /Hanya owner/);
  await actor(cashier);
  const rejected = { ...request, id: id(), note: "Pengajuan ganda" };
  await petty("request", rejected);
  await actor(admin);
  state = await petty("reject", {
    ...decision,
    id: id(),
    requestId: rejected.id,
    note: "Sudah dicairkan",
  });
  assert.equal(state.retailBalance, 500000);
  assert.equal(state.pettyBalances[store], 200000);
  state = await normal("expense_void", {
    id: id(),
    storeId: store,
    expenseId: newExpense.id,
    reason: "Koreksi kemasan",
  });
  assert.equal(state.pettyBalances[store], 400000);
  assert.equal(state.retailBalance, 500000);
  await actor(kitchen);
  state = await read();
  assert.equal(state.access.attendance, true);
  await normal("attendance_in", { id: id(), storeId: store });
  state = await normal("attendance_out", { id: id(), storeId: store });
  assert.ok(
    state.attendance.some(
      (row) => row.employee_id === kitchen && row.clock_in && row.clock_out,
    ),
  );
  assert.equal(state.access.employees, false);
  assert.deepEqual(state.pettyRequests, []);
  await assert.rejects(acct(employee.employeeId), /Hak akses/);
  console.log(
    "PASS: petty cash, reimbursements, office expenses, document archive and employee administration",
  );
} finally {
  await db.close();
}
