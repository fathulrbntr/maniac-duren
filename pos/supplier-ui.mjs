import { escape as e, id } from "./core.mjs";

const addValue = "__new_supplier__";
const allowed = (s) => !s.access || !!s.access.master;

export function supplierDialog(ctx, onSaved = () => {}) {
  if (!allowed(ctx.getState())) return;
  const requestId = id();
  const d = ctx.modal(
    "Tambah supplier baru",
    '<label class="field">Nama supplier<input name="name" required maxlength="100" autocomplete="organization"></label><label class="field">Nomor telepon (opsional)<input name="phone" type="tel" maxlength="40" placeholder="08… atau +62…"></label><label class="field">Alamat supplier (opsional)<textarea name="address" maxlength="300" rows="3"></textarea></label>',
  );
  d.dataset.supplierEditor = "";
  const form = d.querySelector("form"),
    button = form.querySelector("[type=submit]");
  let saving = false;
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving || !form.reportValidity()) return;
    const supplier = {
      id: requestId,
      name: form.elements.namedItem("name").value.trim(),
      phone: form.elements.phone.value.trim(),
      address: form.elements.address.value.trim(),
    };
    if (!supplier.name) {
      d.querySelector("#form-error").textContent = "Nama supplier wajib diisi.";
      return;
    }
    saving = true;
    button.disabled = true;
    try {
      await ctx.mutate(
        "master",
        { ...supplier, kind: "suppliers" },
        { throwOnError: true },
      );
      d.dataset.dirty = "false";
      d.close();
      onSaved(ctx.getState().suppliers.find((x) => x.id === requestId) || supplier);
      ctx.toast("Supplier tersimpan");
    } catch (err) {
      d.querySelector("#form-error").textContent = err.message;
    } finally {
      saving = false;
      button.disabled = false;
    }
  };
  return d;
}

// Called by the shared modal factory. The parent form remains mounted while editing.
export function bindSupplierSelect(select, ctx) {
  if (!select || select.dataset.supplierQuickAdd || !allowed(ctx.getState())) return;
  select.dataset.supplierQuickAdd = "true";
  if (!select.options.length)
    select.insertAdjacentHTML("beforeend", '<option value="">Pilih supplier</option>');
  select.insertAdjacentHTML(
    "beforeend",
    `<option value="${addValue}">+ Tambah supplier baru</option>`,
  );
  let previous = select.value,
    child;
  const remember = () => {
    if (select.value !== addValue) previous = select.value;
  };
  select.addEventListener("focus", remember);
  select.addEventListener("pointerdown", remember);
  select.addEventListener("keydown", remember);
  select.addEventListener(
    "change",
    (event) => {
      if (select.value !== addValue) {
        previous = select.value;
        return;
      }
      event.stopImmediatePropagation();
      select.value = previous;
      if (child?.open) return;
      child = supplierDialog(ctx, (supplier) => {
        if (!select.isConnected) return;
        if (![...select.options].some((x) => x.value === supplier.id))
          select.insertAdjacentHTML(
            "beforeend",
            `<option value="${e(supplier.id)}">${e(supplier.name)}</option>`,
          );
        select.value = supplier.id;
        previous = supplier.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      child?.addEventListener("close", () => {
        child = null;
        if (select.isConnected) select.focus();
      });
    },
    true,
  );
  select.closest("dialog")?.addEventListener("close", () => child?.close());
}
