import assert from "node:assert/strict";
import { Node } from "./variant-dom.mjs";
import { bindBarcodeInput, prepareBarcodeInput } from "../pos/barcode-scanner.mjs";
import { defaultDeviceSettings } from "../pos/device-settings.mjs";
const input = new Node("input"),
  settings = defaultDeviceSettings(),
  scanned = [],
  errors = [];
let release;
const scan = bindBarcodeInput(input, {
  getSettings: () => settings,
  onScan: async (code) => {
    if (code === "BAD") throw Error("Tidak dikenal");
    if (code === "PENDING") await new Promise((resolve) => (release = resolve));
    scanned.push(code);
  },
  onError: (error) => errors.push(error),
});
const key = async (key, extra = {}) => {
  const ev = { key, preventDefault() {}, ...extra };
  for (const fn of input.listeners.keydown) await fn(ev);
};
input.value = "BAD";
await key("Enter");
assert.equal(errors[0], "Tidak dikenal");
assert.equal(input.value, "BAD");
assert.equal(input.textSelected, true, "failed label selected for replacement");
input.value = "000013";
await key("Enter");
assert.equal(input.value, "");
assert.equal(Node.activeElement, input);
input.value = "000014";
await scan();
assert.equal(input.value, "");
assert.deepEqual(scanned, ["000013", "000014"]);
input.value = "000015";
await key("Enter", { repeat: true });
await key("Enter", { isComposing: true });
assert.equal(scanned.length, 2);
settings.scanner.terminator = "Tab";
await key("Tab");
assert.equal(scanned.at(-1), "000015");
input.value = "PENDING";
const pending = scan();
input.value = "000016";
release();
await pending;
assert.equal(
  input.value,
  "000016",
  "response to older scan must not clear a newer barcode",
);
await scan();
assert.equal(scanned.at(-1), "000016");
const count = input.listeners.keydown.length;
prepareBarcodeInput(input);
assert.equal(input.listeners.keydown.length, count, "binding is idempotent");
console.log(
  "PASS barcode input: leading zeroes, replacement selection, Enter/Tab, click/focus, IME/repeat and asynchronous value preservation.",
);
