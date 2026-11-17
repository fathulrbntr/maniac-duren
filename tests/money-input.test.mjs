import assert from "node:assert/strict";
import { formatMoneyInput, parseMoneyInput } from "../pos/money-input.mjs";
for (const [raw, display] of [
  ["", ""],
  ["1000", "1.000"],
  ["1000000", "1.000.000"],
  ["1250000.50", "1.250.000,50"],
  ["0", "0"],
  ["85000.5", "85.000,5"],
]) {
  assert.equal(formatMoneyInput(raw), display);
  assert.equal(parseMoneyInput(display), raw);
}
assert.throws(() => parseMoneyInput("Rp satu juta"));
console.log("PASS monetary grouping and raw numeric round trip");

for (const [raw, formatted, parsed] of [
  ["000150000", "150.000", "150000"],
  ["0000", "0", "0"],
  ["0000.125", "0,125", "0.125"],
  ["-0001250.50", "-1.250,50", "-1250.50"],
  ["14561656.565", "14.561.656,565", "14561656.565"],
  [1e-7, "0,0000001", "0.0000001"],
]) {
  assert.equal(formatMoneyInput(raw), formatted);
  assert.equal(parseMoneyInput(formatted), parsed);
}
