import { fileURLToPath } from "node:url";
import { runBrowserSuites } from "./lib/browser-suite.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
// The first SQL suite supplies the document fixture required by the next two.
const files = [
  "input-fields-browser.mjs",
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
  "warehouse-browser.mjs",
  "warehouse-workflow-browser.mjs",
  "outbound-invoices-browser.mjs",
];
const report = await runBrowserSuites({
  root,
  suites: files.map((file) => ({
    file,
    requires: ["reports-admin-browser.mjs", "reports-app-smoke.mjs"].includes(file)
      ? ["reports-admin-sql.test.mjs"]
      : [],
  })),
});
process.exitCode = report.failed || report.blocked ? 1 : 0;
