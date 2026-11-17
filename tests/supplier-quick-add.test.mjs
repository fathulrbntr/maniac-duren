import assert from "node:assert/strict";
import { Node, makeModal } from "./variant-dom.mjs";
import { supplierDialog, bindSupplierSelect } from "../pos/supplier-ui.mjs";
Object.defineProperties(Node.prototype, {
  elements: {
    get() {
      return new Proxy(
        { namedItem: (name) => this.querySelector(`[name="${name}"]`) },
        { get: (t, k) => (k in t ? t[k] : this.querySelector(`[name="${k}"]`)) },
      );
    },
  },
  isConnected: {
    get() {
      return !!this.closest("body");
    },
  },
  open: {
    get() {
      return this.hasAttribute("open");
    },
  },
});
const body = new Node("body"),
  adapter = makeModal(),
  calls = [];
let state = {
    access: { master: true },
    suppliers: [{ id: "existing", name: "Supplier lama" }],
  },
  fail = false,
  release;
const ctx = {
  getState: () => state,
  toast() {},
  modal(title, html, submit) {
    const d = adapter.modal(title, html, submit);
    body.append(d);
    d.showModal();
    return d;
  },
  async mutate(action, payload, options) {
    calls.push({ action, payload, options });
    if (fail) throw Error("Koneksi terputus");
    if (release) await new Promise((resolve) => (release = resolve));
    state = { ...state, suppliers: [...state.suppliers, { ...payload }] };
    return true;
  },
};
const parent = ctx.modal(
  "Nota",
  '<select name="supplierId"><option value="existing">Supplier lama</option></select><input name="invoiceNo" value="NOTA-0001"><input name="shippingCost" value="150000"><div data-note-lines><input data-note-cost value="100000000"></div>',
  "Simpan",
);
const select = parent.querySelector("select");
bindSupplierSelect(select, ctx);
bindSupplierSelect(select, ctx);
assert.equal(select.options.filter((o) => o.value === "__new_supplier__").length, 1);
const choose = async (value) => {
  select.value = value;
  for (const fn of select.listeners.change) await fn({ stopImmediatePropagation() {} });
};
await choose("__new_supplier__");
assert.equal(select.value, "existing");
assert(parent.open);
adapter.latest.close();
assert.equal(select.value, "existing");
await choose("__new_supplier__");
const child = adapter.latest,
  form = child.querySelector("form");
form.elements.name.value = "Supplier <img src=x> & Baru";
form.elements.phone.value = "0812345";
form.elements.address.value = "Depok";
fail = true;
await form.fire("submit");
assert.match(child.querySelector("#form-error").textContent, /Koneksi/);
assert(child.open);
assert.equal(select.value, "existing");
fail = false;
release = true;
const first = form.fire("submit");
await form.fire("submit");
assert.equal(calls.length, 2, "double submit while saving must be ignored");
release();
await first;
assert.equal(
  calls[0].payload.id,
  calls[1].payload.id,
  "retry preserves supplier identity",
);
assert.equal(calls[1].action, "master");
assert.equal(calls[1].options.throwOnError, true);
assert.equal(select.value, calls[1].payload.id);
assert.equal(calls[1].payload.phone, "0812345");
assert.equal(parent.querySelector('[name="invoiceNo"]').value, "NOTA-0001");
assert.equal(parent.querySelector('[name="shippingCost"]').value, "150000");
assert.equal(parent.querySelector("[data-note-cost]").value, "100000000");
assert.equal(select.querySelectorAll("img,script").length, 0);
assert(parent.open);
const empty = ctx
  .modal("Nota kosong", '<select name="supplierId" required></select>', "Simpan")
  .querySelector("select");
bindSupplierSelect(empty, ctx);
assert.equal(empty.value, "");
assert.equal(empty.options.length, 2);
assert.equal(empty.checkValidity(), false);
state = { ...state, access: { master: false } };
const restricted = new Node("select");
bindSupplierSelect(restricted, ctx);
assert.equal(restricted.options.length, 0);
assert.equal(supplierDialog(ctx), undefined);
console.log(
  "PASS supplier quick-add: cancel/failure preserve draft, retry identity, double-submit guard, escaped names, first supplier and access control.",
);
