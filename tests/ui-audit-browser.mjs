// Real entry point, isolated data, every navigation item and both themes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fixture } from "./stock-demo-fixture.mjs";
import {
  createStockDemo,
  applyStockDemoAction,
  readStockDemo,
} from "../pos/stock-demo.mjs";
const f = fixture();
Object.assign(
  f.state.access,
  Object.fromEntries(
    [
      "stock",
      "produce",
      "waste",
      "reports",
      "finance",
      "trace",
      "employees",
      "attendance",
      "master",
      "cancel",
    ].map((k) => [k, true]),
  ),
);
let state = createStockDemo(f.state);
state.employees = [
  {
    id: state.me.id,
    user_id: state.me.id,
    name: "Owner Test",
    role: "owner",
    active: true,
    store_ids: [],
    permissions: [],
  },
];
const live = () => {
  const value = structuredClone(state);
  delete value.stockDemo;
  return value;
};
const root = process.cwd(),
  output = process.env.SCREENSHOT_DIR || "test-results/ui-audit";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    }),
    errors = [],
    missing = [],
    layouts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (d) => d.accept());
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url()),
      reply = (json) => route.fulfill({ json });
    if (u.pathname === "/api/pos-config")
      return reply({
        configured: true,
        url: "https://test.invalid/backend",
        key: "fixture",
      });
    if (u.pathname === "/api/pos-login")
      return reply({
        access_token: "fixture",
        refresh_token: "fixture",
        expires_in: 3600,
        user: { id: state.me.id },
      });
    if (u.pathname.endsWith("/pos_read")) return reply(live());
    if (u.pathname.startsWith("/backend/rest/v1/rpc/")) {
      const name = u.pathname.split("/").at(-1),
        p = route.request().postDataJSON();
      if (name === "pos_store_logo") return reply({ logo: "" });
      if (name === "pos_cashier_shift_mutate") {
        state = applyStockDemoAction(state, p.action, p.payload);
        return reply(live());
      }
      try {
        return reply(readStockDemo(state, name, p));
      } catch (error) {
        return route.fulfill({ status: 400, json: { message: error.message } });
      }
    }
    const file = path.join(
      root,
      u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname,
    );
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      missing.push(u.pathname);
      return route.fulfill({ status: 404, body: "" });
    }
    return route.fulfill({
      body: fs.readFileSync(file),
      contentType:
        {
          ".js": "text/javascript",
          ".mjs": "text/javascript",
          ".html": "text/html",
          ".css": "text/css",
          ".json": "application/json",
          ".webmanifest": "application/manifest+json",
          ".webp": "image/webp",
          ".png": "image/png",
          ".jpg": "image/jpeg",
        }[path.extname(file)] || "application/octet-stream",
    });
  });
  await page.goto("https://test.invalid/pos/");
  await page.locator("[name=identifier]").fill("owner");
  await page.locator("[name=password]").fill("fixture");
  await page.locator("#login-form [type=submit]").click();
  await page.locator("#pos-main").waitFor();
  const views = await page
    .locator("#pos-navigation [data-view]")
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.view));
  const nav = async (view) => {
    if (await page.locator("#pos-sidebar").evaluate((el) => el.inert))
      await page.locator("#sidebar-toggle").click();
    const button = page.locator(`#pos-navigation [data-view="${view}"]`);
    await page.locator("#pos-sidebar").waitFor({ state: "visible" });
    if (!(await button.evaluate((el) => el.closest("details").open)))
      await button.locator("xpath=ancestor::details/summary").click();
    await button.click();
    await page.locator("main").waitFor();
  };
  for (const theme of ["light", "dark"]) {
    if (
      (await page.evaluate(() => document.documentElement.dataset.theme)) !==
      theme
    )
      await page.locator("[data-theme-toggle]").click();
    for (const width of [1600, 1024, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of views) {
        await nav(view);
        const result = await page.evaluate(() => ({
          width: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          mainWidth: document.querySelector("main").clientWidth,
          mainScroll: document.querySelector("main").scrollWidth,
        }));
        layouts.push({ theme, width, view, ...result });
        assert(
          result.pageWidth <= width + 1,
          `${view} ${theme} page overflow ${width}: ${result.pageWidth}`,
        );
        if (
          [1600, 390].includes(width) &&
          ["dashboard", "products", "orders", "reports", "documents"].includes(
            view,
          )
        )
          await page.screenshot({
            path: path.join(output, `${view}-${theme}-${width}.png`),
            fullPage: true,
          });
      }
      await nav("products");
      await page.locator("#add-catalog-product").click();
      assert(
        await page
          .locator("dialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `product dialog overflow ${width}`,
      );
      await page.locator("dialog .close").first().click();
      await nav("stock");
      await page.locator("#add-receipt").click();
      await page.locator("#receive-durian").click();
      assert(
        await page
          .locator("dialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `receipt dialog overflow ${width}`,
      );
      await page.locator("dialog .close").first().click();
    }
  }
  // Refresh retains login; all module URLs must resolve to one identity per path.
  await page.reload();
  await page.locator("#pos-main").waitFor();
  const duplicates = await page.evaluate(() => {
    const urls = new Map();
    for (const entry of performance.getEntriesByType("resource")) {
      const u = new URL(entry.name);
      if (!/\.(mjs|js)$/.test(u.pathname)) continue;
      if (!urls.has(u.pathname)) urls.set(u.pathname, new Set());
      urls.get(u.pathname).add(u.search);
    }
    return [...urls]
      .filter(([, values]) => values.size > 1)
      .map(([pathname]) => pathname);
  });
  assert.deepEqual(duplicates, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  fs.writeFileSync(
    path.join(output, "layouts.json"),
    JSON.stringify(layouts, null, 2),
  );
  console.log(
    `PASS UI audit: ${views.length} menus × 4 widths × 2 themes, product/receipt dialogs, session reload and unique module URLs.`,
  );
} finally {
  await browser.close();
}
