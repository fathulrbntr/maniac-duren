import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBrowserSuites } from "../scripts/lib/browser-suite.mjs";

test("browser runner collects later failures, preserves logs and blocks failed fixture consumers", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "md-browser-runner-"));
  try {
    fs.mkdirSync(path.join(root, "tests"));
    const files = {
      "first.mjs": 'console.error("first error"); process.exitCode = 3;',
      "consumer.mjs": 'throw Error("must not run without fixture");',
      "passing.mjs": 'console.log("independent pass");',
      "last.mjs": 'console.error("last error"); process.exitCode = 7;',
    };
    for (const [file, source] of Object.entries(files))
      fs.writeFileSync(path.join(root, "tests", file), source);
    let output = "";
    const report = await runBrowserSuites({
      root,
      suites: [
        { file: "first.mjs" },
        { file: "consumer.mjs", requires: ["first.mjs"] },
        { file: "passing.mjs" },
        { file: "last.mjs" },
      ],
      write: (text) => (output += text),
    });
    assert.deepEqual(
      report.results.map(({ file, status }) => ({ file, status })),
      [
        { file: "first.mjs", status: "failed" },
        { file: "consumer.mjs", status: "blocked" },
        { file: "passing.mjs", status: "passed" },
        { file: "last.mjs", status: "failed" },
      ],
    );
    assert.deepEqual([report.passed, report.failed, report.blocked], [1, 2, 1]);
    assert.equal(report.results[0].code, 3);
    assert.equal(report.results[3].code, 7);
    assert.match(output, /first error/);
    assert.match(output, /last error/);
    assert.doesNotMatch(output, /must not run without fixture/);
    for (const result of report.results)
      assert(fs.readFileSync(result.logFile, "utf8").length > 0);
    const saved = JSON.parse(
      fs.readFileSync(path.join(root, "test-results/browser-suite/summary.json"), "utf8"),
    );
    assert.deepEqual(saved, report);
    // Successful fixtures release dependent suites on the next run.
    fs.writeFileSync(path.join(root, "tests/first.mjs"), 'console.log("ready");');
    fs.writeFileSync(path.join(root, "tests/consumer.mjs"), 'console.log("consumed");');
    const clean = await runBrowserSuites({
      root,
      suites: [{ file: "first.mjs" }, { file: "consumer.mjs", requires: ["first.mjs"] }],
      write: () => {},
    });
    assert.deepEqual([clean.passed, clean.failed, clean.blocked], [2, 0, 0]);
    assert.doesNotMatch(fs.readFileSync(clean.results[0].logFile, "utf8"), /first error/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
