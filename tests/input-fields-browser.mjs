import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === "/fixture")
      return r.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body><form id="numbers"><input name="price" type="number" min="0" step="any" value="0"><input data-note-cost type="number" min="0.01" step="any" required><input name="kg" type="number" min="0.001" max="9000000" step="0.001"><input name="pieces" type="number" min="1" step="1"><input name="barcode" value="000013"><input name="phone" type="tel" value="0812345"><input name="invoiceNo" value="0001"><input name="date" type="date" value="2026-11-17"><button type="submit">Simpan</button></form><div id="dynamic"></div><input id="scanner"><button id="scan" type="button">Scan</button><p id="scan-error"></p></body></html>',
      });
    return r.fulfill({
      body: fs.readFileSync(path.join(process.cwd(), u.pathname)),
      contentType: "text/javascript",
    });
  });
  await page.goto("https://test.invalid/fixture");
  await page.evaluate(async () => {
    const { installMoneyInputs } = await import("/pos/money-input.mjs");
    installMoneyInputs();
    document.querySelector("form").onsubmit = (ev) => ev.preventDefault();
  });
  const shown = (selector) =>
    page
      .locator(selector)
      .evaluate((el) =>
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").get.call(el),
      );
  // inputValue() reads the native DOM value in Playwright's isolated world.
  // The POS getter lives in the page world and returns the canonical numeric value.
  const rawValue = (locator) => locator.evaluate((el) => el.value);
  await page.locator("[name=price]").focus();
  await page.keyboard.type("150000");
  assert.equal(await shown("[name=price]"), "150.000");
  await page.locator("[name=price]").fill("000150000");
  assert.equal(await shown("[name=price]"), "150.000");
  assert.equal(await page.locator("[name=price]").inputValue(), "150.000");
  assert.equal(await rawValue(page.locator("[name=price]")), "150000");
  assert.equal(
    await page.locator("[name=price]").evaluate((el) => el.valueAsNumber),
    150000,
  );
  // Consecutive digits must keep grouping, never reinterpret the existing dot as a decimal.
  await page.locator("[name=price]").fill("");
  await page.keyboard.type("123456789");
  assert.equal(await shown("[name=price]"), "123.456.789");
  await page.keyboard.press("Backspace");
  assert.equal(await shown("[name=price]"), "12.345.678");
  await page.locator("[name=kg]").fill("1.456.156,565");
  assert.equal(await rawValue(page.locator("[name=kg]")), "1456156.565");
  assert.equal(await shown("[name=kg]"), "1.456.156,565");
  await page.locator("[data-note-cost]").fill("000100000000");
  assert.equal(await shown("[data-note-cost]"), "100.000.000");
  await page.locator("[name=pieces]").fill("1.251");
  assert.equal(await rawValue(page.locator("[name=pieces]")), "1251");
  await page.locator("[name=pieces]").fill("1,5");
  assert.equal(
    await page.locator("[name=pieces]").evaluate((el) => el.checkValidity()),
    false,
  );
  await page.locator("[name=pieces]").fill("1251");
  await page.locator("[name=kg]").fill("9000000,001");
  assert.equal(
    await page.locator("[name=kg]").evaluate((el) => el.checkValidity()),
    false,
  );
  await page.locator("[name=kg]").fill("0,125");
  assert.equal(
    await page.locator("[name=kg]").evaluate((el) => el.checkValidity()),
    true,
  );
  assert.deepEqual(
    await page.evaluate(() =>
      Object.fromEntries(new FormData(document.querySelector("form"))),
    ),
    {
      price: "12345678",
      kg: "0.125",
      pieces: "1251",
      barcode: "000013",
      phone: "0812345",
      invoiceNo: "0001",
      date: "2026-11-17",
    },
  );
  await page.evaluate(() => {
    document.querySelector("#dynamic").innerHTML =
      '<form id="dynamic-form"><input name="cost0" type="number" step="any" value="000125000.50"><input name="qty" type="number" min="0.001" step="0.001" value="1250.5"><input name="purchaseCost" type="number" value="1000"><input name="purchaseCost" type="number" value="2000"><fieldset disabled><input name="disabledCost" type="number" value="2500"></fieldset></form>';
  });
  assert.equal(await shown("[name=cost0]"), "125.000,50");
  assert.equal(await shown("[name=qty]"), "1.250,5");
  assert.deepEqual(
    await page.evaluate(() => [...new FormData(document.querySelector("#dynamic-form"))]),
    [
      ["cost0", "125000.50"],
      ["qty", "1250.5"],
      ["purchaseCost", "1000"],
      ["purchaseCost", "2000"],
    ],
  );
  await page.locator("[name=cost0]").fill("750000");
  await page.evaluate(() => document.querySelector("#dynamic-form").reset());
  assert.equal(await shown("[name=cost0]"), "125.000,50");
  await page.locator("[data-note-cost]").fill("");
  assert.equal(
    await page.locator("[data-note-cost]").evaluate((el) => el.checkValidity()),
    false,
  );
  await page.locator("[name=price]").fill("Rp satu juta");
  assert.equal(
    await page.locator("[name=price]").evaluate((el) => el.checkValidity()),
    false,
  );
  for (const name of ["barcode", "phone", "invoiceNo", "date"])
    assert.equal(
      await page.locator(`[name=${name}]`).getAttribute("data-money-input"),
      null,
    );

  await page.evaluate(async () => {
    const { bindBarcodeInput } = await import("/pos/barcode-scanner.mjs");
    const { defaultDeviceSettings } = await import("/pos/device-settings.mjs");
    window.scanned = [];
    window.testSettings = defaultDeviceSettings();
    const scan = bindBarcodeInput(document.querySelector("#scanner"), {
      getSettings: () => window.testSettings,
      onScan: async (code) => {
        if (code === "BAD") throw Error("Barcode tidak dikenal");
        if (code === "PENDING")
          await new Promise((resolve) => (window.finishScan = resolve));
        window.scanned.push(code);
      },
      onError: (message) => (document.querySelector("#scan-error").textContent = message),
    });
    document.querySelector("#scan").onclick = scan;
  });
  await page.locator("#scanner").focus();
  await page.keyboard.type("BAD");
  await page.keyboard.press("Enter");
  assert.match(await page.locator("#scan-error").innerText(), /tidak dikenal/);
  // Real typing, not fill(), proves replacement after an invalid scan.
  await page.keyboard.type("000013");
  await page.keyboard.press("Enter");
  await page.keyboard.type("000014");
  await page.locator("#scan").click();
  assert.equal(await page.locator("#scanner").inputValue(), "");
  assert.equal(await page.evaluate(() => document.activeElement.id), "scanner");
  assert.deepEqual(await page.evaluate(() => window.scanned), ["000013", "000014"]);
  await page.evaluate(() => (window.testSettings.scanner.terminator = "Tab"));
  await page.keyboard.type("000015");
  await page.keyboard.press("Tab");
  assert.deepEqual(await page.evaluate(() => window.scanned), [
    "000013",
    "000014",
    "000015",
  ]);
  await page.keyboard.type("PENDING");
  await page.keyboard.press("Tab");
  await page.keyboard.type("000016");
  await page.evaluate(() => window.finishScan());
  assert.equal(
    await page.locator("#scanner").inputValue(),
    "000016",
    "old async response must not erase a newer code",
  );
  await page.keyboard.press("Tab");
  assert.equal((await page.evaluate(() => window.scanned)).at(-1), "000016");
  await page.evaluate(async () => {
    const { bindSupplierSelect } = await import("/pos/supplier-ui.mjs");
    let state = { access: { master: true }, suppliers: [] };
    window.supplierCalls = [];
    window.failSupplier = false;
    const ctx = {
      getState: () => state,
      toast() {},
      async mutate(action, payload) {
        window.supplierCalls.push({ action, payload });
        if (window.failSupplier) throw Error("Koneksi terputus");
        state = { ...state, suppliers: [...state.suppliers, payload] };
        return true;
      },
      modal(title, body, label = "Simpan") {
        const d = document.createElement("dialog");
        d.innerHTML = `<h2>${title}</h2><form>${body}<p id="form-error"></p><button type="button" data-close>Batal</button><button type="submit">${label}</button></form>`;
        document.body.append(d);
        d.querySelector("[data-close]").onclick = () => d.close();
        d.addEventListener("close", () => d.remove());
        d.querySelectorAll('select[name="supplierId"]').forEach((select) =>
          bindSupplierSelect(select, ctx),
        );
        d.showModal();
        return d;
      },
    };
    const d = ctx.modal(
      "Nota",
      '<select name="supplierId" required></select><input name="invoice" value="NOTA-001"><input name="cost0" type="number" step="any" value="150000">',
    );
    d.dataset.parentNote = "";
  });
  const note = page.locator("[data-parent-note]");
  await note.locator("select").selectOption("__new_supplier__");
  await page.locator("[data-supplier-editor] [data-close]").click();
  await page.locator("[data-supplier-editor]").waitFor({ state: "detached" });
  assert.equal(await note.locator("select").inputValue(), "");
  await note.locator("select").selectOption("__new_supplier__");
  const supplier = page.locator("[data-supplier-editor]");
  await supplier.locator("[name=name]").fill("Supplier Baru");
  await supplier.locator("[name=phone]").fill("08123456");
  await supplier.locator("[name=address]").fill("Depok");
  await page.evaluate(() => (window.failSupplier = true));
  await supplier.locator("[type=submit]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-supplier-editor] #form-error")
      ?.textContent.includes("Koneksi"),
  );
  assert.equal(await note.locator("[name=invoice]").inputValue(), "NOTA-001");
  await page.evaluate(() => (window.failSupplier = false));
  await supplier.locator("[type=submit]").click();
  await supplier.waitFor({ state: "detached" });
  assert.equal(await note.locator("select option:checked").innerText(), "Supplier Baru");
  assert.equal(await note.locator("[name=cost0]").inputValue(), "150.000");
  assert.equal(await rawValue(note.locator("[name=cost0]")), "150000");
  assert.equal(await note.locator("[name=invoice]").inputValue(), "NOTA-001");
  assert.equal(
    await page.evaluate(
      () => window.supplierCalls[0].payload.id === window.supplierCalls[1].payload.id,
    ),
    true,
  );
  await note.locator("[data-close]").click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS numeric inputs: grouping, zero removal, decimals, payloads, dynamic forms, validation, reset, identifier exclusions; barcode replacement, Enter/Tab, focus and async guard.",
  );
} finally {
  await browser.close();
}
