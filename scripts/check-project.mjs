// Repository checks require no browser, credentials or production connection.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { moduleSpecifiers } from "./lib/architecture.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
await import("./check-architecture.mjs");
if (process.exitCode) process.exit(process.exitCode);
const failures = [],
  sources = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      [".git", "node_modules", "backup", "test-results", "playwright-report"].includes(
        entry.name,
      ) ||
      entry.name.startsWith("maniac-foto-")
    )
      continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|mjs|cjs|html|css)$/.test(file)) sources.push(file);
  }
};
walk(root);
const identities = new Map();
for (const file of sources) {
  const relative = path.relative(root, file),
    source = fs.readFileSync(file, "utf8");
  if (/\.(js|mjs|cjs)$/.test(file)) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    if (result.status !== 0) failures.push(relative + ": " + result.stderr);
  }
  // Parse JavaScript imports; text fixtures and comments are not dependencies.
  // Inline module imports in HTML are checked by check-architecture.mjs.
  const specifiers = /\.(js|mjs|cjs)$/.test(file) ? moduleSpecifiers(source) : [];
  for (const specifier of specifiers.filter((s) => /^\.{1,2}\//.test(s))) {
    const target = path.resolve(path.dirname(file), specifier.split(/[?#]/)[0]);
    if (!fs.existsSync(target)) failures.push(relative + ": missing " + specifier);
    if (relative.startsWith("pos" + path.sep)) {
      if (!identities.has(target)) identities.set(target, new Set());
      identities.get(target).add(specifier.includes("?") ? specifier.split("?")[1] : "");
    }
  }
  if (file.endsWith(".html"))
    for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const ref = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref) || ref.includes("${")) continue;
      const target = path.resolve(
        ref.startsWith("/") ? root : path.dirname(file),
        ref.replace(/^\//, "").split(/[?#]/)[0],
      );
      if (!fs.existsSync(target)) failures.push(relative + ": missing asset " + ref);
    }
}
for (const [file, versions] of identities)
  if (versions.size > 1)
    failures.push(path.relative(root, file) + ": multiple module URL identities");
const { sections } = await import("../pos/navigation.mjs");
const pages = sections.flatMap((s) => s.pages);
if (new Set(pages).size !== pages.length) failures.push("Duplicate sidebar page");
const html = fs.readFileSync(path.join(root, "pos/index.html"), "utf8");
const styles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"?]+)/g)].map(
  (m) => m[1],
);
if (new Set(styles).size !== styles.length) failures.push("Duplicate stylesheet");
if (!styles.length) failures.push("POS stylesheets were not detected");

// CSS and menu photos are independent assets, not embedded in menu.json.
for (const file of sources.filter((name) => name.endsWith(".css"))) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
    const ref = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref)) continue;
    const target = path.resolve(
      ref.startsWith("/") ? root : path.dirname(file),
      ref.replace(/^\//, "").split(/[?#]/)[0],
    );
    if (!fs.existsSync(target))
      failures.push(path.relative(root, file) + ": missing CSS asset " + ref);
  }
}
const menu = JSON.parse(fs.readFileSync(path.join(root, "menu/menu.json"), "utf8"));
for (const product of Array.isArray(menu) ? menu : menu.products) {
  if (
    product.image?.startsWith("/") &&
    !product.image.startsWith("//") &&
    !fs.existsSync(path.join(root, product.image))
  )
    failures.push("Missing menu photo: " + product.image);
}
const ignored = fs.readFileSync(path.join(root, ".vercelignore"), "utf8").split(/\r?\n/);
for (const folder of [
  "database/",
  "supabase/",
  "tests/",
  "scripts/",
  "docs/",
  "test-results/",
  "maniac-foto-*/",
])
  if (!ignored.includes(folder)) failures.push("Missing deployment exclusion: " + folder);
// These copies have existing CLI migration identities; never silently fork their SQL.
for (const [source, migration] of [
  ["fruit-stock-barcode-105.sql", "20261108132813_fruit_stock_barcode.sql"],
  ["fruit-batch-strict-scan-106.sql", "20261108140738_fruit_batch_strict_scan.sql"],
  ["supplier-notes-112.sql", "20261116112253_supplier_note_payments_112.sql"],
  ["branch-sale-prices-123.sql", "20261123190000_branch_sale_prices_123.sql"],
  ["cash-flow-127.sql", "20261126220000_cash_flow_127.sql"],
  ["office-stock-transfers-133.sql", "20261127102631_office_stock_transfers_133.sql"],
  ["branch-stock-132.sql", "20261127090000_branch_stock_132.sql"],
  ["outbound-units-131.sql", "20261126234500_outbound_units_131.sql"],
  ["petty-cash-130.sql", "20261126233000_petty_cash_130.sql"],
  ["cashier-expenses-128.sql", "20261126230000_cashier_expenses_128.sql"],
  ["outbound-batches-126.sql", "20261126160000_outbound_batches_126.sql"],
  ["supplier-stock-122.sql", "20261123180000_supplier_stock_122.sql"],
  ["warehouse-workflow-114.sql", "20261116130125_warehouse_receiving_wholesale_114.sql"],
]) {
  if (
    !fs
      .readFileSync(path.join(root, "database", source))
      .equals(fs.readFileSync(path.join(root, "supabase/migrations", migration)))
  )
    failures.push("SQL copy differs from CLI migration: " + source);
}
const build = spawnSync(process.execPath, ["scripts/build-database.mjs", "--check"], {
  cwd: root,
  encoding: "utf8",
});
if (build.status !== 0) failures.push(build.stderr || build.stdout);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `PASS project checks: ${sources.length} source files, syntax, local imports/assets, single module identities, unique navigation/styles and SQL build consistency.`,
  );
