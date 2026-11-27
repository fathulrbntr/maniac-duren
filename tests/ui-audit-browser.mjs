import { acceptConfirmations } from "./helpers/browser-confirmation.mjs";
// Real entry point, isolated data, every navigation item and both themes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fixture } from "./stock-demo-fixture.mjs";
import { openSidebar } from "./helpers/browser-sidebar.mjs";
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
let page,
  step = { phase: "startup", theme: "light", width: 1600, view: "dashboard" };
try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [],
    missing = [],
    layouts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await acceptConfirmations(page);
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
  await page.locator("#login-form").waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  const menuBrand = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((face) => face.status === "loaded");
    return {
      background: getComputedStyle(document.body).backgroundColor,
      action: getComputedStyle(document.querySelector("#login-form .primary"))
        .backgroundColor,
      fonts: loaded.map((face) => face.family.replaceAll('"', "")).sort(),
    };
  });
  assert.deepEqual(menuBrand, {
    background: "rgb(243, 240, 223)",
    action: "rgb(20, 99, 33)",
    fonts: ["DM Sans", "Manrope"],
  });
  await page.locator("[name=identifier]").fill("owner");
  await page.locator("[name=password]").fill("fixture");
  await page.locator("#login-form [type=submit]").click();
  await page.locator("#pos-main").waitFor();
  const views = await page
    .locator("#pos-navigation [data-view]")
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.view));
  const nav = async (view) => {
    step = { ...step, phase: "navigation", view };
    await openSidebar(page);
    const button = page.locator(`#pos-navigation [data-view="${view}"]`);
    await page.locator("#pos-sidebar").waitFor({ state: "visible" });
    if (!(await button.evaluate((el) => el.closest("details").open)))
      await button.locator("xpath=ancestor::details/summary").click();
    await button.click();
    await page.locator(`.shell[data-page="${view}"] #pos-main`).waitFor();
  };
  for (const theme of ["light", "dark"]) {
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme)
      await page.locator("[data-theme-toggle]").click();
    for (const width of [1600, 1024, 900, 901, 390, 360, 1600]) {
      step = { phase: "resize", theme, width, view: "dashboard" };
      console.log(`UI audit 117C: theme=${theme} width=${width}`);
      await page.setViewportSize({ width, height: 1000 });
      for (const view of views) {
        await nav(view);
        const result = await page.evaluate(() => ({
          width: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          mainWidth: document.querySelector("main").clientWidth,
          mainScroll: document.querySelector("main").scrollWidth,
        }));
        if (view === "orders" && [1600, 360].includes(width)) {
          const card = page.locator("#order-products .order-product:visible").first();
          const geometry = await card.evaluate((el) => {
            const rect = (selector) => el.querySelector(selector).getBoundingClientRect();
            const info = rect(".order-product-info");
            const photo = rect(".order-product-photo");
            const footer = rect(".order-product-footer");
            return {
              photoRightOfText: photo.left >= info.right,
              footerBelow: footer.top >= Math.max(info.bottom, photo.bottom) - 1,
              fitsCard: el.scrollWidth <= el.clientWidth + 1,
            };
          });
          assert.deepEqual(geometry, {
            photoRightOfText: true,
            footerBelow: true,
            fitsCard: true,
          });
        }
        layouts.push({ theme, width, view, ...result });
        assert(
          result.pageWidth <= width + 1,
          `${view} ${theme} page overflow ${width}: ${result.pageWidth}`,
        );
        if (
          [1600, 390].includes(width) &&
          ["dashboard", "products", "orders", "reports", "documents"].includes(view)
        )
          await page.screenshot({
            path: path.join(output, `${view}-${theme}-${width}.png`),
            fullPage: true,
          });
      }
      await nav("products");
      step.phase = "product dialog";
      await page.locator("#add-catalog-product").click();
      const productDialog = page.locator("dialog.product-entry-modal[open]");
      await productDialog.waitFor({ state: "visible" });
      assert(
        await productDialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `product dialog overflow ${width}`,
      );
      const fields = await productDialog.evaluate((el) =>
        ["itemType", "stockUnit", "sku", "barcode", "priceKg", "pricePiece"].map(
          (name) => {
            const { left, top, width } = el
              .querySelector(`[name="${name}"]`)
              .getBoundingClientRect();
            return { left, top, width };
          },
        ),
      );
      const [type, unit, sku, barcode, kg, piece] = fields;
      if (width > 640) {
        assert.deepEqual([sku.left, kg.left], [type.left, type.left]);
        assert.deepEqual([barcode.left, piece.left], [unit.left, unit.left]);
        assert.equal(sku.top, barcode.top);
        assert.equal(kg.top, piece.top);
        assert(fields.every((field) => Math.abs(field.width - type.width) < 1));
      } else {
        assert(
          fields.every((field) => field.left === type.left && field.width === type.width),
        );
        assert(fields.every((field, i) => i === 0 || field.top > fields[i - 1].top));
      }
      await productDialog.getByRole("button", { name: "Tutup", exact: true }).click();
      await productDialog.waitFor({ state: "hidden" });
      await nav("stock");
      step.phase = "receipt dialog";
      await page.locator("#add-receipt").click();
      await page.locator("dialog[open] #receive-durian").click();
      // close() clears [open] before the queued close event removes the chooser.
      // Inspect the new receipt, even while that closed dialog is still in the DOM.
      const receiptDialog = page.locator("dialog.receipt-shipment-dialog[open]");
      await receiptDialog.waitFor({ state: "visible" });
      assert(
        await receiptDialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `receipt dialog overflow ${width}`,
      );
      await receiptDialog.getByRole("button", { name: "Tutup", exact: true }).click();
      await receiptDialog.waitFor({ state: "hidden" });
    }
  }
  // Refresh retains login; all module URLs must resolve to one identity per path.
  step.phase = "reload and resources";
  await page.reload();
  await page.locator("#pos-main").waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
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
  fs.writeFileSync(path.join(output, "layouts.json"), JSON.stringify(layouts, null, 2));
  console.log(
    `PASS UI audit: ${views.length} menus × 7 viewport steps × 2 themes, breakpoint round trips, product/receipt dialogs, session reload and unique module URLs.`,
  );
} catch (error) {
  // Preserve the exact phase and state; a click timeout alone cannot distinguish
  // a closing animation, a collapsed group, or a navigation that never completed.
  const sidebar = await page
    ?.evaluate((view) => {
      const shell = document.querySelector(".shell"),
        panel = document.querySelector("#pos-sidebar"),
        toggle = document.querySelector("#sidebar-toggle"),
        button = document.querySelector(`#pos-navigation [data-view="${view}"]`);
      const describe = (element) => {
        if (!element) return null;
        const style = getComputedStyle(element),
          rect = element.getBoundingClientRect();
        return {
          inert: element.inert,
          ariaHidden: element.getAttribute("aria-hidden"),
          display: style.display,
          visibility: style.visibility,
          transform: style.transform,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        mobile: matchMedia("(max-width: 900px)").matches,
        shell: shell ? { ...shell.dataset } : null,
        expanded: toggle?.getAttribute("aria-expanded"),
        panel: describe(panel),
        button: describe(button),
        groupOpen: button?.closest("details")?.open,
      };
    }, step.view)
    .catch((captureError) => ({ unavailable: captureError.message }));
  fs.writeFileSync(
    path.join(output, "failure.json"),
    JSON.stringify({ step, sidebar, error: error.message }, null, 2),
  );
  await page
    ?.screenshot({ path: path.join(output, "failure.png"), fullPage: true })
    .catch((captureError) => console.error(`Screenshot: ${captureError.message}`));
  console.error(
    `FAIL UI audit 117C: ${JSON.stringify(step)}; see ${output}/failure.json`,
  );
  throw error;
} finally {
  await browser.close();
}
