import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage(),
    errors = [],
    missing = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "test.invalid") return route.abort();
    const file = path.join(
      process.cwd(),
      url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname,
    );
    if (!fs.existsSync(file)) {
      missing.push(url.pathname);
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
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".webp": "image/webp",
        }[path.extname(file)] || "application/octet-stream",
    });
  });
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of ["/", "/menu/", "/menu/kelola.html"]) {
      await page.goto("https://test.invalid" + url);
      await page.waitForLoadState("load");
      assert((await page.locator("body").innerText()).length > 20);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        url + " overflows " + width,
      );
      if (url === "/") {
        if (width <= 600) {
          const clipped = await page.locator(".hero-copy, .hero-visual, .hero-durian, .hero-price, .hero-sticker").evaluateAll(nodes => nodes.filter(node => {
            const r = node.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1;
          }).map(node => node.className));
          assert.deepEqual(clipped, [], "Mobile hero content must remain fully visible");
          assert(await page.locator(".hero-actions .button").first().evaluate(node => node.getBoundingClientRect().height >= 44));
        }
        const gallery = page.locator(".gallery-swiper");
        await gallery.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => {
          const image = document.querySelector(".gallery-swiper img");
          return image.complete && image.naturalWidth > 0;
        });
        assert.equal(await gallery.locator("img").count(), 1);
        assert.equal(await gallery.locator(".swiper-pagination").isVisible(), false);
        await gallery.screenshot({path: `test-results/public-gallery-${width}.png`});
        assert.equal(await gallery.locator(".swiper-slide").evaluate(el => getComputedStyle(el).opacity), "1");
        await page.evaluate(() => scrollTo({top:0,behavior:"instant"}));
        await page.screenshot({path: `test-results/public-home-${width}.png`});
      }
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  console.log(
    "PASS public website, menu and editor: 3 widths, no missing local assets or runtime errors, external widgets unavailable.",
  );
} finally {
  await browser.close();
}
