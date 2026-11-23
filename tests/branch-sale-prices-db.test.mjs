import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID as id } from "node:crypto";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";
const db = await warehouseDatabase();
try {
  for (const file of [
    "supplier-notes-112",
    "warehouse-workflow-114",
    "transfer-receive-119",
  ])
    await db.exec(fs.readFileSync("database/" + file + ".sql", "utf8"));
  const a = id(),
    b = id(),
    owner = id(),
    cashier = id(),
    pack = id();
  await db.query(
    "insert into public.md_pos_stores(id,name) values($1,'HI'),($2,'Jababeka')",
    [a, b],
  );
  const wh = (
    await db.query(
      "select id from public.md_pos_stores where location_type='warehouse' limit 1",
    )
  ).rows[0].id;
  for (const [who, role, shops] of [
    [owner, "owner", [a, b]],
    [cashier, "cashier", [a]],
  ]) {
    await db.query("insert into auth.users values($1,$2)", [who, who + "@test.local"]);
    await db.query("insert into public.md_pos_staff values($1)", [who]);
    await db.query(
      "insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)",
      [who, role, shops],
    );
  }
  const as = (who) =>
    db.query("select set_config('request.jwt.claim.sub',$1,false)", [who]);
  const rpc = async (name, action, p) =>
    (
      await db.query("select public." + name + "($1,$2::jsonb) s", [
        action,
        JSON.stringify(p),
      ])
    ).rows[0].s;
  const save = (p) => rpc("pos_warehouse_mutate", "branch_price_save", p);
  const read = async () => (await db.query("select public.pos_read() s")).rows[0].s;
  const fruit = (
    await db.query(
      "select id,price_kg,price_piece from public.md_pos_products where stock_unit='kg_butir' limit 1",
    )
  ).rows[0];
  await db.query(
    "insert into public.md_pos_products(id,name,sku,item_type,stock_unit,category,sale_price) values($1,'Air','AIR-123','direct','pcs','Minuman',10000)",
    [pack],
  );
  const day = (
    await db.query("select (now() at time zone 'Asia/Jakarta')::date::text as local_date")
  ).rows[0].local_date;
  const lot = id(),
    supplier = id(),
    barcode = "92011311260009009123002000";
  await db.query("update public.md_pos_products set barcode='9123' where id=$1", [
    fruit.id,
  ]);
  await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Buah uji')", [
    supplier,
  ]);
  await db.query(
    "insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces) values($1,$2,$3,$4,$5,2,1,2,1)",
    [lot, a, supplier, fruit.id, day],
  );
  for (const file of [
    "supplier-stock-122",
    "branch-sale-prices-123",
    "branch-sale-prices-123",
  ])
    await db.exec(fs.readFileSync("database/" + file + ".sql", "utf8"));
  await as(owner);
  await rpc("pos_warehouse_mutate", "legacy_labels_register", {
    id: id(),
    lotId: lot,
    barcodes: [barcode],
    reason: "Verifikasi stok sebelum penjualan",
  });
  // A finished local lot supplies the cashier test. Its known unit cost must survive repricing.
  await db.query(
    "insert into public.md_pos_unit_lots(id,store_id,product_id,unit,kind,qty,received_qty,unit_cost,received_date) values($1,$2,$3,'pcs','production',10,10,2000,$4)",
    [id(), a, pack, day],
  );
  await as(owner);
  const changed = {
    id: id(),
    storeId: a,
    productId: pack,
    stockUnit: "pcs",
    inherit: false,
    salePrice: 15000,
    expectedRevision: 0,
  };
  await save(changed);
  await save(changed);
  await assert.rejects(save({ ...changed, salePrice: 14000 }), /ID operasi/);
  await assert.rejects(save({ ...changed, id: id() }), /sudah berubah/);
  await assert.rejects(save({ ...changed, id: id(), storeId: wh }), /Lokasi/);
  await assert.rejects(
    save({ ...changed, id: id(), storeId: b, salePrice: 0 }),
    /lebih dari 0/,
  );
  await save({ ...changed, id: id(), storeId: b, salePrice: 18000 });
  const priceFruit = {
    id: id(),
    storeId: a,
    stockUnit: "kg_butir",
    productId: fruit.id,
    priceKg: 91000,
    pricePiece: 152000,
    inherit: false,
    expectedRevision: 0,
  };
  await save(priceFruit);
  const quote = async (store, unit, price) =>
    (
      await db.query("select public.pos_cashier_quote($1) s", [
        JSON.stringify({
          storeId: store,
          date: day,
          lines: [{ productId: fruit.id, lotId: id(), unit, price, kg: 2, pieces: 1 }],
        }),
      ])
    ).rows[0].s.subtotal;
  assert.equal(await quote(a, "KG", 91000), 182000);
  assert.equal(await quote(a, "BUTIR", 152000), 152000);
  assert.equal(await quote(b, "KG", Number(fruit.price_kg)), Number(fruit.price_kg) * 2);
  assert.equal((await read()).branchPrices.length, 3);
  await as(cashier);
  assert((await read()).branchPrices.every((r) => r.storeId === a));
  await assert.rejects(save({ ...changed, id: id(), expectedRevision: 1 }), /akses/);
  await rpc("pos_cashier_shift_mutate", "cashier_shift_open", {
    id: id(),
    storeId: a,
    openingCash: 0,
  });
  await as(owner);
  await rpc("pos_cashier_shift_mutate", "cashier_shift_open", {
    id: id(),
    storeId: a,
    openingCash: 0,
  });
  const line = {
    lotId: lot,
    productId: fruit.id,
    barcode,
    unit: "BUTIR",
    pieces: 1,
    kg: 2,
    price: 152000,
  };
  const quick = {
    id: id(),
    storeId: a,
    date: day,
    payment: "Tunai",
    paid: 200000,
    lines: [line],
  };
  await assert.rejects(
    rpc("pos_mutate_027", "sale", {
      ...quick,
      id: id(),
      lines: [{ ...line, price: 130000 }],
    }),
    /Harga jual cabang/,
  );
  await rpc("pos_mutate_027", "sale", quick);
  assert.equal(
    Number(
      (
        await db.query("select price from public.md_pos_sale_items where sale_id=$1", [
          quick.id,
        ])
      ).rows[0].price,
    ),
    152000,
  );
  await as(cashier);
  const basket = {
    id: id(),
    storeId: a,
    date: day,
    payment: "Tunai",
    paid: 40000,
    lines: [{ productId: pack, qty: 2, price: 15000 }],
  };
  await assert.rejects(
    rpc("pos_mutate_027", "order_create", {
      ...basket,
      id: id(),
      lines: [{ productId: pack, qty: 2, price: 10000 }],
    }),
    /Harga jual cabang/,
  );
  const sold = await rpc("pos_mutate_027", "order_create", basket);
  assert.equal(sold.orders.find((o) => o.id === basket.id).total, 30000);
  await as(owner);
  const reset = { ...changed, id: id(), expectedRevision: 1, inherit: true };
  delete reset.salePrice;
  const state = await save(reset);
  assert.equal(state.orders.find((o) => o.id === basket.id).lines[0].price, 15000);
  assert.equal(state.unitLots.find((l) => l.productId === pack).unitCost, 2000);
  assert.equal(state.products.find((p) => p.id === pack).salePrice, 10000);
  assert.equal(state.branchPrices.find((r) => r.storeId === b).salePrice, 18000);
  assert.equal(
    state.branchPrices.find((r) => r.storeId === a && r.productId === pack).salePrice,
    null,
  );
  await as(cashier);
  const fallback = await rpc("pos_mutate_027", "order_create", {
    ...basket,
    id: id(),
    lines: [{ productId: pack, qty: 2, price: 10000 }],
  });
  assert.equal(fallback.unitLots.find((l) => l.productId === pack).qty, 6);
} finally {
  await db.close();
}
