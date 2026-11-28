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
async function assertAlignedActions(group, { shift = false } = {}) {
  const buttons = await group.locator("button:visible").evaluateAll((nodes) =>
    nodes.map((button) => {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        top: box.top,
        height: box.height,
        width: box.width,
        radius: style.borderRadius,
        fits:
          button.scrollWidth <= button.clientWidth + 1 &&
          button.scrollHeight <= button.clientHeight + 1,
      };
    }),
  );
  assert(buttons.length >= 2, `Missing actions in ${group}`);
  const [first] = buttons;
  for (const item of buttons) {
    assert(item.height >= 44 && item.fits, `Small or clipped action in ${group}`);
    assert.equal(item.radius, first.radius);
    assert(
      Math.abs(item.height - first.height) < 1,
      `Unequal action heights in ${group}`,
    );
    if (shift) {
      assert.equal(item.top, first.top);
      assert(Math.abs(item.width - first.width) < 1, "Unequal shift button widths");
    }
  }
  if (shift) {
    assert.equal(buttons.length, 3);
    assert(first.height <= 48, "Oversized shift actions");
  }
}
async function assertSaveFooter(dialog) {
  const footer = dialog.locator(".modal-actions");
  assert.deepEqual(await footer.locator("button:visible").allTextContents(), [
    "Batal",
    "Simpan",
  ]);
  await assertAlignedActions(footer);
  const cancel = await footer
    .getByRole("button", { name: "Batal", exact: true })
    .boundingBox();
  const save = await footer
    .getByRole("button", { name: "Simpan", exact: true })
    .boundingBox();
  assert.equal(cancel.y, save.y);
  assert(Math.abs(cancel.width - save.width) < 1, "Unequal save and cancel widths");
}
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
  const proofByPlan = new Map();
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
      if (name === "pos_cash_deposits_read" && state.branchStockVersion >= 132)
        return reply({
          rows: [],
          periodDeposited: 0,
          summary: state.cashDepositSummary.filter(
            (row) => row.storeId === p.filters.storeId,
          ),
          serverDate: "2026-11-28",
        });
      if (name === "pos_supplier_note_proof")
        return reply(proofByPlan.get(p.plan_id) || null);
      if (name === "pos_warehouse_mutate" && p.action === "receipt_plan_save") {
        const { id, storeId, supplierId, date, lines, shippingCost, noteProof } =
          p.payload;
        assert(!("invoiceNo" in p.payload));
        proofByPlan.set(id, noteProof);
        state.receiptPlans.push({
          id,
          storeId,
          supplierId,
          date,
          lines,
          shippingCost,
          hasProof: !!noteProof,
          invoiceNo: "NS-202611-000042",
          receiving: { status: "open", revision: 0, quantities: {}, scans: [] },
        });
        return reply(live());
      }
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
  const logoPixels = await page.locator(".auth-logo").evaluate(async (logo) => {
    const manifestUrl = document.querySelector('link[rel="manifest"]').href;
    const { icons } = await (await fetch(manifestUrl)).json();
    const sources = [
      logo.currentSrc,
      ...icons
        .filter((icon) => icon.purpose === "any")
        .map((icon) => new URL(icon.src, manifestUrl).href),
    ];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return Promise.all(
      sources.map(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        ctx.clearRect(0, 0, 32, 32);
        ctx.drawImage(img, 0, 0, 32, 32);
        const alpha = ctx.getImageData(0, 0, 32, 32).data.filter((_, i) => i % 4 === 3);
        return { src, transparent: alpha.includes(0), artwork: alpha.includes(255) };
      }),
    );
  });
  for (const { src, transparent, artwork } of logoPixels) {
    assert(
      transparent && artwork,
      `Expected visible artwork on a transparent canvas: ${src}`,
    );
  }
  const splash = await page.evaluate(async () => {
    const manifestUrl = document.querySelector('link[rel="manifest"]').href;
    const manifest = await (await fetch(manifestUrl)).json();
    const icon = new Image();
    icon.src = new URL(
      manifest.icons.find((entry) => entry.purpose === "maskable").src,
      manifestUrl,
    ).href;
    await icon.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = icon.naturalWidth;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = manifest.background_color;
    ctx.fillRect(0, 0, 1, 1);
    const background = ctx.getImageData(0, 0, 1, 1).data;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(icon, 0, 0);
    const size = canvas.width;
    const pixels = ctx.getImageData(0, 0, size, size).data;
    let artwork = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = 4 * (y * size + x);
        if (background.every((value, c) => value === pixels[i + c])) continue;
        if (
          pixels[i + 3] !== 255 ||
          Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4
        )
          return false;
        artwork++;
      }
    }
    return artwork > 0;
  });
  assert(
    splash,
    "Android launch artwork must stay inside the safe zone and blend into the splash screen",
  );
  const menuBrand = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((face) => face.status === "loaded");
    return {
      background: getComputedStyle(document.body).backgroundColor,
      logoBackground: getComputedStyle(document.querySelector(".auth-logo"))
        .backgroundColor,
      action: getComputedStyle(document.querySelector("#login-form .primary"))
        .backgroundColor,
      fonts: loaded.map((face) => face.family.replaceAll('"', "")).sort(),
    };
  });
  assert.deepEqual(menuBrand, {
    background: "rgb(243, 240, 223)",
    logoBackground: "rgba(0, 0, 0, 0)",
    action: "rgb(20, 99, 33)",
    fonts: ["DM Sans", "Manrope"],
  });
  await page.locator("[name=identifier]").fill("owner");
  await page.locator("[name=password]").fill("fixture");
  await page.locator("#login-form [type=submit]").click();
  await page.locator("#pos-main").waitFor();
  await page.locator('.shell[data-page="home"] .home-page').waitFor();
  const views = await page
    .locator("#pos-navigation [data-view]")
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.view));
  const nav = async (view) => {
    step = { ...step, phase: "navigation", view };
    await openSidebar(page);
    const button = page.locator(`#pos-navigation [data-view="${view}"]`);
    await page.locator("#pos-sidebar").waitFor({ state: "visible" });
    if (await button.evaluate((el) => el.closest("details")?.open === false))
      await button.locator("xpath=ancestor::details/summary").click();
    await button.click();
    await page.locator(`.shell[data-page="${view}"] #pos-main`).waitFor();
  };
  for (const theme of ["light", "dark"]) {
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme)
      await page.locator("[data-theme-toggle]").click();
    for (const width of [1600, 1024, 900, 901, 390, 360, 320, 1600]) {
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
        if (view === "home" && width === 390) {
          const home = page.locator(".home-page");
          const more = home.getByRole("button", { name: "Semua menu" });
          await more.click();
          assert(await home.locator("#home-extra").isVisible());
          await home.getByRole("button", { name: "Ringkas" }).click();
          const eye = home.getByRole("button", { name: "Sembunyikan saldo" });
          await eye.click();
          assert(await home.locator(".home-mask").isVisible());
          assert(!(await home.locator(".home-value").isVisible()));
          await home.getByRole("button", { name: "Tampilkan saldo" }).click();
          assert.equal(
            await home
              .locator(".home-grid")
              .first()
              .evaluate(
                (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
              ),
            4,
          );
        }
        if (view === "orders" || view === "shifts")
          await assertAlignedActions(page.locator(".shift-banner-actions"), {
            shift: true,
          });
        if (width <= 390) {
          if (view === "reports")
            await assertAlignedActions(page.locator(".report-heading .report-actions"));
          if (view === "documents")
            for (const group of await page.locator(".doc-toolbar").all())
              await assertAlignedActions(group);
          if (view === "employees") {
            const menu = page.locator(".employee-more").first();
            await menu.locator("summary").click();
            await assertAlignedActions(menu);
            await menu.locator("summary").click();
          }
        }
        if (["devices", "payments", "production"].includes(view)) {
          const save = page
            .locator("#device-settings, #payment-settings-form, #production-form")
            .getByRole("button", { name: "Simpan", exact: true });
          assert(await save.isVisible(), `Missing save action on ${view}`);
        }
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
          ["home", "products", "orders", "reports", "documents"].includes(view)
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
      await assertSaveFooter(productDialog);
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
  // Operational back-office pages use different navigation and tables than the legacy fixture.
  const [origin, destination] = state.stores;
  origin.locationType = destination.locationType = "store";
  const item = state.products.find((product) => product.stockUnit === "pcs");
  const fruit = state.products.find((product) => product.stockUnit === "kg_butir");
  item.barcode = "4006381333931";
  item.name = "Crystalyn kemasan " + "A".repeat(50);
  Object.assign(state, {
    supplierNotesVersion: 112,
    supplierNoteCancelVersion: 134,
    supplierNoteProofVersion: 137,
    warehouseVersion: 107,
    warehouseWorkflowVersion: 114,
    branchStockVersion: 132,
    branchNoteVersion: 135,
    pettyCashVersion: 130,
    retailBalance: 775000,
    cashDepositVersion: 92,
    cashDepositSummary: state.stores.map((st) => ({
      storeId: st.id,
      netCash: st.id === origin.id ? 200000 : 100000,
      netSales: st.id === origin.id ? 1450000 : 500000,
      salesToday: st.id === origin.id ? 250000 : 120000,
      deposited: st.id === origin.id ? 1000000 : 500000,
      pending: st.id === origin.id ? 450000 : 0,
      count: 1,
    })),
    pettyBalances: { [origin.id]: 2500000 },
    pettyRequests: [
      {
        id: "funds",
        store_id: origin.id,
        requested_at: "2026-11-27T00:00:00Z",
        status: "pending",
        amount: 150000,
        reason: "Penggantian perlengkapan toko",
      },
    ],
    locations: state.stores,
    branchNotes: [
      {
        id: "note",
        number: "NT-4",
        origin,
        destination,
        status: "packing",
        requested: [{ productId: item.id, name: item.name, qty: 100, unit: "pcs" }],
        lines: [],
      },
    ],
    receiptPlans: [
      {
        id: "receipt",
        invoiceNo: "546-" + "8".repeat(48),
        date: "2026-11-27",
        supplierId: state.suppliers[0].id,
        storeId: origin.id,
        lines: [
          { productId: item.id, purchaseCost: 300000 },
          { productId: fruit.id, purchaseCost: 11234567890 },
        ],
        expected: {
          [item.id]: { qty: 150, unit: "pcs" },
          [fruit.id]: { kg: 2, pieces: 1 },
        },
        receiving: {
          status: "completed",
          revision: 1,
          quantities: { [item.id]: { qty: 150 } },
          scans: [
            { barcode: "92021511260003210000000162", grams: 2000, productId: fruit.id },
          ],
        },
        receivedId: "shipment",
        invoiceTracked: true,
        shippingTracked: true,
        payments: [],
        shippingCost: 10000,
      },
    ],
    transfers: [
      {
        id: "transfer",
        sourceId: origin.id,
        targetId: destination.id,
        createdAt: "2026-11-27T23:00:00Z",
        receivedAt: "2026-11-28T01:00:00Z",
        deliveryNo: "SJ-CBG-202611-000005",
        invoiceNo: null,
        origin,
        destination,
        status: "received",
        items: [],
        lines: [
          {
            kind: "unit",
            productName: item.name,
            sourceLotId: "batch-crystalyn",
            qty: 100,
            unit: "pcs",
          },
        ],
      },
    ],
  });
  state.access.backoffice = true;
  state.access.cut = true;
  state.employees.find((p) => p.id === state.me.id).profile_photo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
  await page.reload();
  await page
    .locator('#pos-navigation [data-view="retailFunds"]')
    .waitFor({ state: "attached" });
  step.phase = "operational report handoffs";
  await nav("home");
  assert.match(await page.locator(".home-value").innerText(), /775\.000/);
  const shortcuts = page.locator(".home-body > .home-shortcuts:first-child");
  const depositCard = page.locator(".home-work .home-deposits");
  await shortcuts.waitFor();
  await depositCard.getByRole("button", { name: "Riwayat setoran" }).click();
  const history = page.locator("dialog.cash-deposit-history[open]");
  await history.getByText("Belum ada setoran pada periode ini.").waitFor();
  await history.getByRole("button", { name: "Selesai" }).click();
  const hero = page.locator(".home-hero");
  assert.equal(
    await hero.locator(".account-profile img").getAttribute("alt"),
    "Foto Owner Test",
  );
  assert.deepEqual(await hero.locator(".home-financials dt").allTextContents(), [
    "Belum disetor",
    "Tagihan supplier",
    "Omzet hari ini",
  ]);
  assert.match(
    await hero.locator(".home-financials").innerText(),
    /450\.000[\s\S]+11\.234\.867\.890[\s\S]+370\.000/,
  );
  await hero.getByRole("button", { name: "Sembunyikan saldo" }).click();
  assert.equal(await hero.locator("[data-home-amount]:visible").count(), 0);
  await hero.getByRole("button", { name: "Tampilkan saldo" }).click();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    );
    assert(
      await page
        .locator(".home-value")
        .evaluate(
          (el) => el.offsetHeight < parseFloat(getComputedStyle(el).lineHeight) * 1.2,
        ),
    );
    assert(
      await hero
        .locator(".home-financials dd")
        .evaluateAll((cells) =>
          cells.every((cell) => cell.scrollWidth <= cell.clientWidth + 1),
        ),
    );
    assert(await hero.locator(".account-profile strong").isVisible());
    if (width === 390 || width === 1280) {
      if (width === 390) {
        await openSidebar(page);
        await page.locator("#pos-sidebar [data-sidebar-toggle]").click();
        await page.locator("#pos-sidebar").waitFor({ state: "hidden" });
      }
      await page.screenshot({
        path: path.join(output, `beranda-pusat-${width}.png`),
        animations: "disabled",
      });
    }
  }
  await page.getByRole("button", { name: "Lihat omzet" }).click();
  assert.equal(
    await page.locator('[data-dash-tab="transactions"]').getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#dash-store").selectOption(origin.id);
  await page.locator('[data-open-report="products"]').click();
  assert.equal(await page.locator("#report-picker").inputValue(), "products");
  assert.equal(await page.locator("#report-store").inputValue(), origin.id);
  assert.equal(await page.locator("#report-period").inputValue(), "day");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator("#report-picker").selectOption("deliveries");
  assert(!(await page.locator("#report-controls").isVisible()));
  await page.locator("#report-filter-toggle").click();
  await page.locator("#report-from").fill("2026-11-28");
  await page.locator("#report-to").fill("2026-11-28");
  await page.locator("#report-delivery-query").fill("000005");
  await page.locator("#report-delivery-status").selectOption("received");
  assert.match(
    await page.locator("#report-result tbody").innerText(),
    /SJ-CBG-202611-000005/,
  );
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  );
  await page.locator("#report-filter-toggle").click();
  assert.match(await page.locator("#report-filter-caption").innerText(), /000005/);
  await page.screenshot({
    path: "test-results/reports-admin/deliveries-mobile.png",
    fullPage: true,
  });
  const reportDownload = page.waitForEvent("download");
  await page.locator("#report-excel").click();
  assert(
    fs
      .readFileSync(await (await reportDownload).path())
      .includes(Buffer.from("SJ-CBG-202611-000005")),
  );
  await page.locator("#report-filter-toggle").click();
  await page.locator("#report-delivery-query").fill("SJ tidak ada");
  assert.doesNotMatch(await page.locator("#report-result tbody").innerText(), /SJ-CBG/);
  await nav("home");
  await page.locator(".home-task-guide > summary").click();
  await page.locator('[data-open-report="batches"]').click();
  assert.equal(await page.locator("#report-picker").inputValue(), "batches");
  await page.locator("#batch-from").fill("2026-11-29");
  await page.locator("#batch-to").fill("2026-11-28");
  assert(await page.locator("#report-pdf").isDisabled());
  await page.locator("#report-picker").selectOption("expenses");
  await page.locator('#report-result [data-view="retailFunds"]').click();
  await page.locator('.shell[data-page="retailFunds"]').waitFor();
  step.phase = "bottom dock preferences";
  await page.setViewportSize({ width: 320, height: 844 });
  const dock = page.locator(".system-dock");
  const configure = dock.getByRole("button", { name: "Atur dock" });
  assert.equal(await configure.innerText(), "");
  const editor = page.getByRole("dialog", { name: "Atur dock" });
  const applyDock = editor.getByRole("button", { name: "Simpan", exact: true });
  const switchSpace = async (space) => {
    await openSidebar(page);
    await page.locator(`[data-workspace="${space}"]`).click();
    if (await page.locator('.shell[data-mobile-open="true"]').count())
      await page.locator("#pos-sidebar [data-sidebar-toggle]").click();
  };
  const scan = dock.getByRole("button", { name: "Pindai barang" });
  const bounds = await scan.boundingBox();
  assert(Math.abs(bounds.x + bounds.width / 2 - 160) < 2);
  assert(bounds.y + bounds.height <= 844);
  const lookup = page.getByRole("dialog", { name: "Pindai barang" });
  await page.evaluate((bits) => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 500;
        canvas.height = 160;
        const ctx = canvas.getContext("2d");
        const media = canvas.captureStream(12);
        const [track] = media.getVideoTracks();
        window.lookupTestTrack = track;
        const paint = () => {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, 500, 160);
          ctx.fillStyle = "black";
          [...bits].forEach((bit, i) => {
            if (bit === "1") ctx.fillRect(60 + i * 4, 18, 4, 124);
          });
        };
        paint();
        const timer = setInterval(() => {
          if (track.readyState === "ended") clearInterval(timer);
          else paint();
        }, 80);
        return media;
      },
    });
  }, "10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101");
  await scan.click();
  await lookup.getByRole("heading", { name: item.name }).waitFor({ timeout: 12000 });
  assert.equal(await lookup.getByLabel("Barcode atau SKU").inputValue(), item.barcode);
  assert.equal(await page.evaluate(() => window.lookupTestTrack.readyState), "ended");
  await page.evaluate(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    }),
  );
  await lookup.getByRole("button", { name: "Pindai lagi" }).click();
  await lookup.getByText(/Akses kamera belum diizinkan/).waitFor();
  const codeInput = lookup.getByLabel("Barcode atau SKU");
  await codeInput.fill("barang-tidak-dikenal");
  await codeInput.press("Enter");
  await lookup.getByText(/Barang tidak ditemukan/).waitFor();
  await codeInput.fill(fruit.sku);
  await lookup.getByRole("button", { name: "Cari", exact: true }).click();
  await lookup.getByRole("heading", { name: fruit.name }).waitFor();
  await lookup.getByRole("button", { name: "Tutup", exact: true }).click();
  assert(await page.locator('.shell[data-page="retailFunds"]').isVisible());
  // Android can resolve camera permission after the dialog has already closed.
  await page.evaluate(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () =>
        new Promise((resolve) => {
          window.resolveLookupCamera = () => {
            const media = document.createElement("canvas").captureStream();
            window.lookupTestTrack = media.getVideoTracks()[0];
            resolve(media);
          };
        }),
    }),
  );
  await scan.click();
  await lookup.getByText("Menyiapkan kamera…").waitFor();
  await lookup.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.evaluate(() => window.resolveLookupCamera());
  await page.waitForFunction(() => window.lookupTestTrack.readyState === "ended");
  await configure.click();
  await editor.locator('input[value="supplierNotes"]').check();
  await applyDock.click();
  await dock.locator('[data-view="supplierNotes"]').click();
  await page.locator('.shell[data-page="supplierNotes"]').waitFor();
  await configure.click();
  for (const input of await editor.locator('input[name="shortcut"]').all())
    await input.check();
  await applyDock.click();
  assert(
    await dock
      .locator("[data-dock-right]")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  );
  const lastShortcut = dock.locator(".dock-pages [data-view]").last();
  const lastView = await lastShortcut.getAttribute("data-view");
  await lastShortcut.click();
  await page.locator(`.shell[data-page="${lastView}"]`).waitFor();
  assert(
    await lastShortcut.evaluate((button) => {
      const icon = button.getBoundingClientRect();
      const track = button.parentElement.getBoundingClientRect();
      return icon.left >= track.left - 1 && icon.right <= track.right + 1;
    }),
  );
  assert(
    await configure.evaluate(
      (button) => button.getBoundingClientRect().right <= innerWidth,
    ),
  );
  await switchSpace("store");
  await nav("home");
  await openSidebar(page);
  await page.locator("#active-store").selectOption(origin.id);
  if (await page.locator('.shell[data-mobile-open="true"]').count())
    await page.locator("#pos-sidebar [data-sidebar-toggle]").click();
  await shortcuts.waitFor();
  assert.match(await depositCard.innerText(), /Omzet hari ini/);
  await depositCard.getByRole("button", { name: "Setor omzet", exact: true }).click();
  const depositDialog = page.locator("dialog.cash-deposit-dialog[open]");
  await depositDialog.waitFor();
  assert.match(await depositDialog.locator(".deposit-balance").innerText(), /250\.000/);
  assert.equal(
    await depositDialog.locator('[name="amount"]').getAttribute("max"),
    "450000",
  );
  assert(await depositDialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  await depositDialog.getByRole("button", { name: "Batal", exact: true }).click();
  await nav("cutting");
  await page.locator('[data-cut-form] [name="tableNo"]').fill("Meja 8");
  await configure.click();
  assert.equal(await editor.locator('input[value="retailFunds"]').count(), 0);
  for (const input of await editor.locator('input[name="shortcut"]').all())
    await input.uncheck();
  await editor.locator('input[value="cutting"]').check();
  await applyDock.click();
  assert.equal(
    await page.locator('[data-cut-form] [name="tableNo"]').inputValue(),
    "Meja 8",
  );
  assert.equal(await dock.locator("[data-view]").count(), 1);
  assert.equal(
    await dock.locator('[aria-current="page"]').getAttribute("data-view"),
    "cutting",
  );
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
  );
  assert(
    await page.evaluate(
      () =>
        document.querySelector(".page-foot").getBoundingClientRect().bottom <=
        document.querySelector(".system-dock").getBoundingClientRect().top,
    ),
  );
  await page.reload();
  await dock.locator('[data-view="cutting"]').waitFor();
  await configure.click();
  await editor.locator('input[value="cutting"]').uncheck();
  await editor.getByRole("button", { name: "Batal", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  assert.equal(await dock.locator("[data-view]").count(), 1);
  await configure.click();
  await editor.locator('input[value="cutting"]').uncheck();
  await applyDock.click();
  assert.equal(await dock.locator("[data-view]").count(), 0);
  await configure.click();
  await editor.locator('input[value="orders"]').check();
  await applyDock.click();
  await switchSpace("backoffice");
  await dock.locator('[data-view="supplierNotes"]').waitFor();
  const dialog = page.locator("dialog[open]");
  const assertDialogFits = async (view, width) => {
    const dimensions = await dialog.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const controls = el.querySelectorAll(
        "button, h2, h3, p, dd, input, select, fieldset, .table-wrap, .field",
      );
      return {
        width: el.clientWidth,
        content: el.scrollWidth,
        inside: [...controls]
          .filter((node) => node.getClientRects().length)
          .every((node) => {
            const box = node.getBoundingClientRect();
            return box.left >= rect.left - 1 && box.right <= rect.right + 1;
          }),
      };
    });
    assert(
      dimensions.content <= dimensions.width + 1 && dimensions.inside,
      `${view} dialog at ${width}px: ${JSON.stringify(dimensions)}`,
    );
  };
  for (const [width, theme] of [
    [320, "light"],
    [390, "dark"],
    [768, "light"],
    [1280, "dark"],
  ]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page.locator("[data-theme-toggle]").click();
    await page.setViewportSize({ width, height: 844 });
    for (const view of [
      "supplierNotes",
      "transfers",
      "retailFunds",
      "recipes",
      "products",
    ]) {
      step = { ...step, phase: "back office", theme, width, view };
      await nav(view);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => {
        const fits = (el) => el.scrollWidth <= el.clientWidth + 1;
        const content = document.querySelector(".workspace-content");
        const toolbar = content.querySelector(".supply-hero .toolbar, .filter-toolbar");
        return {
          fits: fits(document.documentElement) && fits(content),
          actionHeights: [
            ...content.querySelectorAll(
              ".supply-hero button, .intro-actions button, [data-pt-expense]",
            ),
          ].map((el) => el.getBoundingClientRect().height),
          tablesFit: [...content.querySelectorAll(".table-wrap")].every(fits),
          toolsSpanPanel:
            !toolbar ||
            Math.abs(
              toolbar.getBoundingClientRect().width -
                (toolbar.parentElement.clientWidth -
                  parseFloat(getComputedStyle(toolbar.parentElement).paddingLeft) -
                  parseFloat(getComputedStyle(toolbar.parentElement).paddingRight)),
            ) < 2,
          dockAtBottom:
            Math.abs(
              document.querySelector("#pos-main > .system-dock").getBoundingClientRect()
                .bottom - innerHeight,
            ) < 2,
          dockClearance:
            parseFloat(getComputedStyle(content).paddingBottom) >=
            document.querySelector(".system-dock").offsetHeight,
        };
      });
      assert(geometry.fits, `${view} overflows at ${width}px`);
      assert(
        geometry.dockAtBottom && geometry.dockClearance,
        "Dock fits below content at " + width,
      );
      assert(geometry.actionHeights.every((h) => h >= 44));
      if (width <= 540 && geometry.actionHeights.length > 1)
        assert(
          Math.max(...geometry.actionHeights) - Math.min(...geometry.actionHeights) < 1,
        );
      if (width <= 540) {
        assert(geometry.toolsSpanPanel, `${view} controls shrink at ${width}px`);
        assert(
          geometry.tablesFit,
          `${view} table requires sideways scrolling at ${width}px`,
        );
      }
      if (view === "supplierNotes") {
        await page.locator("[data-note-new]").click();
        await assertSaveFooter(dialog);
        assert(
          await dialog.getByLabel("Nomor nota supplier").evaluate((el) => el.readOnly),
        );
        assert.equal(
          await dialog.locator('[data-source="camera"]').getAttribute("capture"),
          "environment",
        );
        await assertDialogFits(view, width);
        if (width === 390) {
          const png = await page.evaluate(() =>
            document.createElement("canvas").toDataURL(),
          );
          const upload = dialog.locator('[data-source="gallery"]');
          await upload.setInputFiles({
            name: "bukan-foto.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("nota"),
          });
          await dialog.getByText("Pilih foto JPG, PNG, atau WebP").waitFor();
          await dialog.getByRole("button", { name: "Hapus foto" }).click();
          await dialog.locator('[name="receivingBranch"]').selectOption(origin.id);
          await dialog.locator("[data-note-product]").selectOption(fruit.id);
          await dialog.locator("[data-note-cost]").fill("300000");
          await dialog.locator("[data-note-kg]").fill("2");
          await dialog.locator("[data-note-pieces]").fill("1");
          const file = page.waitForEvent("filechooser");
          await dialog.getByRole("button", { name: "Pilih foto" }).click();
          await (
            await file
          ).setFiles({
            name: "nota.png",
            mimeType: "image/png",
            buffer: Buffer.from(png.split(",")[1], "base64"),
          });
          await dialog.getByAltText("Pratinjau bukti foto nota").waitFor();
          await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
          const createdRow = page.locator("tr").filter({ hasText: "NS-202611-000042" });
          await createdRow.locator("[data-note-open]").click();
          await dialog.getByRole("button", { name: "Lihat foto nota" }).click();
          const proof = dialog.getByAltText("Bukti foto nota supplier");
          await proof.waitFor();
          assert.equal(await proof.getAttribute("src"), png);
          await assertDialogFits(view, width);
          await dialog.locator(".modal-head .close").click();
        } else {
          await dialog.locator(".modal-actions .close").click();
        }
        await page.locator('[data-note-open="receipt"]').click();
        await assertDialogFits(view, width);
        const comparisons = dialog.locator(".receipt-comparison tbody tr");
        assert.match(await comparisons.first().innerText(), /150 pcs/);
        assert.match(await comparisons.last().innerText(), /2 kg/);
        assert(await dialog.locator("[data-note-pay=invoice]").isVisible());
        assert(await dialog.locator("[data-note-pay=shipping]").isVisible());
        if (width <= 768) {
          for (const wrapper of await dialog.locator(".table-wrap").all())
            assert(await wrapper.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
        }
        for (const selector of ["[data-note-pay=invoice]", "[data-expected-edit]"]) {
          await dialog.locator(selector).click();
          await assertSaveFooter(dialog);
          await assertDialogFits(view, width);
          await dialog.locator(".modal-head .close").click();
          await page.locator('[data-note-open="receipt"]').click();
        }
        await dialog.locator("[data-receiving-view]").click();
        await dialog.locator("[data-receiving-session]").waitFor();
        await assertDialogFits(view, width);
        await dialog.locator(".modal-head .close").click();
      }
      if (view === "retailFunds" || view === "recipes") {
        await page
          .locator(view === "recipes" ? "#new-recipe" : "[data-pt-expense]")
          .click();
        await assertDialogFits(view, width);
        await dialog.locator(".modal-head .close").click();
      }
      if (view === "transfers") {
        await page.locator('[data-branch-note="note"]').click();
        await assertDialogFits(view, width);
        await dialog.locator(".modal-head .close").click();
        await page.locator("[data-transfer-search]").fill("tidak cocok");
        assert.equal(await page.locator("[data-transfer]").count(), 0);
        await page.locator("[data-transfer-search]").fill("SJ-CBG");
        await page.locator("[data-transfer]").click();
        await assertDialogFits(view, width);
        await page.locator("dialog[open] .modal-head button").click();
      }
      if (view === "products") {
        const toggle = page.locator(".inv-filter-toggle");
        if (
          (await toggle.isVisible()) &&
          (await toggle.getAttribute("aria-expanded")) === "false"
        )
          await toggle.click();
        await page.locator("[data-inv-view=grid]").click();
        assert(
          await page
            .locator(".inv-results")
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        const cardActions = await page.locator(".inv-catalog-card").evaluateAll((cards) =>
          cards.map((card) => ({
            row: card.offsetTop,
            bottom: card.querySelector("summary button").getBoundingClientRect().bottom,
          })),
        );
        assert(cardActions.length >= 2);
        for (const [i, action] of cardActions.entries()) {
          if (action.row === cardActions[i - 1]?.row)
            assert(
              Math.abs(action.bottom - cardActions[i - 1].bottom) < 1,
              `Misaligned product actions at ${width}px`,
            );
        }
        await page.locator("[data-inv-reset]").click();
        if (await toggle.isVisible()) {
          await toggle.click();
          assert(!(await page.locator("#catalog-filter").isVisible()));
          assert(await page.locator(".inv-search input").isVisible());
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  fs.writeFileSync(path.join(output, "layouts.json"), JSON.stringify(layouts, null, 2));
  console.log(
    `PASS UI audit: ${views.length} menus × 8 viewport steps × 2 themes, aligned action buttons, breakpoint round trips, product/receipt dialogs, session reload, unique module URLs, supplier note, receiving, payment, correction, transfer, expense and recipe dialogs, and 5 back-office layouts at 320/390/768/1280px.`,
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
