import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const base = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../database",
);
// Historical SQL 019 / client 027 foundation, required by the ordered feature patches.
// This is not a complete current installation. See database/README.md.
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
  "sections/operations/integrated-operations.sql",
  "sections/operations/order-stock-kitchen.sql",
  "sections/operations/pay-first-kitchen.sql",
  "sections/operations/kitchen-recipes-only.sql",
  "sections/operations/employees-attendance.sql",
  "sections/operations/employee-accounts.sql",
];
// Jalankan sumber sesuai urutan agar rename wrapper tetap menunjuk fungsi versi sebelumnya.
// Menghapus definisi yang namanya sama akan memutus rantai pos_read/pos_mutate.
const result = "-- GENERATED: node scripts/build-database.mjs\n-- Install baru saja. Database aktif: gunakan migration.\n" + [...files, "sections/operations/receipt-weighing.sql", "sections/operations/direct-stock-no-sorting.sql", "rollback-027-compat.sql"].map(name =>
  "\n-- Bagian: " + name + "\n" + fs.readFileSync(path.join(base, name), "utf8")
).join("\n");
if (process.argv.includes('--check')) {
  if (fs.readFileSync(path.join(base, 'pos.sql'), 'utf8') !== result) throw Error('database/pos.sql berbeda dari sumber; jalankan npm run db:build.');
  console.log('PASS database foundation matches its ordered sources.');
} else {
  fs.writeFileSync(path.join(base, 'pos.sql'), result);
  console.log('Generated database/pos.sql foundation only. Follow database/README.md for feature patches.');
}
