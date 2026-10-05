// Local browser smoke test. BROWSER_EXECUTABLE is optional after `npx playwright install chromium`.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const root = fileURLToPath(new URL("../", import.meta.url));
const server = http.createServer((req, res) => {
  let pathname = new URL(req.url, "http://local").pathname;
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(root, "." + pathname);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const bytes = fs.readFileSync(file);
    res.setHeader(
      "content-type",
      /\.(m?js)$/.test(file)
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".html")
            ? "text/html"
            : "image/png",
    );
    res.end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: process.env.BROWSER_EXECUTABLE
    ? ["--no-sandbox", "--no-zygote", "--single-process", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : [],
  headless: true,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/pos-config", (r) =>
    r.fulfill({ json: { configured: false } }),
  );
  await page.goto(`http://127.0.0.1:${server.address().port}/pos/`);
  await page.locator("#demo-enter").click();
  const nav = async (view) => {
    await page.locator(`nav [data-view="${view}"]`).click();
  };
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("maniac-pos-demo-v1")));
  for (const view of [
    "dashboard",
    "cashier",
    "stock",
    "production",
    "waste",
    "reports",
    "products",
    "recipes",
    "stores",
    "suppliers",
  ]) {
    await nav(view);
    assert(await page.locator("main h1").isVisible());
  }

  for (const [name, type] of [
    ["Tepung Test", "raw"],
    ["Cendol Test", "prep"],
  ]) {
    await nav("products");
    await page.locator("#add-catalog-product").click();
    const f = page.locator("dialog[open] form");
    await f.locator("[name=name]").fill(name);
    await f.locator("[name=sku]").fill(name.replaceAll(" ", "-"));
    await f.locator("[name=itemType]").selectOption(type);
    await f.locator("[name=stockUnit]").selectOption("g");
    await f.locator("[type=submit]").click();
    assert.equal(await page.locator("dialog[open]").count(), 0);
  }
  await nav("stock");
  await page.locator("#add-receipt").click();
  await page.locator("#receive-unit").click();
  let f = page.locator("dialog[open] form");
  await f.locator("[name=qty]").fill("1000");
  await f.locator("[name=totalCost]").fill("10000");
  await f.locator("[name=supplierId]").selectOption({ index: 1 });
  await f.locator("[type=submit]").click();
  await nav("recipes");
  await page.locator("#new-recipe").click();
  f = page.locator("dialog[open] form");
  await f.locator("[name=name]").fill("Resep Test");
  await f.locator("[name=yieldQty]").fill("1000");
  await f.locator("[data-ingredient-row] input").fill("500");
  await f.locator("[type=submit]").click();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await nav("production");
  await page.locator("[name=recipeId]").selectOption({ index: 1 });
  await page.locator("#production-form [type=submit]").click();
  let production = (await state()).productions.at(-1);
  assert.equal(production.actualQty, 1000);
  await page.locator(`[data-void-production="${production.id}"]`).click();
  await page.locator("dialog[open] [name=reason]").fill("Koreksi tes");
  await page.locator("dialog[open] [type=submit]").click();
  assert.equal((await state()).productions.at(-1).voided, true);
  await nav("stock");
  await page.locator("#add-receipt").click();
  await page.locator("#receive-durian").click();
  let form = page.locator("dialog[open] form");
  await form.locator("[name=kg]").fill("10");
  await form.locator("[name=pieces]").fill("4");
  await form.locator("[name=totalCost]").fill("100000");
  await form.locator("[type=submit]").click();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  let s = await state();
  assert(s.lots.some((x) => x.receivedKg === 10 && x.receivedPieces === 4));
  await nav("cashier");
  await page.locator("[data-product]").first().click();
  form = page.locator("dialog[open] form");
  await form.locator("[name=unit]").selectOption("BUTIR");
  await form.locator("[name=kg]").fill("2");
  await form.locator("[name=price]").fill("100000");
  await form.locator("[type=submit]").click();
  const before = await state();
  await page.locator("#checkout [name=paid]").fill("100000");
  await page.locator("#checkout [type=submit]").click();
  s = await state();
  assert.equal(s.sales.length, before.sales.length + 1);
  const sale = s.sales.at(-1);
  assert.equal(sale.total, 100000);
  assert.equal(sale.lines[0].kg, 2);
  await page.locator("#close-receipt").click();
  await nav("waste");
  const received = new Date().toLocaleDateString("en-CA", {timeZone:"Asia/Jakarta"});
  await page.locator("[name=receivedDate]").fill(received);
  await page.locator("[name=sourceProductId]").selectOption({ index: 1 });
  await page.locator("[name=sourceLotId]").selectOption({ index: 1 });
  await page.locator("#waste-form [name=kg]").fill("2");
  await page.locator("#waste-form [name=pieces]").fill("1");
  await page.locator("#waste-form [name=reason]").fill("Tes alur");
  // Dirty form must survive a declined navigation.
  page.once("dialog", (d) => d.dismiss());
  await nav("stock");
  assert(await page.locator("#waste-form").isVisible());
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .locator("#waste-proof-file")
    .setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: png });
  await page
    .locator("#waste-proof-status")
    .filter({ hasText: "siap disimpan" })
    .waitFor();
  page.once("dialog", (d) => d.accept());
  await page.locator("#waste-form [type=submit]").click();
  s = await state();
  const waste = s.wasteRuns.at(-1);
  assert.equal(waste.kg, 2);
  assert(waste.evidence.reject);
  assert.equal(waste.lossKg, 2);
  await page.locator(`[data-waste-evidence="${waste.id}"]`).click();
  assert.equal(await page.locator("dialog[open] img").count(), 1);
  await page.locator("dialog[open] [type=submit]").click();
  await page.locator(`[data-waste-void="${waste.id}"]`).click();
  await page.locator("dialog[open] [name=reason]").fill("Koreksi tes");
  await page.locator("dialog[open] [type=submit]").click();
  assert.equal(
    (await state()).wasteRuns.find((x) => x.id === waste.id).voided,
    true,
  );
  await nav("stock");
  await page.locator("#add-receipt").click();
  await page.locator("#receive-unit").click();
  if (await page.locator("dialog[open]").count()) {
    assert(await page.locator("dialog[open] [name=qty]").isVisible());
    await page.locator("dialog[open] .close").first().click();
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of [
      "dashboard",
      "stock",
      "waste",
      "products",
      "production",
    ]) {
      await nav(view);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${view} overflows at ${width}`,
      );
    }
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.SCREENSHOT_DIR, `pos-${width}.png`),
        fullPage: true,
      });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: all navigation, product forms, recipes, production/reversal, receipts, piece sales, real kg consumption, dirty-form guard, photo upload/history, waste cancellation, mobile overflow.",
  );
} finally {
  await browser.close();
  server.close();
}
