import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID as id } from "node:crypto";
import { chromium } from "playwright";
import { openSidebar } from "./helpers/browser-sidebar.mjs";
import { warehouseDatabase } from "./helpers/warehouse-db.mjs";
const db = await warehouseDatabase(),
  root = process.cwd();
await db.exec(fs.readFileSync("database/supplier-notes-112.sql", "utf8"));
await db.exec(fs.readFileSync("database/warehouse-workflow-114.sql", "utf8"));
for (const patch of [
  "transfer-receive-119",
  "supplier-stock-122",
  "branch-sale-prices-123",
])
  await db.exec(fs.readFileSync("database/" + patch + ".sql", "utf8"));
const otherStore = id();
await db.query("insert into public.md_pos_stores(id,name) values($1,'Jababeka uji')", [
  otherStore,
]);
const owner = id(),
  warehouseUser = id(),
  cashier = id(),
  waitress = id(),
  cutter = id(),
  store = id(),
  supplier = id();
const wh = (
  await db.query("select id from public.md_pos_stores where location_type='warehouse'")
).rows[0].id;
const product = (
  await db.query("select id from public.md_pos_products where sku='MD-MONTHONG-BUAH'")
).rows[0].id;
await db.query(
  "insert into public.md_pos_stores(id,name) values($1,'Maniac Duren Depok')",
  [store],
);
for (const [user, role, st] of [
  [owner, "owner", store],
  [warehouseUser, "warehouse", wh],
  [cashier, "cashier", store],
  [waitress, "waitress", store],
  [cutter, "cutter", store],
]) {
  await db.query("insert into auth.users values($1,$2)", [user, user + "@fixture.local"]);
  await db.query("insert into public.md_pos_staff values($1)", [user]);
  await db.query(
    "insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)",
    [user, role, [st]],
  );
}
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier Uji')", [
  supplier,
]);
await db.query("update public.md_pos_products set barcode='0001' where id=$1", [product]);
const invoke = async (action, payload) =>
  (
    await db.query("select public.pos_warehouse_mutate($1,$2::jsonb) s", [
      action,
      JSON.stringify(payload),
    ])
  ).rows[0].s;
const plan = {
  id: id(),
  storeId: wh,
  supplierId: supplier,
  date: new Date().toISOString().slice(0, 10),
  invoiceNo: "SUP-BROWSER",
  shippingCost: 20000,
  lines: [
    { productId: product, purchaseCost: 200000, expectedKg: 10, expectedPieces: 5 },
  ],
};
await invoke("receipt_plan_save", plan);
await invoke("transfer_price_save", {
  id: id(),
  productId: product,
  unit: "kg",
  price: 65000,
});
const code = (n) => "9201131126" + String(n).padStart(6, "0") + "0001002000";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const users = { owner, warehouse: warehouseUser, cashier, waitress, cutter };
  await page.route("**/*", async (r) => {
    const u = new URL(r.request().url()),
      json = (x) => r.fulfill({ json: x });
    if (u.pathname === "/api/pos-config")
      return json({ configured: true, url: "https://test.invalid", key: "fixture" });
    if (u.pathname === "/api/pos-login") {
      const actor = users[r.request().postDataJSON().identifier];
      return json({
        access_token: actor,
        refresh_token: actor,
        expires_in: 3600,
        user: { id: actor },
      });
    }
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const actor = r.request().headers().authorization?.replace("Bearer ", "");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      const p = r.request().postDataJSON(),
        rpc = u.pathname.split("/").at(-1);
      try {
        let result;
        if (rpc === "pos_read")
          result = (await db.query("select public.pos_read() s")).rows[0].s;
        else if (rpc === "pos_warehouse_mutate")
          result = await invoke(p.action, p.payload);
        else if (rpc === "pos_receive_shipment")
          result = (
            await db.query("select public.pos_receive_shipment($1::jsonb) s", [
              JSON.stringify(p.payload),
            ])
          ).rows[0].s;
        else if (rpc === "pos_fruit_history")
          result = (await db.query("select public.pos_fruit_history($1) s", [p.code]))
            .rows[0].s;
        else if (rpc === "pos_product_photos") result = [];
        else if (rpc === "pos_store_logo") result = { logo: null };
        else throw Error("Unexpected RPC " + rpc);
        return json(result);
      } catch (e) {
        return r.fulfill({
          status: 400,
          json: { message: e.message, code: e.code || "P0001" },
        });
      }
    }
    const file = path.join(
      root,
      u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname,
    );
    if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({
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
  const login = async (role) => {
    await page.goto("https://test.invalid/pos/");
    // Navigation can finish while the saved session is still being restored.
    await page.locator("#login-form, #pos-main").waitFor({ state: "visible" });
    if (await page.locator("#pos-main").count()) {
      await openSidebar(page);
      await page.locator("#logout").click();
    }
    await page.locator("[name=identifier]").fill(role);
    await page.locator("[name=password]").fill("fixture");
    await page.locator("#login-form [type=submit]").click();
    await openSidebar(page);
  };
  const nav = async (name) => {
    await openSidebar(page);
    const b = page.locator(`#pos-navigation [data-view="${name}"]`);
    const group = b.locator("xpath=ancestor::details");
    if ((await group.getAttribute("open")) === null)
      await group.locator("summary").click();
    await b.click();
  };

  await login("warehouse");
  await nav("supplierNotes");
  await page.locator("[data-session-open]").click();
  assert(!/Rp|Modal|Pembayaran/.test(await page.locator("dialog[open]").innerText()));
  const scanner = page.locator("[data-session-code]");
  const feedback = page.locator("dialog[open] #form-error");
  const savedCodes = page.locator("[data-receiving-barcodes] code");
  await scanner.fill("8991102026352");
  await scanner.press("Enter");
  await feedback.filter({ hasText: "Gunakan barcode tracking 26 digit" }).waitFor();
  const scanBox = await scanner.boundingBox();
  const messageBox = await feedback.boundingBox();
  const helpBox = await page.locator("[data-session-detail] .muted").boundingBox();
  assert(messageBox.y >= scanBox.y + scanBox.height);
  assert(messageBox.y + messageBox.height <= helpBox.y + 1);
  assert.equal(await savedCodes.count(), 0);
  const newestFirst = [];
  for (const n of [2, 3, 1]) {
    await scanner.fill(code(n));
    if (n === 3) await page.locator("[data-session-scan]").click();
    else await scanner.press("Enter");
    await feedback.filter({ hasText: `Barcode ${code(n)} sudah tersimpan.` }).waitFor();
    newestFirst.unshift(code(n));
    assert(
      (await page.locator("[data-receiving-session] .notice").innerText()).includes(
        `${newestFirst.length} butir tersimpan`,
      ),
    );
    assert.deepEqual(await savedCodes.allTextContents(), newestFirst);
    assert.equal(await scanner.evaluate((el) => document.activeElement === el), true);
  }
  await page.locator("[data-session-pause]").click();
  await page.locator("[data-session-resume]").waitFor();
  await page.reload();
  await page.locator("#pos-main").waitFor();
  await nav("supplierNotes");
  await page.locator("[data-session-open]").click();
  await page
    .locator("[data-receiving-barcodes] code")
    .filter({ hasText: code(3) })
    .waitFor({ state: "visible" });
  assert.deepEqual(await savedCodes.allTextContents(), newestFirst);
  await page.locator("[data-session-resume]").click();
  await page.locator("[data-session-finish]").click();
  await page.locator("[data-session-code]").waitFor({ state: "detached" });
  await page.locator("dialog[open] [type=submit]").click();
  await login("owner");
  await openSidebar(page);
  await page.locator("[data-workspace=backoffice]").click();
  await nav("pricing");
  await page.getByRole("heading", { name: "Harga Jual", exact: true }).waitFor();
  const outlet = page.locator("[data-retail-store]");
  await outlet.selectOption(store);
  const priceButton = page.locator(`[data-edit-retail="${product}"]`);
  const priceRow = priceButton.locator("xpath=ancestor::tr");
  await priceButton.click();
  const editor = page.locator("dialog[open]");
  await editor.locator('[name="priceKg"]').fill("107000");
  await editor.locator('[name="pricePiece"]').fill("163000");
  await editor.getByRole("button", { name: "Simpan harga" }).click();
  await priceRow.filter({ hasText: "Khusus cabang" }).waitFor();
  assert.match(await priceRow.innerText(), /107\.000/);
  await outlet.selectOption(otherStore);
  await priceRow.filter({ hasText: "Master Barang" }).waitFor();
  await outlet.selectOption(store);
  await priceRow.filter({ hasText: "Khusus cabang" }).waitFor();
  await nav("supplierNotes");
  await page.locator("[data-note-open]").click();
  assert.match(await page.locator(".receipt-comparison").innerText(), /40%/);
  assert.equal(await page.locator("[data-receipt-reopen]").count(), 1);
  await page.locator("dialog[open] [type=submit]").click();
  await nav("transfers");
  await page.locator("[data-outbound-new]").click();
  await page.locator("[name=kind]").selectOption("wholesale");
  await page.locator("[name=buyerName]").fill("Pembeli Uji");
  await page.locator("[name=carrier]").fill("Kurir");
  await page.locator("[data-rate-product]").selectOption(product);
  await page.locator("[data-rate-price]").fill("90000");
  await page.locator("[name=paymentMode]").selectOption("pending");
  await page.locator("dialog[open] [type=submit]").click();
  await page.locator("[data-outbound-detail]").waitFor();
  await page.locator("dialog[open] [type=submit]").click();
  await login("warehouse");
  await nav("transfers");
  await page.locator("[data-outbound-open]").click();
  assert(!/Rp|Harga khusus/.test(await page.locator("dialog[open]").innerText()));
  await page.locator("[data-outbound-code]").fill(code(1));
  await page.locator("[data-outbound-code]").press("Enter");
  await page.waitForFunction(() =>
    document.querySelector("[data-outbound-detail]")?.textContent.includes("1 butir"),
  );
  await page.locator("[data-outbound-ready]").click();
  await page.locator("[data-outbound-code]").waitFor({ state: "detached" });
  await page.locator("dialog[open] [type=submit]").click();
  await login("owner");
  await openSidebar(page);
  await page.locator("[data-workspace=backoffice]").click();
  await nav("transfers");
  await page.locator("[data-outbound-open]").click();
  await page.locator("[data-outbound-issue]").click();
  await page.locator("dialog[open] [type=submit]").click();
  await page.locator("[data-outbound-pay]").waitFor();
  for (const theme of ["light", "dark"])
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      assert(
        await page
          .locator("dialog[open]")
          .evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
      );
    }
  await page.locator("dialog[open] [type=submit]").click();
  await login("warehouse");
  await nav("transfers");
  await page.locator("[data-outbound-open]").click();
  await page.locator("[data-outbound-dispatch]").click();
  await page.locator("[data-outbound-dispatch]").waitFor({ state: "detached" });
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.md_pos_sales where wholesale_order_id is not null and paid=0",
      )
    ).rows[0].n,
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS workflow browser + real SQL: persistent receiving after reload, privacy, variance, BO pricing, wholesale invoice and barcode dispatch, 360/390/1440 and dark/light.",
  );
} finally {
  await browser.close();
  await db.close();
}
