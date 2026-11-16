import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeArchitecture,
  checkDependencyLock,
  moduleSpecifiers,
} from "../scripts/lib/architecture.mjs";

const check = (files) => analyzeArchitecture(new Map(Object.entries(files))).failures;
test("import discovery ignores code examples inside text fixtures and comments", () => {
  assert.deepEqual(
    moduleSpecifiers(`
    import "./real.mjs";
    export { value } from "./exports.mjs";
    import("./lazy.mjs");
    const example = 'import { fake } from "./does-not-exist.mjs"';
    // import "./comment.mjs";
  `),
    ["./real.mjs", "./exports.mjs", "./lazy.mjs"],
  );
});
test("module checks resolve static/dynamic imports, destructuring exports and re-exports", () => {
  assert.deepEqual(
    check({
      "pos/index.html": '<script type="module" src="app.js"></script>',
      "pos/app.js":
        'import { value, other, count } from "./bridge.mjs"; import("./state.mjs");',
      "pos/bridge.mjs":
        'export * from "./state.mjs"; export { default as other } from "./state.mjs";',
      "pos/state.mjs":
        "export const { value, ...rest } = { value: 1 }; export const [count] = [1]; export default 1;",
    }),
    [],
  );
  assert(
    check({
      "pos/app.js": 'import { missing } from "./state.mjs";',
      "pos/state.mjs": "export const exists = 1;",
    }).some((message) => message.includes("does not export missing")),
  );
});
test("module checks catch circular, side-effect, filename case and HTML identity regressions", () => {
  assert(
    check({
      "pos/a.mjs": 'import "./b.mjs";',
      "pos/b.mjs": 'import("./a.mjs");',
    }).some((message) => message.includes("Circular dependency")),
  );
  assert(
    check({ "pos/app.js": 'import "./missing.mjs";' }).some((message) =>
      message.includes("missing import"),
    ),
  );
  assert(
    check({
      "pos/app.js": 'import "./STATE.mjs";',
      "pos/state.mjs": "",
    }).some((message) => message.includes("wrong filename case")),
  );
  assert(
    check({ "pos/A.mjs": "", "pos/a.mjs": "" }).some((message) =>
      message.includes("Case collision"),
    ),
  );
  assert(
    check({
      "pos/index.html": '<script type="module">import "./state.mjs?v=1";</script>',
      "pos/app.js": 'import "./state.mjs";',
      "pos/state.mjs": "",
    }).some((message) => message.includes("multiple module URL identities")),
  );
});
test("browser code cannot pull fixtures or depend on an app from shared modules", () => {
  assert(
    check({
      "pos/app.js": 'import "../tests/helper.mjs";',
      "tests/helper.mjs": "",
    }).some((message) => message.includes("development/server")),
  );
  assert(
    check({
      "shared/example.mjs": 'import "../pos/state.mjs";',
      "pos/state.mjs": "",
    }).some((message) => message.includes("shared code")),
  );
});
test("dependency lock rejects temporary links, extraneous packages and mismatched pins", () => {
  const manifest = { devDependencies: { espree: "11.2.0" } };
  const lock = {
    packages: {
      "": { devDependencies: manifest.devDependencies },
      "node_modules/espree": { version: "11.2.0" },
    },
  };
  assert.deepEqual(checkDependencyLock(manifest, lock), []);
  for (const entry of [
    { "../../tmp/tools": { version: "1", extraneous: true } },
    { "node_modules/tool": { link: true, resolved: "../../tmp/tools" } },
    { "node_modules/espree": { version: "0.0.0" } },
  ])
    assert(
      checkDependencyLock(manifest, { packages: { ...lock.packages, ...entry } }).length >
        0,
    );
});
