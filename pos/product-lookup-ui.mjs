import { escape as e } from "./core.mjs";
import { lookupItem } from "./product-lookup.mjs";
import { cameraDecoder } from "./barcode-camera.mjs";
import { normalizeBarcode, prepareBarcodeInput } from "./barcode-scanner.mjs";
import { readDeviceSettings } from "./device-settings.mjs";

export function openItemLookup({ modal, getState, storeId, workspace }) {
  const d = modal(
    "Pindai barang",
    `<div class="lookup-body">
    <section class="lookup-summary" aria-live="polite"></section>
    <div class="lookup-preview" hidden><video muted playsinline></video><span aria-hidden="true"></span></div>
    <p class="lookup-status" role="status"></p>
    <button type="button" data-lookup-camera>Aktifkan kamera</button>
    <div class="field"><label for="lookup-code">Barcode atau SKU</label><div class="lookup-input"><input id="lookup-code" type="text" data-lookup-code autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="256" placeholder="Ketik atau gunakan scanner"><button type="submit" class="primary">Cari</button></div></div>
    <div class="lookup-result"></div></div>`,
  );
  d.classList.add("lookup-dialog");
  d.setAttribute("aria-label", "Pindai barang");
  d.querySelector(".modal-actions").remove();
  const input = d.querySelector("[data-lookup-code]");
  const camera = d.querySelector("[data-lookup-camera]");
  const preview = d.querySelector(".lookup-preview");
  const video = d.querySelector("video");
  const status = d.querySelector(".lookup-status");
  const summary = d.querySelector(".lookup-summary");
  const result = d.querySelector(".lookup-result");
  let stream,
    timer,
    generation = 0;
  const stop = () => {
    generation++;
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    preview.hidden = true;
    camera.disabled = false;
  };
  const clearResult = () => {
    summary.replaceChildren();
    result.replaceChildren();
  };
  const lookup = (code, fromCamera = false) => {
    stop();
    camera.textContent = "Pindai lagi";
    status.textContent = "";
    try {
      const item = lookupItem(getState(), code, storeId, workspace, {
        camera: fromCamera,
      });
      const pairs = (rows) =>
        rows
          .map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`)
          .join("");
      summary.innerHTML = `<h3>${e(item.name)}</h3>${item.highlights.length ? `<dl class="lookup-highlights">${pairs(item.highlights)}</dl>` : ""}${item.priceNotes.length ? `<p class="lookup-rates">${item.priceNotes.map((note) => `<span>${e(note)}</span>`).join("")}</p>` : ""}`;
      result.innerHTML = `<code>${e(item.code)}</code><dl>${pairs(item.rows)}</dl>`;
      d.scrollTop = 0;
    } catch (error) {
      clearResult();
      status.textContent = error.message;
    }
    if (!fromCamera && document.activeElement === input) input.select();
  };
  const start = async () => {
    stop();
    const token = generation;
    clearResult();
    status.textContent = "Menyiapkan kamera…";
    camera.disabled = true;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (token !== generation || !d.open) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = media;
      video.srcObject = media;
      preview.hidden = false;
      const decode = await cameraDecoder();
      if (token !== generation || !d.open) return;
      await video.play();
      if (token !== generation || !d.open) return;
      camera.disabled = false;
      camera.textContent = "Matikan kamera";
      status.textContent = "Sejajarkan barcode dengan garis di tengah.";
      const next = () => {
        if (token !== generation || !d.open) return;
        try {
          const code = decode(video);
          if (code) {
            input.value = code;
            lookup(code, true);
          } else timer = setTimeout(next, 200);
        } catch {
          stop();
          camera.textContent = "Coba kamera lagi";
          status.textContent =
            "Kamera tidak dapat membaca gambar. Coba lagi atau masukkan kode.";
        }
      };
      next();
    } catch (error) {
      if (token !== generation) return;
      stop();
      camera.textContent = "Coba kamera lagi";
      status.textContent =
        error.name === "NotAllowedError"
          ? "Akses kamera belum diizinkan. Izinkan kamera atau masukkan kode."
          : "Kamera tidak tersedia. Gunakan scanner atau masukkan kode.";
    }
  };
  camera.onclick = () => {
    if (!stream) return start();
    stop();
    camera.textContent = "Aktifkan kamera";
    status.textContent = "";
  };
  const search = () => {
    const raw = input.value.trim();
    const settings = readDeviceSettings();
    const { enabled, prefix, suffix } = settings.scanner;
    if (enabled && (prefix || suffix) && raw.startsWith(prefix) && raw.endsWith(suffix)) {
      try {
        return lookup(normalizeBarcode(raw, settings));
      } catch (error) {
        clearResult();
        status.textContent = error.message;
        return;
      }
    }
    lookup(raw);
  };
  prepareBarcodeInput(input);
  input.addEventListener("keydown", (event) => {
    if (
      event.key === "Tab" &&
      input.value &&
      readDeviceSettings().scanner.terminator === "Tab"
    ) {
      event.preventDefault();
      search();
    }
  });
  d.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    search();
  };
  // Typed searches are ephemeral and must not trigger the unsaved transaction guard.
  d.addEventListener("input", () => {
    d.dataset.dirty = "false";
  });
  d.addEventListener("change", () => {
    d.dataset.dirty = "false";
  });
  const suspend = () => {
    stop();
    camera.textContent = "Aktifkan kamera";
    status.textContent = "";
  };
  const onVisibility = () => {
    if (document.hidden) suspend();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", suspend);
  d.addEventListener(
    "close",
    () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", suspend);
    },
    { once: true },
  );
  if (navigator.mediaDevices?.getUserMedia) start();
  else {
    camera.hidden = true;
    status.textContent = "Kamera tidak tersedia. Gunakan scanner atau masukkan kode.";
  }
  if (window.matchMedia("(pointer: fine)").matches) input.focus();
  return d;
}
