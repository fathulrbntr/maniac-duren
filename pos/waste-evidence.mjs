import { preparePhoto, photoValue } from "./product-details.mjs?v=9";
import { escape as e } from "./core.mjs?v=9";
export const proofLabels = {
  reject: "Bukti Reject",
  processed: "Bukti Setelah Diolah",
  durpas500: "Bukti Durpas 500 gr",
  durpas1000: "Bukti Durpas 1 kg",
  coral: "Bukti Coral",
  daging: "Bukti Daging Durian",
};
export function evidenceValues(value = {}) {
  return Object.fromEntries(Object.keys(proofLabels).map((key) => [key, photoValue(value?.[key])]));
}
export function bindEvidence(form, keys = ["reject", "processed"]) {
  const inputs = [...form.querySelectorAll("[data-proof-file]")];
  keys = [...new Set([...keys, ...inputs.map((input) => input.dataset.proofFile)])];
  const evidence = Object.fromEntries(keys.map((key) => [key, ""])),
    versions = Object.fromEntries(keys.map((key) => [key, 0])),
    pending = new Set();
  const initialStatus = Object.fromEntries(inputs.map((input) => {
    const key = input.dataset.proofFile;
    return [key, form.querySelector(`[data-proof-status="${key}"]`).textContent];
  }));
  inputs.forEach((input) => (input.onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const key = input.dataset.proofFile,
      version = ++versions[key],
      ticket = {};
    pending.add(ticket);
    const status = form.querySelector(`[data-proof-status="${key}"]`);
    status.textContent = "Memproses foto…";
    try {
      const result = await preparePhoto(file, "evidence");
      if (version === versions[key]) {
        evidence[key] = result.photo;
        status.textContent = "Foto siap disimpan · " + Math.ceil(result.bytes / 1024) + " KB";
      }
    } catch (err) {
      if (version === versions[key]) status.textContent = err.message;
    } finally {
      pending.delete(ticket);
      if (version === versions[key]) ev.target.value = "";
    }
  }));
  return {
    values: () => evidenceValues(evidence),
    busy: () => pending.size > 0,
    reset: () => {
      for (const key of keys) { versions[key]++; evidence[key] = ""; }
      for (const input of inputs) {
        input.value = "";
        const key = input.dataset.proofFile;
        form.querySelector(`[data-proof-status="${key}"]`).textContent = initialStatus[key];
      }
    },
  };
}
export function evidenceButton(run, key = "") {
  const exists = key ? run.evidence?.[key] || (run.hasEvidence && key === "reject") : run.hasEvidence || Object.values(run.evidence || {}).some(Boolean);
  return exists
    ? `<button type="button" class="small" data-waste-evidence="${e(run.id)}" data-waste-evidence-key="${e(key)}">Lihat bukti</button>`
    : "";
}
export function bindEvidenceHistory(state, ctx) {
  document.querySelectorAll("[data-waste-evidence]").forEach(
    (b) =>
      (b.onclick = async () => {
        const run = (state.wasteRuns || []).find(
          (x) => x.id === b.dataset.wasteEvidence,
        );
        if (!run) return;
        if (!run.evidence && ctx.loadEvidence) {
          b.disabled = true;
          try {
            run.evidence = await ctx.loadEvidence(run.id);
          } catch (error) {
            ctx.toast(error.message);
            return;
          } finally {
            b.disabled = false;
          }
        }
        const key = b.dataset.wasteEvidenceKey;
        const visibleProofs = key ? { [key]: proofLabels[key] || key } : proofLabels;
        const d = ctx.modal(
          "Bukti foto waste",
          `<p>${e(run.sourceName)} · ${e(run.date)}</p><div class="waste-proof-grid">${Object.entries(
            visibleProofs,
          )
            .map(
              ([key, label]) =>
                `<div><h3>${label}</h3>${run.evidence?.[key] ? `<img src="${e(run.evidence[key])}" alt="${label}">` : "<p>Belum ada foto.</p>"}</div>`,
            )
            .join("")}</div>`,
          "Tutup",
        );
        d.classList.add("product-modal");
        d.querySelector(".modal-actions .close").hidden = true;
        d.querySelector("form").onsubmit = (ev) => {
          ev.preventDefault();
          d.close();
        };
      }),
  );
}
