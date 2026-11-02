// Repository checks require no browser, credentials or production connection.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const failures = [],
  sources = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      [
        ".git",
        "node_modules",
        "backup",
        "test-results",
        "playwright-report",
      ].includes(entry.name) ||
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
  for (const match of source.matchAll(
    /(?:from\s*|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g,
  )) {
    const specifier = match[1],
      target = path.resolve(path.dirname(file), specifier.split("?")[0]);
    if (!fs.existsSync(target))
      failures.push(relative + ": missing " + specifier);
    if (relative.startsWith("pos" + path.sep)) {
      if (!identities.has(target)) identities.set(target, new Set());
      identities
        .get(target)
        .add(specifier.includes("?") ? specifier.split("?")[1] : "");
    }
  }
  if (file.endsWith(".html"))
    for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const ref = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref) || ref.includes("${"))
        continue;
      const target = path.resolve(
        ref.startsWith("/") ? root : path.dirname(file),
        ref.replace(/^\//, "").split(/[?#]/)[0],
      );
      if (!fs.existsSync(target))
        failures.push(relative + ": missing asset " + ref);
    }
}
for (const [file, versions] of identities)
  if (versions.size > 1)
    failures.push(
      path.relative(root, file) + ": multiple module URL identities",
    );
const { sections } = await import("../pos/navigation.mjs");
const pages = sections.flatMap((s) => s.pages);
if (new Set(pages).size !== pages.length)
  failures.push("Duplicate sidebar page");
const html = fs.readFileSync(path.join(root, "pos/index.html"), "utf8");
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].map(
  (m) => m[1],
);
if (new Set(styles).size !== styles.length)
  failures.push("Duplicate stylesheet");
const build = spawnSync(
  process.execPath,
  ["scripts/build-database.mjs", "--check"],
  { cwd: root, encoding: "utf8" },
);
if (build.status !== 0) failures.push(build.stderr || build.stdout);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `PASS project checks: ${sources.length} source files, syntax, local imports/assets, single module identities, unique navigation/styles and SQL build consistency.`,
  );
