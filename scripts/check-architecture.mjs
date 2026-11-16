import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeArchitecture, checkDependencyLock } from "./lib/architecture.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sources = new Map(),
  inventory = new Set();
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      [".git", "node_modules", "backup", "test-results", "playwright-report"].includes(
        entry.name,
      ) ||
      entry.name.startsWith("maniac-foto-")
    )
      continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (entry.isFile()) {
      const name = path.relative(root, file).split(path.sep).join("/");
      inventory.add(name);
      if (/\.(js|mjs|html)$/.test(name)) sources.set(name, fs.readFileSync(file, "utf8"));
    }
  }
}
collect(root);
const { failures, moduleCount } = analyzeArchitecture(sources, inventory);
failures.push(
  ...checkDependencyLock(
    JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")),
    JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")),
  ),
);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `PASS architecture: ${moduleCount} browser sources; exports, import cycles, module URLs, filename case, runtime boundaries and portable dependency pins.`,
  );
