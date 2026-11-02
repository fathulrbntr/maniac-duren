import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("Audit cleanup archives guides, preserves modified files and is repeatable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maniac-cleanup-"));
  try {
    fs.mkdirSync(path.join(root, "scripts"));
    for (const file of ["clean-project.mjs", "apply-audit-cleanup.mjs"])
      fs.copyFileSync(
        new URL("../scripts/" + file, import.meta.url),
        path.join(root, "scripts", file),
      );
    fs.writeFileSync(
      path.join(root, "scripts/archive-documents.json"),
      JSON.stringify(["PATCH-OLD.txt"]),
    );
    const sha256 = createHash("sha256").update("git stat").digest("hex");
    fs.writeFileSync(
      path.join(root, "scripts/cleanup-manifest.json"),
      JSON.stringify({ remove: [{ path: "stray.txt", sha256 }] }),
    );
    fs.writeFileSync(path.join(root, "PATCH-OLD.txt"), "historical guide");
    fs.writeFileSync(path.join(root, "stray.txt"), "user changed this");
    fs.writeFileSync(path.join(root, "keep.sql"), "valuable data");
    const run = (...args) =>
      spawnSync(
        process.execPath,
        ["scripts/apply-audit-cleanup.mjs", ...args],
        { cwd: root, encoding: "utf8" },
      );
    assert.notEqual(run().status, 0);
    assert(
      fs.existsSync(path.join(root, "PATCH-OLD.txt")),
      "preflight failure must not archive files",
    );
    assert.equal(
      fs.readFileSync(path.join(root, "stray.txt"), "utf8"),
      "user changed this",
    );
    fs.writeFileSync(path.join(root, "stray.txt"), "git stat");
    assert.equal(run("--check").status, 0);
    assert(fs.existsSync(path.join(root, "stray.txt")));
    fs.mkdirSync(path.join(root, "docs/archive"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "docs/archive/PATCH-OLD.txt"),
      "different guide",
    );
    assert.notEqual(run().status, 0);
    assert(
      fs.existsSync(path.join(root, "stray.txt")),
      "archive conflict must not remove files",
    );
    fs.writeFileSync(
      path.join(root, "docs/archive/PATCH-OLD.txt"),
      "historical guide",
    );
    assert.equal(run().status, 0);
    assert.equal(run().status, 0);
    assert(!fs.existsSync(path.join(root, "PATCH-OLD.txt")));
    assert(!fs.existsSync(path.join(root, "stray.txt")));
    assert.equal(
      fs.readFileSync(path.join(root, "docs/archive/PATCH-OLD.txt"), "utf8"),
      "historical guide",
    );
    assert.equal(
      fs.readFileSync(path.join(root, "keep.sql"), "utf8"),
      "valuable data",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
