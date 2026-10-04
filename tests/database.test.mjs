// Runs the real SQL locally in PostgreSQL (PGlite); no production connection.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID as id } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const root = new URL("../database/", import.meta.url);
const migrations = fs
  .readdirSync(root)
  .filter((x) => /^\d{3}-.+\.sql$/.test(x))
  .sort();
for (const mode of ["fresh", "upgrade"]) {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`,
    );
    for (const file of mode === "fresh"
      ? ["pos.sql"]
      : ["archive/000-initial.sql", ...migrations])
      await db.exec(fs.readFileSync(new URL(file, root), "utf8"));
    await assert.rejects(db.query("select public.pos_read()"), /akses POS/);
    const user = id(),
      store = id(),
      other = id(),
      supplier = id(),
      durian = id(),
      lot = id();
    await db.query("insert into auth.users values ($1,$2)", [
      user,
      "local@example.test",
    ]);
    await db.query("insert into public.md_pos_staff values ($1)", [user]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    const read = async () =>
      (await db.query("select public.pos_read() as state")).rows[0].state;
    const mutate = async (action, payload) =>
      (
        await db.query("select public.pos_mutate($1,$2::jsonb) as state", [
          action,
          JSON.stringify(payload),
        ])
      ).rows[0].state;
    for (const [key, name] of [
      [store, "Store A"],
      [other, "Store B"],
    ])
      await mutate("master", {
        id: key,
        kind: "stores",
        name,
        location: "Depok",
      });
    await mutate("master", {
      id: supplier,
      kind: "suppliers",
      name: "Supplier",
      phone: "08123",
      address: "Alamat",
    });
    await mutate("product_save", {
      id: durian,
      name: "Durian Test",
      sku: "D-TEST",
      itemType: "direct",
      category: "Buah",
      stockUnit: "kg_butir",
      priceKg: 50000,
      pricePiece: 100000,
    });
    const receipt = {
      id: lot,
      storeId: store,
      supplierId: supplier,
      productId: durian,
      date: "2026-01-01",
      kg: 100,
      pieces: 40,
    };
    await mutate("receipt", receipt);
    await mutate("receipt", receipt);
    assert.equal((await read()).lots.filter((x) => x.id === lot).length, 1);
    const sale = {
      id: id(),
      storeId: store,
      date: "2026-01-02",
      paid: 200000,
      payment: "Tunai",
      lines: [{ lotId: lot, kg: 5, pieces: 2, unit: "BUTIR", price: 100000 }],
    };
    let s = await mutate("sale", sale);
    await mutate("sale", sale);
    assert.equal(s.sales.find((x) => x.id === sale.id).total, 200000);
    assert.equal(s.lots.find((x) => x.id === lot).kg, 95);
    const before = await read();
    await assert.rejects(
      mutate("sale", { ...sale, id: id(), paid: 1 }),
      /Pembayaran kurang/,
    );
    assert.deepEqual(await read(), before);
    s = await mutate("void", { id: id(), saleId: sale.id, reason: "Koreksi" });
    assert.equal(s.lots.find((x) => x.id === lot).kg, 100);
    const transfer = {
      id: id(),
      lotId: lot,
      date: "2026-01-03",
      kind: "Transfer",
      toStoreId: other,
      kg: 10,
      pieces: 4,
      note: "Antar store",
    };
    s = await mutate("movement", transfer);
    assert.equal(s.lots.find((x) => x.id === transfer.id).date, "2026-01-03");
    await assert.rejects(
      mutate("sale", {
        ...sale,
        id: id(),
        storeId: other,
        lines: [{ ...sale.lines[0], lotId: transfer.id }],
      }),
      /sebelum barang masuk/,
    );
    const half = id(),
      one = id(),
      coral = id();
    for (const [productId, name, unit] of [
      [half, "Durpas test 500", "pcs"],
      [one, "Durpas test 1kg", "pcs"],
      [coral, "Coral test", "kg"],
    ])
      await mutate("product_save", {
        id: productId,
        name,
        sku: productId,
        itemType: "finished",
        category: "Olahan Duren",
        stockUnit: unit,
        salePrice: 100000,
      });
    const photo = "data:image/png;base64,iVBORw0KGgo=";
    const waste = {
      id: id(),
      storeId: store,
      date: "2026-01-04",
      receivedDate: "2026-01-01",
      sourceLotId: lot,
      kg: 10,
      pieces: 4,
      reason: "Sortasi",
      evidence: { reject: photo, processed: photo },
      outputs: [
        { key: "durpas500", productId: half, qty: 4, lotId: id() },
        { key: "durpas1000", productId: one, qty: 2, lotId: id() },
        { key: "coral", productId: coral, qty: 1.25, lotId: id() },
      ],
    };
    s = await mutate("waste_process", waste);
    await mutate("waste_process", waste);
    const w = s.wasteRuns.find((x) => x.id === waste.id);
    assert.equal(w.lossKg, 4.75);
    assert.equal(w.hasEvidence, true);
    assert.equal(w.evidence, undefined);
    assert.equal(
      (
        await db.query("select public.pos_waste_evidence($1) as proof", [
          waste.id,
        ])
      ).rows[0].proof.reject,
      photo,
    );
    s = await mutate("waste_void", {
      id: id(),
      wasteId: waste.id,
      reason: "Salah input",
    });
    assert.equal(s.lots.find((x) => x.id === lot).kg, 90);
    assert.equal(s.wasteRuns.find((x) => x.id === waste.id).voided, true);
    assert.equal(
      (
        await db.query("select public.pos_waste_evidence($1) as proof", [
          waste.id,
        ])
      ).rows[0].proof.processed,
      photo,
    );
    const flour = id(),
      cendol = id(),
      recipe = id(),
      rawlot = id();
    for (const [productId, name, type] of [
      [flour, "Tepung", "raw"],
      [cendol, "Cendol", "prep"],
    ])
      await mutate("product_save", {
        id: productId,
        name,
        sku: productId,
        itemType: type,
        stockUnit: "g",
      });
    await mutate("unit_receipt", {
      id: rawlot,
      storeId: store,
      supplierId: supplier,
      productId: flour,
      date: "2026-01-01",
      qty: 1000,
      kind: "purchase",
    });
    await mutate("recipe_save", {
      id: recipe,
      name: "Resep Cendol",
      outputId: cendol,
      yieldQty: 1000,
      version: 0,
      ingredients: [{ productId: flour, qty: 500 }],
    });
    const production = {
      id: id(),
      storeId: store,
      recipeId: recipe,
      recipeVersion: 1,
      date: "2026-01-04",
      batches: 1,
      actualQty: 950,
    };
    s = await mutate("produce", production);
    assert.equal(s.unitLots.find((x) => x.id === rawlot).qty, 500);
    await mutate("produce", production);
    assert.equal((await read()).unitLots.find((x) => x.id === rawlot).qty, 500);
    const saved = await read();
    await assert.rejects(
      mutate("produce", { ...production, id: id(), batches: 3 }),
      /Stok tidak cukup/,
    );
    assert.deepEqual(await read(), saved);
    s = await mutate("production_void", {
      id: id(),
      productionId: production.id,
      reason: "Koreksi",
    });
    assert.equal(s.unitLots.find((x) => x.id === rawlot).qty, 1000);
    await assert.rejects(
      mutate("product_delete", { id: durian, confirmed: true }),
      /dipakai|riwayat|digunakan|stok/i,
    );
    const grants = await db.query(
      "select has_function_privilege('anon','public.pos_read()','EXECUTE') as anon_read,has_function_privilege('authenticated','public.pos_waste_evidence(uuid)','EXECUTE') as staff_proof,has_function_privilege('authenticated','public.pos_waste_action(text,jsonb)','EXECUTE') as helper",
    );
    assert.deepEqual(grants.rows[0], {
      anon_read: false,
      staff_proof: true,
      helper: false,
    });
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(
      db.query("select public.pos_waste_evidence($1)", [waste.id]),
      /akses POS/,
    );
    console.log(
      `PASS database ${mode}: schema, authorization, duplicate saves, atomic rollback, sales by piece/kg stock, transfer dates, waste evidence, reversal, recipes and production.`,
    );
  } finally {
    await db.close();
  }
}
