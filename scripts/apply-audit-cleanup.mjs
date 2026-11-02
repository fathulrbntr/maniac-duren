// Apply the audit's file moves after copying the patch into an existing checkout.
// Unknown/modified files are never removed.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(new URL("./cleanup-manifest.json", import.meta.url), "utf8"),
);
const removals = [];
for (const entry of manifest.remove) {
  const file = path.resolve(root, entry.path);
  if (path.dirname(file) !== path.resolve(root))
    throw Error("Cleanup is limited to named root files.");
  if (!fs.existsSync(file)) continue;
  if (!fs.lstatSync(file).isFile())
    throw Error("Not a regular file; no cleanup performed: " + entry.path);
  const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (hash !== entry.sha256)
    throw Error("File changed; no cleanup performed: " + entry.path);
  removals.push(file);
}
const check = process.argv.includes("--check");
const result = spawnSync(
  process.execPath,
  ["scripts/clean-project.mjs", ...(check ? ["--check"] : [])],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
for (const file of removals) {
  if (!check) fs.unlinkSync(file);
  console.log(
    (check ? "Would remove" : "Removed") +
      " verified stray file: " +
      path.basename(file),
  );
}
console.log(
  check ? "Audit cleanup preview complete." : "Audit cleanup complete.",
);
