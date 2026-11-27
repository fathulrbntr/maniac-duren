import { escape as e } from "./core.mjs";
import { readyBarcodeInput } from "./barcode-scanner.mjs";
import { readDeviceSettings } from "./device-settings.mjs";

export function fruitSaleDialog({ name, products, scanProduct, modal, onScan, onClose }) {
  const dialog = modal(
    "Penjualan buah",
    `<h3 class="fruit-sale-heading">${e(name)}</h3>
    <label class="field">Nomor barcode buah<input name="barcode" type="text" inputmode="numeric" maxlength="256" autocomplete="off" spellcheck="false" placeholder="Scan atau ketik nomor barcode" aria-describedby="form-error" required></label>`,
    "Tambah ke pesanan",
  );
  dialog.classList.add("fruit-sale-modal");
  const field = dialog.querySelector('[name="barcode"]'),
    error = dialog.querySelector("#form-error");
  error.setAttribute("role", "alert");
  let added = false;
  function submit() {
    if (added || !dialog.hasAttribute("open")) return;
    try {
      const raw = field.value.trim(),
        settings = readDeviceSettings();
      // A cashier can type the printed digits without a scanner's prefix or suffix.
      const scan = scanProduct(
        raw,
        !settings.scanner.enabled || /^(?:92\d{24}|21\d{11})$/.test(raw) ? {} : settings,
      );
      if (!scan.scale) throw Error("Gunakan barcode pada label buah.");
      if (!products.some((p) => p.id === scan.product.id))
        throw Error(`Barcode milik ${scan.product.name}. Scan barcode untuk ${name}.`);
      onScan(scan);
      added = true;
      dialog.close();
    } catch (err) {
      error.textContent = err.message;
      readyBarcodeInput(field);
    }
  }
  dialog.querySelector("form").onsubmit = (ev) => {
    ev.preventDefault();
    submit();
  };
  field.addEventListener("keydown", (ev) => {
    if (
      ev.key !== "Enter" &&
      !(
        ev.key === "Tab" &&
        field.value &&
        !ev.shiftKey &&
        readDeviceSettings().scanner.terminator === "Tab"
      )
    )
      return;
    ev.preventDefault();
    if (!ev.repeat && !ev.isComposing && !ev.ctrlKey && !ev.altKey && !ev.metaKey)
      submit();
  });
  field.addEventListener("input", () => {
    error.textContent = "";
  });
  for (const event of ["input", "change"])
    dialog.addEventListener(event, () => (dialog.dataset.dirty = "false"));
  dialog.addEventListener("close", () => onClose?.(added));
  readyBarcodeInput(field);
  return dialog;
}
