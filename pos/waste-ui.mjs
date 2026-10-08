import { mayLeave } from "./navigation.mjs?v=9";
import {
  bindEvidence,
  evidenceButton,
  bindEvidenceHistory,
} from "./waste-evidence.mjs?v=43";
import { escape as e, num, today, id } from "./core.mjs?v=9";
import { isLegacyStock } from "./catalog.mjs?v=9";
import { wasteOutputs, wastePlan } from "./waste.mjs?v=43";
import { wasteOutputProducts } from "./waste-products.mjs?v=43";
const field = (label, body) => `<label class="field">${label}${body}</label>`;
const choices = (rows, selected = "") =>
  rows
    .map(
      (x) =>
        `<option value="${e(x.id)}" ${x.id === selected ? "selected" : ""}>${e(x.name)}</option>`,
    )
    .join("");
export function wastePage(s, store) {
  const runs = (s.wasteRuns || [])
    .filter((x) => x.storeId === store)
    .slice()
    .reverse();
  return `<div class="intro"><div><h2>Waste & Olahan</h2><p class="muted">Catat durian yang diproses dan timbang hasil olahannya.</p></div><button id="waste-refresh">Perbarui stok</button></div>
 <section class="panel"><form id="waste-form"><div class="form-grid">${field(
   "Tanggal barang masuk",
   `<input name="receivedDate" type="date" required max="${today()}">`,
 )}${field("Produk durian asal", '<select name="sourceProductId" required><option value="">Pilih tanggal masuk dulu</option></select>')}${field("Batch / supplier asal", '<select name="sourceLotId" required><option value="">Pilih produk dulu</option></select>')}${field("Tanggal waste", `<input name="date" type="date" value="${today()}" readonly aria-readonly="true" required>`)}</div><div class="form-grid waste-input-row">${field("Berat durian yang diolah (kg)", '<input name="kg" type="number" min="0.000001" step="0.000001" required>')}${field("Jumlah durian (butir)", '<input name="pieces" type="number" min="1" step="1" required>')}</div><div class="form-grid waste-proof-row">${field("Nama pengolah", '<input name="processedBy" required maxlength="100" placeholder="Nama staf yang mengolah">')}${field("Foto reject sebelum diolah", '<input data-proof-file="reject" type="file" accept="image/jpeg,image/png,image/webp"><small data-proof-status="reject">Wajib · maksimal 2 MB setelah kompresi</small>')}</div><p id="waste-source-stock" class="muted"></p>
 <h3>Hasil olahan</h3><p class="muted">Durpas dihitung per kemasan. Coral ditimbang dalam kg. Isi 0 untuk hasil yang tidak dibuat. Semua hasil 0 berarti waste total.</p>
 <div class="waste-output-grid">${wasteOutputs
   .map((spec) => {
     return `<fieldset class="waste-output waste-output-card"><legend>${spec.label}</legend><input type="hidden" name="${spec.key}_productId">${field("Produk hasil otomatis", `<output name="${spec.key}_productName" aria-label="Produk ${spec.label}">Pilih durian asal terlebih dahulu</output>`)}${field(spec.unit === "pcs" ? "Jumlah (pcs)" : "Jumlah (kg)", `<input name="${spec.key}_qty" type="number" min="0" step="${spec.unit === "pcs" ? "1" : "0.000001"}" value="0" required>`)}${field("Bukti (input foto)", `<input data-proof-file="${spec.key}" type="file" accept="image/jpeg,image/png,image/webp"><small data-proof-status="${spec.key}">Wajib jika hasil lebih dari 0</small>`)}</fieldset>`;
   })
   .join("")}
 <p class="muted" id="waste-products-status" aria-live="polite">Pilih durian asal. Durpas dan coral akan mengikuti jenis durian tersebut.</p><button type="button" data-view="products">Buka Master Barang</button>
 ${field("Alasan waste / catatan", '<input name="reason" required maxlength="300" placeholder="Contoh: sortasi durian untuk olahan">')}<div class="callout" id="waste-preview">Pilih batch dan isi berat durian.</div><p id="waste-error" class="error" role="alert"></p><button class="primary" type="submit" ${store ? "" : "disabled"}>Simpan waste & masukkan stok olahan</button></form></section>
 <section class="panel"><h3>Riwayat waste · store aktif</h3><div class="table-wrap"><table><thead><tr><th>TANGGAL WASTE</th><th>ASAL / PENGOLAH</th><th>HASIL OLAHAN</th><th>BUKTI FOTO</th><th>STATUS / ACTION</th></tr></thead><tbody>${runs.flatMap((r) => (r.outputs?.length ? r.outputs : [{ key: "total", name: "Waste total", qty: 0, unit: "kg" }]).map((o, i) => `<tr><td>${e(r.date)}<small class="catalog-meta">${e(r.id.slice(0, 8))}</small></td><td>${e(r.receivedDate)}<br><b>${e(r.sourceName)}</b><br>${e(r.supplierName)}<small class="catalog-meta">Pengolah: ${e(r.processedBy || "—")}</small></td><td>${e(o.name)}<br>${o.key === "total" ? `${num(r.kg)} kg input · ${num(r.lossKg)} kg waste` : `${num(o.qty)} ${e(o.unit)}`}</td><td>${o.key === "total" ? evidenceButton(r, "reject") : evidenceButton(r, o.key)}</td><td>${i === 0 && r.voided ? `<b>Dihapus / dibatalkan</b><small class="catalog-meta">${e(r.voidReason)}</small>` : i === 0 ? `<button class="small danger" data-waste-void="${e(r.id)}">Hapus</button>` : ""}</td></tr>`)).join("") || '<tr><td colspan="5" class="empty">Belum ada pencatatan waste.</td></tr>'}</tbody></table></div></section>`;
}
export function bindWaste(view, s, store, ctx) {
  if (view !== "waste") return;
  const f = document.querySelector("#waste-form"),
    c = (n) => f.elements.namedItem(n),
    requestId = id(),
    lotIds = Object.fromEntries(wasteOutputs.map((x) => [x.key, id()]));
  const proof = bindEvidence(f, ["reject", ...wasteOutputs.map((spec) => spec.key)]);
  let selectedSource = "", selectedLot = "";
  bindEvidenceHistory(s, ctx);
  const sourceLots = () =>
    s.lots.filter(
      (l) =>
        l.storeId === store &&
        l.date === c("receivedDate").value &&
        l.kg > 0 &&
        l.pieces > 0 &&
        isLegacyStock(s.products.find((p) => p.id === l.productId)),
    );
  const payload = () => ({
    id: requestId,
    storeId: store,
    receivedDate: c("receivedDate").value,
    date: today(),
    processedBy: c("processedBy").value,
    sourceLotId: c("sourceLotId").value,
    kg: c("kg").value,
    pieces: c("pieces").value,
    reason: c("reason").value,
    evidence: proof.values(),
    outputs: wasteOutputs.map((spec) => ({
      key: spec.key,
      productId: c(spec.key + "_productId").value,
      qty: c(spec.key + "_qty").value,
      expiry: "",
      lotId: lotIds[spec.key],
    })),
  });
  function preview() {
    const lot = s.lots.find((l) => l.id === c("sourceLotId").value);
    document.querySelector("#waste-source-stock").textContent = lot
      ? `Stok batch tersedia: ${num(lot.kg)} kg / ${num(lot.pieces)} butir`
      : "Tidak ada batch tersedia yang dipilih.";
    const weight = wasteOutputs.reduce(
        (sum, x) => sum + Number(c(x.key + "_qty").value || 0) * x.weight,
        0,
      ),
      kg = Number(c("kg").value || 0);
    document.querySelector("#waste-preview").textContent =
      `Total hasil olahan: ${num(weight)} kg · Sisa / susut: ${num(kg - weight)} kg (termasuk kulit, biji, atau bagian tidak terpakai).`;
  }
  function selectOutputs() {
    const sourceId = c("sourceProductId").value;
    if (selectedSource && selectedSource !== sourceId) resetBatchInputs();
    selectedSource = sourceId;
    const outputs = wasteOutputProducts(s, sourceId);
    for (const output of outputs) {
      c(output.key + "_productId").value = output.product?.id || "";
      c(output.key + "_productName").value = output.product?.name || (sourceId ? "Belum tersedia" : "Pilih durian asal terlebih dahulu");
      c(output.key + "_productName").title = output.error;
    }
    const message = document.querySelector("#waste-products-status");
    const errors = outputs.filter((o) => o.error).map((o) => o.error);
    message.textContent = !sourceId ? "Pilih durian asal. Durpas dan coral akan mengikuti jenis durian tersebut."
      : errors.length ? errors.join(" ")
      : `Hasil mengikuti ${s.products.find((p) => p.id === sourceId).name}. Fresh dan Nitrogen dicatat terpisah.`;
    message.classList.toggle("error", !!sourceId && errors.length > 0);
  }
  function resetBatchInputs() {
    for (const spec of wasteOutputs) c(spec.key + "_qty").value = "0";
    c("kg").value = "";
    c("pieces").value = "";
    proof.reset();
  }
  function selectLot() {
    const current = c("sourceLotId").value;
    if (selectedLot && selectedLot !== current) resetBatchInputs();
    selectedLot = current;
    preview();
  }
  function batches() {
    selectOutputs();
    const rows = sourceLots().filter(
      (l) => l.productId === c("sourceProductId").value,
    );
    c("sourceLotId").innerHTML =
      '<option value="">Pilih batch / supplier</option>' +
      choices(
        rows.map((l) => ({
          id: l.id,
          name: `${s.suppliers.find((p) => p.id === l.supplierId)?.name || "Supplier"} · ${l.id.slice(0, 8)} · ${num(l.kg)} kg / ${l.pieces} butir`,
        })),
      );
    if (rows.length === 1) c("sourceLotId").value = rows[0].id;
    selectLot();
  }
  c("receivedDate").onchange = () => {
    const ids = new Set(sourceLots().map((l) => l.productId));
    const products = s.products.filter((p) => ids.has(p.id));
    c("sourceProductId").innerHTML =
      '<option value="">Pilih durian</option>' + choices(products);
    if (products.length === 1) c("sourceProductId").value = products[0].id;
    c("date").min = c("receivedDate").value;
    batches();
  };
  c("sourceProductId").onchange = batches;
  c("sourceLotId").onchange = selectLot;
  f.addEventListener("input", preview);
  f.addEventListener("change", preview);
  selectOutputs();
  preview();
  document.querySelector("#waste-refresh").onclick = async () => {
    if (!mayLeave(false)) return;
    try {
      await ctx.refresh();
      ctx.render();
    } catch (err) {
      ctx.toast(err.message);
    }
  };
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const error = document.querySelector("#waste-error");
    error.textContent = "";
    if (proof.busy()) {
      error.textContent = "Tunggu sampai foto selesai diproses.";
      return;
    }
    try {
      const p = payload();
      wastePlan(s, p);
      if (
        p.outputs.every((o) => Number(o.qty) === 0) &&
        !confirm(
          "Semua hasil olahan 0. Catat sebagai waste total tanpa stok hasil?",
        )
      )
        return;
      if (await ctx.mutate("waste_process", p)) {
        ctx.render();
        ctx.toast(
          "Waste tersimpan; stok durian berkurang dan hasil olahan bertambah",
        );
      }
    } catch (err) {
      error.textContent = err.message;
    }
  };
  document.querySelectorAll("[data-waste-void]").forEach(
    (b) =>
      (b.onclick = () => {
        const d = ctx.modal(
          "Hapus pencatatan waste",
          `<p>Anda yakin ingin menghapus pencatatan waste ini?</p><p>Stok durian dikembalikan, stok hasil ditarik, dan riwayat tetap terlihat. Hasil olahan harus belum digunakan.</p>${field("Alasan hapus", '<input name="reason" maxlength="300" required>')}`,
          "Ya, hapus",
        );
        d.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          if (
            await ctx.mutate("waste_void", {
              id: id(),
              wasteId: b.dataset.wasteVoid,
              reason: new FormData(ev.currentTarget).get("reason"),
            })
          ) {
            d.close();
            ctx.render();
            ctx.toast("Waste dibatalkan; riwayat tetap tersimpan");
          }
        };
      }),
  );
}
