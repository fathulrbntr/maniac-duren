// Stage patch 117 together with its focused browser audit correction.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  "tests/ui-audit-browser.mjs",
  "scripts/stage-patch-117a.mjs",
  "docs/PERBAIKAN-TES-BROWSER-117A.md",
];
for (const file of ["scripts/stage-patch-117.mjs", ...files]) {
  if (!fs.existsSync(path.join(root, file)))
    throw Error("File patch belum lengkap: " + file);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.execPath, ["scripts/stage-patch-117.mjs"]);
run("git", ["add", "--", ...files.map((file) => ":(literal)" + file)]);
console.log("Patch 117 dan perbaikan 117A sudah staged. Periksa diff sebelum commit.");
