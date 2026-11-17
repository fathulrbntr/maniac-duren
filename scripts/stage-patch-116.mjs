// Stage only the files delivered in patch 116. Review, commit and push separately.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  "docs/PERBAIKAN-TES-BROWSER-116A.md",
  "docs/PATCH-116-SUPPLIER-INPUT-BARCODE.md",
  "docs/STRUKTUR-PROYEK.md",
  "pos/app.js",
  "pos/barcode-scanner.mjs",
  "pos/money-input.mjs",
  "pos/outbound-ui.mjs",
  "pos/product-dialog.mjs",
  "pos/receipt-weighing.mjs",
  "pos/receiving-session-ui.mjs",
  "pos/supplier-ui.mjs",
  "pos/variant-editor.mjs",
  "pos/warehouse-ui.mjs",
  "scripts/stage-patch-116.mjs",
  "scripts/test-browser.mjs",
  "tests/barcode-input.test.mjs",
  "tests/input-fields-browser.mjs",
  "tests/money-input.test.mjs",
  "tests/pos-category-errors.test.mjs",
  "tests/supplier-quick-add.test.mjs",
  "tests/variant-dom.mjs",
];
for (const file of files)
  if (!fs.existsSync(path.join(root, file)))
    throw Error("File patch belum lengkap: " + file);
const result = spawnSync(
  "git",
  ["add", "--", ...files.map((file) => ":(literal)" + file)],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log("File patch 116 sudah staged. Periksa git diff --cached sebelum commit.");
