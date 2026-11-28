import { compressPhoto } from "./photo-compression.mjs";

const accept = "image/jpeg,image/png,image/webp";
export const noteProofField = `<fieldset class="note-proof-field">
  <legend>Bukti foto nota <small>(opsional)</small></legend>
  <div class="note-proof-actions">
    <button type="button" data-pick="camera">Ambil foto</button>
    <button type="button" data-pick="gallery">Pilih foto</button>
  </div>
  <input type="file" data-source="camera" accept="${accept}" capture="environment" hidden>
  <input type="file" data-source="gallery" accept="${accept}" hidden>
  <p class="muted" data-photo-status role="status"></p>
  <img class="deposit-proof-preview" alt="Pratinjau bukti foto nota" hidden>
  <button type="button" data-clear-photo hidden>Hapus foto</button>
</fieldset>`;

export function bindNoteProofField(dialog) {
  const field = dialog.querySelector(".note-proof-field");
  const status = field.querySelector("[data-photo-status]");
  const preview = field.querySelector("img");
  const clear = field.querySelector("[data-clear-photo]");
  let task = null;
  function reset() {
    task = null;
    for (const input of field.querySelectorAll("input")) input.value = "";
    preview.hidden = clear.hidden = true;
    preview.removeAttribute("src");
    status.textContent = "";
  }
  clear.onclick = reset;
  for (const button of field.querySelectorAll("[data-pick]")) {
    const input = field.querySelector(`[data-source="${button.dataset.pick}"]`);
    button.onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      reset();
      clear.hidden = false;
      status.textContent = "Menyiapkan foto…";
      const current = compressPhoto(file, "bankReceipt");
      task = current;
      try {
        const { photo } = await current;
        if (task !== current) return;
        preview.src = photo;
        preview.hidden = false;
        status.textContent = file.name;
      } catch (error) {
        if (task === current) status.textContent = error.message;
      }
    };
  }
  // Await the current selection even when Simpan is tapped during compression.
  return async () => {
    while (task) {
      const current = task;
      try {
        const { photo } = await current;
        if (task === current) return { noteProof: photo };
      } catch (error) {
        if (task === current) throw error;
      }
    }
    return {};
  };
}

export function bindNoteProofViewer(dialog, planId, readProof) {
  const button = dialog.querySelector("[data-view-note-proof]");
  if (!button) return;
  const image = dialog.querySelector("[data-note-proof-image]");
  const status = dialog.querySelector("[data-view-proof-status]");
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = "Memuat foto…";
    try {
      const photo = await readProof(planId);
      if (!photo) throw Error("Foto nota tidak ditemukan.");
      if (!dialog.open) return;
      image.src = photo;
      image.hidden = false;
      status.textContent = "";
      button.hidden = true;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
