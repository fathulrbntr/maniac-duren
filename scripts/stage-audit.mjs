// Stage only paths delivered or moved by this patch. Never commit or push.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(new URL("./audit-patch-files.json", import.meta.url), "utf8"),
);
const git = (args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr || "Git failed");
  return result.stdout;
};
const tracked = new Set(git(["ls-files", "-z"]).split("\0"));
const paths = [...manifest.changed, ...manifest.removed].filter(
  (file) => fs.existsSync(path.join(root, file)) || tracked.has(file),
);
for (let i = 0; i < paths.length; i += 25)
  git([
    "add",
    "-A",
    "--",
    ...paths.slice(i, i + 25).map((file) => ":(literal)" + file),
  ]);
console.log(
  "Staged " + paths.length + " audit paths. Review before committing:",
);
console.log(git(["diff", "--cached", "--stat"]));
