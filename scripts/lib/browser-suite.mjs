import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

// Keep independent suites running after a failure, but never use a failed fixture.
export async function runBrowserSuites({
  root,
  suites,
  outputDirectory = path.join(root, "test-results", "browser-suite"),
  write = (text) => process.stdout.write(text),
}) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  const results = [];
  for (const { file, requires = [] } of suites) {
    const logFile = path.join(outputDirectory, path.basename(file) + ".log");
    const blockedBy = requires.filter(
      (dependency) =>
        results.find((result) => result.file === dependency)?.status !== "passed",
    );
    if (blockedBy.length) {
      const message = `BLOCKED ${file}: prerequisite failed: ${blockedBy.join(", ")}\n`;
      fs.writeFileSync(logFile, message);
      write(message);
      results.push({ file, status: "blocked", blockedBy, logFile });
      continue;
    }
    write(`\nRunning ${file}\n`);
    fs.writeFileSync(logFile, "");
    const started = Date.now();
    const result = await new Promise((resolve) => {
      let launchError;
      const child = spawn(process.execPath, [path.join("tests", file)], {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const log = (chunk) => {
        fs.appendFileSync(logFile, chunk);
        write(chunk.toString());
      };
      child.stdout.on("data", log);
      child.stderr.on("data", log);
      child.on("error", (error) => {
        launchError = error.message;
        log(`${launchError}\n`);
      });
      child.on("close", (code, signal) =>
        resolve({
          file,
          status: !launchError && code === 0 ? "passed" : "failed",
          code,
          signal,
          ...(launchError ? { error: launchError } : {}),
          durationMs: Date.now() - started,
          logFile,
        }),
      );
    });
    results.push(result);
  }
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    results,
  };
  const summary = path.join(outputDirectory, "summary.json");
  fs.writeFileSync(summary, JSON.stringify(report, null, 2) + "\n");
  write(
    `\nBrowser suites: ${report.passed} passed, ${report.failed} failed, ${report.blocked} blocked.\n`,
  );
  for (const result of results.filter((r) => r.status !== "passed"))
    write(`${result.status.toUpperCase()} ${result.file}: ${result.logFile}\n`);
  write(`Summary: ${summary}\n`);
  return report;
}
