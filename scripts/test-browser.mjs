import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
// The first SQL suite supplies the document fixture required by the next two.
const files = [
  "reports-admin-sql.test.mjs",
  "reports-admin-browser.mjs",
  "reports-app-smoke.mjs",
  "cashier-shifts-app-browser.mjs",
  "cashier-shifts-browser.mjs",
  "payment-methods-browser.mjs",
  "crm-browser.mjs",
  "receipt-shipment-browser.mjs",
  "employee-details-browser.cjs",
  "reject-report-browser.mjs",
  "batch-metrics-browser.mjs",
  "batch-profit-browser.mjs",
  "ui-audit-browser.mjs",
  "public-browser.mjs",
];
for (const file of files) {
  console.log("\nRunning " + file);
  const result = spawnSync(process.execPath, ["tests/" + file], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
