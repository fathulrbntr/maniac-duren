import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";

test("Warehouse and wireless migrations coexist with restricted database privileges", async () => {
  const db = await warehouseDatabase();
  try {
    const wireless = fs.readFileSync(
      "supabase/migrations/20261108022503_wireless_customer_display.sql",
      "utf8",
    );
    await db.exec(wireless);
    await db.exec(wireless);
    const exposed = await db.query(`select p.proname from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','md_supply') and p.prosecdef
      and has_function_privilege('anon',p.oid,'execute')`);
    assert.deepEqual(exposed.rows, [], "No privileged anonymous RPC");
    const paths = await db.query(`select p.proname from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','md_supply') and p.prosecdef
      and (p.proconfig is null or not exists(select 1 from unnest(p.proconfig) x where x like 'search_path=%'))`);
    assert.deepEqual(paths.rows, [], "Privileged functions need a fixed search path");
    for (const name of [
      "public.pos_read()",
      "public.pos_warehouse_mutate(text,jsonb)",
      "public.pos_customer_display_host(text,uuid,uuid,jsonb)",
    ]) {
      const { rows } = await db.query(
        "select has_function_privilege('authenticated', $1, 'execute') allowed",
        [name],
      );
      assert.equal(rows[0].allowed, true, name);
    }
    const { rows } = await db.query(`select has_function_privilege('authenticated',
      'public.pos_customer_display_viewer(text,text,text,text)', 'execute') allowed`);
    assert.equal(rows[0].allowed, false, "Tablet viewer RPC stays server-only");
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select public.pos_read()"),
      /Login|login|akses|staff/i,
    );
    await assert.rejects(
      db.query("select * from public.md_pos_customer_displays"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
