import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "espree";
import { Node } from "./variant-dom.mjs";
import { navigation, sections } from "../pos/navigation.mjs";
import { systemDock } from "../pos/system-dock.mjs";

function shell() {
  const titles = Object.fromEntries(sections.flatMap((s) => s.pages).map((p) => [p, p]));
  const root = new Node("body");
  root.innerHTML =
    '<nav id="pos-navigation">' +
    navigation(titles, "orders", () => "", null) +
    "</nav>" +
    systemDock("orders", null);
  return root;
}

test("sidebar and dock share destinations but each scoped target is unique", () => {
  const root = shell();
  for (const view of ["orders", "reports", "stock", "kitchen"]) {
    assert.equal(root.querySelectorAll(`nav [data-view="${view}"]`).length, 2);
    assert.equal(
      root.querySelectorAll(`#pos-navigation [data-view="${view}"]`).length,
      1,
    );
    assert.equal(root.querySelectorAll(`.system-dock [data-view="${view}"]`).length, 1);
  }
});

test("dock preferences isolate accounts and discard duplicate or inaccessible pages", (t) => {
  const entries = new Map([
    [
      "maniac-pos-dock-v1:cut1:store",
      '["cutting","cutting","retailFunds","scan","unknown"]',
    ],
    ["maniac-pos-dock-v1:cut2:store", "[]"],
  ]);
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => entries.get(key) ?? null },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  });
  const root = new Node("body");
  function shortcuts(userId, cut) {
    root.innerHTML = systemDock(
      "orders",
      { workspace: "store", sell: true, cut },
      { userId },
    );
    assert.equal(root.querySelectorAll("[data-dock-settings]").length, 1);
    assert.equal(root.querySelectorAll("[data-item-lookup]").length, 1);
    return root
      .querySelectorAll(".dock-pages button")
      .map((button) => button.dataset.view);
  }
  assert.deepEqual(shortcuts("cut1", true), ["cutting"]);
  assert.deepEqual(shortcuts("cut1", false), []);
  assert.deepEqual(shortcuts("cut2", true), []);
  assert(shortcuts("other", true).includes("orders"));
});

test("browser navigation locators do not collide when the sidebar and dock coexist", () => {
  const root = shell(),
    failures = [];
  const directory = new URL("./", import.meta.url);
  for (const file of fs
    .readdirSync(directory)
    .filter((f) => /browser.*\.(mjs|cjs)$/.test(f) || f === "reports-app-smoke.mjs")) {
    const ast = parse(fs.readFileSync(new URL(file, directory), "utf8"), {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    const walk = (node) => {
      if (!node?.type) return;
      if (node.type === "CallExpression" && node.callee?.property?.name === "locator") {
        const selector = node.arguments[0]?.value;
        if (
          typeof selector === "string" &&
          /^(nav|#pos-navigation)(?:\s+\[data-view=.+\])?$/.test(selector)
        ) {
          // A zero match is intentional for negative role/retired-menu assertions.
          // The minimal DOM adapter only implements quoted attribute values.
          const normalized = selector.replace(
            /\[data-view=([a-z]+)\]/g,
            '[data-view="$1"]',
          );
          const count = root.querySelectorAll(normalized).length;
          if (count > 1) failures.push(`${file}: ${selector} matches ${count} elements`);
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value?.type) walk(value);
      }
    };
    walk(ast);
  }
  assert.deepEqual(failures, []);
});
