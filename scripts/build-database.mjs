import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const base = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../database",
);
// Sumber instalasi baru disusun berdasarkan domain, bukan urutan nomor.
// File di sections hanya bahan build; pengguna menjalankan database/pos.sql.
const files = [
  "sections/base.sql",
  "sections/master-contact.sql",
  "sections/product-catalog.sql",
  "sections/recipes-production.sql",
  "sections/product-details.sql",
  "sections/waste-processing.sql",
  "sections/waste-evidence.sql",
  "sections/flow-audit.sql",
  "sections/waste-output-proof.sql",
];
const functions = new Map(),
  permissions = new Set();
let schema = "";
for (const name of files) {
  let sql = fs.readFileSync(path.join(base, name), "utf8");
  sql = sql.replace(
    /create or replace function public\.([a-z_]+)\([\s\S]*?end \$\$;/g,
    (body, key) => {
      functions.set(key, body);
      return "";
    },
  );
  sql = sql.replace(/(?:revoke|grant) [^;]*?on function [^;]+;/g, (body) => {
    permissions.add(body);
    return "";
  });
  sql = sql
    .replace(/^begin;\s*$/gm, "")
    .replace(/^commit;\s*$/gm, "")
    .replace(/^notify pgrst[^;]*;\s*$/gm, "");
  schema +=
    "\n-- Bagian: " +
    name.replace(/^sections\//, "").replace(/\.sql$/, "") +
    "\n" +
    sql;
}
const result =
  "-- GENERATED: node scripts/build-database.mjs\n-- Install baru saja. Database aktif: jalankan migration berikutnya, bukan file ini.\nbegin;\n" +
  schema +
  "\n-- Fungsi versi terakhir\n" +
  [...functions.values()].join("\n\n") +
  "\n" +
  [...permissions].join("\n") +
  "\nnotify pgrst, 'reload schema';\ncommit;\n";
fs.writeFileSync(path.join(base, "pos.sql"), (result + fs.readFileSync(path.join(base, "009-integrated-operations.sql"), "utf8") + fs.readFileSync(path.join(base, "011-order-stock-kitchen.sql"), "utf8") + fs.readFileSync(path.join(base, "012-pay-first-kitchen.sql"), "utf8")).replace(/\n{3,}/g, "\n\n"));
console.log(`Generated database/pos.sql (${functions.size} functions).`);
