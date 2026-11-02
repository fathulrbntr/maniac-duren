// Explicit file list also works in npm on Windows.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2] || "all";
if (!["all", "unit", "db"].includes(mode)) throw Error("Use all, unit or db");
const files = fs
  .readdirSync(new URL("../tests/", import.meta.url))
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => {
    const database = fs
      .readFileSync(new URL("../tests/" + f, import.meta.url), "utf8")
      .includes("@electric-sql/pglite");
    return mode === "all" || (mode === "db" ? database : !database);
  })
  .sort();
const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=2", ...files.map((f) => "tests/" + f)],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
