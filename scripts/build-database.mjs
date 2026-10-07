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
  "sections/operations/integrated-operations.sql",
  "sections/operations/order-stock-kitchen.sql",
  "sections/operations/pay-first-kitchen.sql",
  "sections/operations/kitchen-recipes-only.sql",
  "sections/operations/employees-attendance.sql",
  "sections/operations/employee-accounts.sql",
];
// Jalankan sumber sesuai urutan agar rename wrapper tetap menunjuk fungsi versi sebelumnya.
// Menghapus definisi yang namanya sama akan memutus rantai pos_read/pos_mutate.
const result = "-- GENERATED: node scripts/build-database.mjs\n-- Install baru saja. Database aktif: gunakan migration.\n" + [...files, "sections/operations/receipt-weighing.sql", "sections/operations/direct-stock-no-sorting.sql", "sections/operations/multi-product-receipt.sql", "sections/operations/batch-tracking.sql", "sections/operations/offline-pos.sql", "sections/operations/login-fast.sql"].map(name =>
  "\n-- Bagian: " + name + "\n" + fs.readFileSync(path.join(base, name), "utf8")
).join("\n");
fs.writeFileSync(path.join(base, "pos.sql"), result);
console.log("Generated database/pos.sql (ordered sections).");
