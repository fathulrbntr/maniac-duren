// Archive historical instructions; never delete application, SQL or user data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const names = JSON.parse(
  fs.readFileSync(new URL("./archive-documents.json", import.meta.url), "utf8"),
);
const planned = names.filter((name) => fs.existsSync(path.join(root, name)));
for (const name of planned) {
  if (
    path.basename(name) !== name ||
    !fs.lstatSync(path.join(root, name)).isFile()
  )
    throw Error("Invalid archive entry: " + name);
  const target = path.join(root, "docs/archive", name);
  if (
    fs.existsSync(target) &&
    !fs.readFileSync(target).equals(fs.readFileSync(path.join(root, name)))
  )
    throw Error("Different archive exists; no files changed: " + name);
}
if (process.argv.includes("--check")) {
  console.log(planned.length + " historical guides to archive.");
  for (const name of planned) console.log(name);
} else {
  fs.mkdirSync(path.join(root, "docs/archive"), { recursive: true });
  for (const name of planned) {
    const source = path.join(root, name),
      target = path.join(root, "docs/archive", name);
    if (fs.existsSync(target)) fs.unlinkSync(source);
    else fs.renameSync(source, target);
  }
  console.log(
    planned.length +
      " historical guides archived. Application, database and photos preserved.",
  );
}
