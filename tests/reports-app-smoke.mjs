import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { openSidebar } from "./helpers/browser-sidebar.mjs";
const s = JSON.parse(fs.readFileSync("test-results/database-071-fixture.json", "utf8")),
  root = process.cwd();
const b = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const serve = (r) => {
    const u = new URL(r.request().url());
    if (["/", "/sebelum-pos"].includes(u.pathname))
      return r.fulfill({ contentType: "text/html", body: "<title>Website</title>" });
    if (u.pathname === "/api/pos-config")
      return r.fulfill({
        json: { configured: true, url: "https://test.invalid", key: "test" },
      });
    if (u.pathname === "/api/pos-login")
      return r.fulfill({
        json: {
          access_token: "fixture",
          refresh_token: "fixture",
          expires_in: 3600,
          user: { id: s.me.id },
        },
      });
    if (u.pathname === "/rest/v1/rpc/pos_read") return r.fulfill({ json: s });
    const file = path.join(
      root,
      u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname,
    );
    if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: "Not found" });
    const ext = path.extname(file);
    return r.fulfill({
      body: fs.readFileSync(file),
      contentType:
        ext === ".html"
          ? "text/html"
          : ext === ".css"
            ? "text/css"
            : ext === ".png"
              ? "image/png"
              : ext === ".webp"
                ? "image/webp"
                : "text/javascript",
    });
  };
  await page.context().route("**/*", serve);
  await page.evaluate(() => location.replace("https://test.invalid/pos/"));
  await page.locator("[name=identifier]").fill("owner@test.local");
  await page.locator("[name=password]").fill("test123");
  await page.locator("#login-form [type=submit]").click();
  await openSidebar(page);
  assert.equal(await page.locator(".nav-item[data-view=reports]").count(), 1);
  for (const view of ["salesreport", "finance", "trace", "batches"])
    assert.equal(await page.locator(`.nav-item[data-view=${view}]`).count(), 0);
  if (!(await page.locator(".nav-item[data-view=reports]").isVisible()))
    await page.locator("[data-nav-group=laporan] summary").click();
  await page.locator(".nav-item[data-view=reports]").click();
  await page.waitForSelector("#report-result");
  await page.screenshot({
    path: "test-results/reports-admin/full-app-reports.png",
    fullPage: true,
  });
  await page.locator(".nav-item[data-view=documents]").click();
  await page.waitForSelector("#documents-list");
  await page.locator("[data-new-document=DO]").click();
  assert(await page.locator("[name=supplierId]").isHidden());
  assert(await page.locator("[name=toStoreId]").isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/reports-admin/full-app-do-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () =>
        document.querySelector("dialog").scrollWidth <=
        document.querySelector("dialog").clientWidth + 1,
    ),
  );
  const home = page.locator('.shell[data-page="home"] .home-page');
  const guard = () =>
    page.waitForFunction(() => history.state?.maniacPosBack === "guard");
  const back = () => page.goBack({ waitUntil: "commit" });
  const warning = () =>
    page
      .getByRole("status")
      .filter({ hasText: "Tekan Kembali sekali lagi untuk keluar." })
      .waitFor();
  const dateInput = page.locator('dialog[open] input[name="date"]');
  await dateInput.fill("2026-10-01");
  await back();
  const prompt = page.getByRole("alertdialog");
  await prompt.locator("[data-cancel]").click();
  assert.equal(await dateInput.inputValue(), "2026-10-01");
  await guard();
  await back();
  await prompt.locator("[data-accept]").click();
  await home.waitFor();
  await guard();
  await back();
  await warning();
  await guard(); // Warning expired. The next Back must only warn again.
  await back();
  await warning();
  await back();
  await page.waitForURL("https://test.invalid/");

  await page.goto("https://test.invalid/sebelum-pos");
  await page.goto("https://test.invalid/pos/");
  await home.waitFor();
  await openSidebar(page);
  await page.locator(".nav-item[data-view=reports]").click();
  await page.locator("#report-result").waitFor();
  await page.reload();
  await home.waitFor();
  await back();
  await warning();
  await back();
  await page.waitForURL("https://test.invalid/sebelum-pos");
  const installed = await b.newContext({
    storageState: await page.context().storageState(),
    userAgent: "Mozilla/5.0 (Linux; Android 16) Chrome/140.0.0.0 Mobile Safari/537.36",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await installed.route("**/*", serve);
  await installed.addInitScript(() => {
    const media = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      media(query === "(display-mode: standalone)" ? "all" : query);
    Object.defineProperty(window, "launchQueue", {
      value: {
        setConsumer: (consumer) => window.addEventListener("pos-test-launch", consumer),
      },
    });
  });
  const phone = await installed.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto("https://test.invalid/sebelum-pos");
  await phone.goto("https://test.invalid/pos/");
  const phoneHome = phone.locator('.shell[data-page="home"] .home-page');
  const reports = phone.locator('.system-dock [data-view="reports"]');
  await phoneHome.waitFor();
  await reports.click();
  await phone.locator("#report-result").waitFor();
  await phone.evaluate(() => window.dispatchEvent(new Event("pos-test-launch")));
  await phoneHome.waitFor();
  await reports.click();
  await phone.locator("[data-dock-settings]").click();
  await phone.getByRole("dialog", { name: "Atur dock" }).waitFor();
  await phone.keyboard.press("Escape");
  await phoneHome.waitFor();
  assert.equal(await phone.locator("dialog[open]").count(), 0);
  await reports.click();
  await phone.keyboard.press("Escape");
  await phoneHome.waitFor();
  await phone.keyboard.press("Escape");
  await phone
    .locator("#toast")
    .getByText("Tekan Kembali sekali lagi untuk keluar.")
    .waitFor();
  await phone.goBack();
  await phone.waitForURL("https://test.invalid/sebelum-pos");
  await installed.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS full application: login startup, existing POS, unique report sidebar, report/document navigation, mobile transfer form, restore to home, back from documents, dirty form protection, double Back, browser exit and Android standalone close signals.",
  );
} finally {
  await b.close();
}
