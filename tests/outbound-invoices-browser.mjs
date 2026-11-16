import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { emptyState, money } from "../pos/core.mjs";
import { invoiceFixture } from "./helpers/outbound-invoices-fixture.mjs";
import { openSidebar } from "./helpers/browser-sidebar.mjs";
const state = { ...emptyState(), ...invoiceFixture(), opsVersion: 19 },
  mutations = [],
  errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (err) => errors.push(err.message));
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
    if (u.pathname.endsWith("/pos_read")) return reply(state);
    if (u.pathname.endsWith("/pos_product_photos")) return reply([]);
    if (u.pathname.endsWith("/pos_store_logo")) return reply({ logo: null });
    if (u.pathname.includes("/rpc/")) {
      mutations.push(u.pathname);
      return route.fulfill({ status: 400, json: { message: "Unexpected mutation" } });
    }
    const file = path.join(
      process.cwd(),
      u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname,
    );
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({
      body: fs.readFileSync(file),
      contentType: /\.m?js$/.test(file)
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".html")
            ? "text/html"
            : "image/png",
    });
  });
  await page.goto("https://test.invalid/pos/");
  await page.locator('[name="identifier"]').fill("owner");
  await page.locator('[name="password"]').fill("fixture");
  await page.locator('#login-form [type="submit"]').click();
  const nav = async () => {
    await openSidebar(page);
    const b = page.locator('#pos-navigation [data-view="transfers"]'),
      group = b.locator("xpath=ancestor::details");
    if ((await group.getAttribute("open")) === null)
      await group.locator("summary").click();
    await b.click();
    await page.locator("[data-outbound-page]").waitFor();
  };
  await nav();
  const count = (group) =>
    page.locator(`[data-invoice-table="${group}"] [data-outbound-row]`).count();
  assert.equal(await count("issued"), 7);
  assert.equal(await count("drafts"), 2);
  assert.equal(await count("cancelled"), 2);
  await page.locator("[data-invoice-from]").fill("2026-11-16");
  await page.locator("[data-invoice-to]").fill("2026-11-16");
  await page.locator("[data-invoice-to]").press("Tab");
  assert.equal(await count("issued"), 4);
  assert.equal(
    await page.locator('[data-invoice-total="total"]').innerText(),
    money(1200000),
  );
  await page.locator("[data-invoice-payment]").selectOption("unpaid");
  assert.equal(await count("issued"), 3);
  assert.equal(
    await page.locator('[data-invoice-total="paid"]').innerText(),
    money(250000),
  );
  await page.locator('[data-outbound-open="partial"]').click();
  await page.locator("[data-outbound-detail]").waitFor();
  await page.locator('dialog[open] [type="submit"]').click();
  assert.equal(await page.locator("[data-invoice-payment]").inputValue(), "unpaid");
  await page.reload();
  await page.locator("#pos-main").waitFor();
  await nav();
  assert.equal(await count("issued"), 3);
  assert.equal(await page.locator("[data-invoice-from]").inputValue(), "2026-11-16");
  state.outboundOrders.find((o) => o.id === "partial").paid = 200000;
  await page.locator("[data-supply-refresh]").click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-invoice-table="issued"] [data-outbound-row]')
        .length === 2,
  );
  assert.equal(
    await page.locator('[data-invoice-total="remaining"]').innerText(),
    money(800000),
  );
  await page.locator("[data-invoice-from]").fill("2026-11-18");
  await page.locator("[data-invoice-from]").press("Tab");
  assert.match(await page.locator("[data-invoice-error]").innerText(), /Tanggal awal/);
  assert.equal(await count("issued"), 0);
  await page.locator("[data-invoice-reset]").click();
  assert.equal(await count("issued"), 7);
  for (const theme of ["light", "dark"])
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      );
      assert.equal(await page.locator("[data-invoice-table]").count(), 3);
      for (const control of [
        "[data-invoice-period]",
        "[data-invoice-from]",
        "[data-invoice-to]",
        "[data-invoice-payment]",
      ])
        assert(
          await page
            .locator(control)
            .evaluate((el) => el.getBoundingClientRect().width > 100),
        );
    }
  await openSidebar(page);
  await page.locator('[data-workspace="warehouse"]').click();
  await nav();
  assert.equal(await page.locator("[data-invoice-summary]").count(), 0);
  assert.equal(await page.locator("[data-invoice-payment]").count(), 0);
  assert(!/Rp/.test(await page.locator("[data-outbound-page]").innerText()));
  assert.equal(
    await page.locator("[data-outbound-page] img, [data-outbound-page] script").count(),
    0,
  );
  assert.deepEqual(mutations, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS invoice browser: shipped app, three tables, date/payment filters, summary, late-payment attribution, refresh/reload/modal preservation, scoped warehouse privacy, desktop/mobile dark/light; no mutations.",
  );
} finally {
  await browser.close();
}
