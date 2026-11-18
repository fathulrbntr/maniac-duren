// Stage the exact cumulative 118 patch; review before committing.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  "docs/PATCH-116-SUPPLIER-INPUT-BARCODE.md",
  "docs/PATCH-117-UI-FOOD-POS.md",
  "docs/PATCH-117B-AUDIT-BROWSER.md",
  "docs/PATCH-117C-SIDEBAR-TRANSITION.md",
  "docs/PATCH-118-BARCODE-TERBUKA.md",
  "docs/PENGEMBANGAN.md",
  "docs/PERBAIKAN-TES-BROWSER-116A.md",
  "docs/PERBAIKAN-TES-BROWSER-117A.md",
  "docs/STRUKTUR-PROYEK.md",
  "pos/app.js",
  "pos/assets/fonts/barlow/Barlow-Bold.ttf",
  "pos/assets/fonts/barlow/Barlow-Regular.ttf",
  "pos/assets/fonts/barlow/Barlow-SemiBold.ttf",
  "pos/assets/fonts/barlow/OFL.txt",
  "pos/barcode-scanner.mjs",
  "pos/cashier.css",
  "pos/customer-display.css",
  "pos/customer-display.html",
  "pos/index.html",
  "pos/manifest.webmanifest",
  "pos/money-input.mjs",
  "pos/operations-ui.mjs",
  "pos/outbound-ui.mjs",
  "pos/pos-menu.css",
  "pos/product-dialog.mjs",
  "pos/receipt-weighing.mjs",
  "pos/receiving-session-ui.mjs",
  "pos/sidebar.mjs",
  "pos/supplier-ui.mjs",
  "pos/system-dock.css",
  "pos/ui-system.css",
  "pos/ui-tokens.css",
  "pos/variant-editor.mjs",
  "pos/warehouse-ui.mjs",
  "pos/warehouse.css",
  "pos/workspace-ui.css",
  "scripts/lib/browser-suite.mjs",
  "scripts/stage-patch-116.mjs",
  "scripts/stage-patch-117.mjs",
  "scripts/stage-patch-117a.mjs",
  "scripts/stage-patch-117b.mjs",
  "scripts/stage-patch-117c.mjs",
  "scripts/stage-patch-118.mjs",
  "scripts/test-browser.mjs",
  "tests/barcode-input.test.mjs",
  "tests/browser-runner.test.mjs",
  "tests/helpers/browser-sidebar.mjs",
  "tests/input-fields-browser.mjs",
  "tests/money-input.test.mjs",
  "tests/pos-category-errors.test.mjs",
  "tests/sidebar.test.mjs",
  "tests/supplier-quick-add.test.mjs",
  "tests/ui-audit-browser.mjs",
  "tests/variant-dom.mjs",
  "tests/warehouse-browser.mjs",
  "tests/warehouse-workflow-browser.mjs",
];
for (const file of files)
  if (!fs.existsSync(path.join(root, file)))
    throw Error("File patch belum lengkap: " + file);
const result = spawnSync(
  "git",
  ["add", "--", ...files.map((file) => ":(literal)" + file)],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log("Patch 118 sudah staged. Periksa diff sebelum commit.");
