import { mayLeave } from "./navigation.mjs?v=7";
import {
  evidenceForm,
  bindEvidence,
  evidenceButton,
  bindEvidenceHistory,
} from "./waste-evidence.mjs?v=7";
import { escape as e, num, today, id } from "./core.mjs?v=7";
import { isLegacyStock } from "./catalog.mjs?v=7";
import { wasteOutputs, wastePlan } from "./waste.mjs?v=7";
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
   `<select name="receivedDate" required><option value="">Pilih tanggal barang masuk</option>${[
     ...new Set(
       s.lots
         .filter((l) => l.storeId === store && l.kg > 0 && l.pieces > 0)
         .map((l) => l.date),
     ),
   ]
     .sort()
     .reverse()
     .map((date) => `<option value="${e(date)}">${e(date)}</option>`)
     .join("")}</select>`,
 )}${field("Produk durian asal", '<select name="sourceProductId" required><option value="">Pilih tanggal masuk dulu</option></select>')}${field("Batch / supplier asal", '<select name="sourceLotId" required><option value="">Pilih produk dulu</option></select>')}${field("Tanggal waste", `<input name="date" type="date" value="${today()}" max="${today()}" required>`)}${field("Berat durian yang diolah (kg)", '<input name="kg" type="number" min="0.000001" step="0.000001" required>')}${field("Jumlah durian (butir)", '<input name="pieces" type="number" min="1" step="1" required>')}</div><p id="waste-source-stock" class="muted"></p>
 <h3>Hasil olahan</h3><p class="muted">Durpas dihitung per kemasan. Coral ditimbang dalam kg. Isi 0 untuk hasil yang tidak dibuat. Semua hasil 0 berarti waste total.</p>
 ${wasteOutputs
   .map((spec) => {
     const products = s.products.filter(
         (p) =>
           p.stockUnit === spec.unit &&
           ["finished", "direct"].includes(p.itemType),
       ),
       preferred = products.find(
         (p) =>
           p.name.toLowerCase().replaceAll(" ", "") ===
           (spec.key === "durpas500"
             ? "durpas500gr"
             : spec.key === "durpas1000"
               ? "durpas1kg"
               : "coral"),
       );
     return `<fieldset class="waste-output"><legend>${spec.label}</legend><div class="form-grid">${field("Produk hasil di master", `<select name="${spec.key}_productId"><option value="">Pilih produk ${spec.unit}</option>${choices(products, preferred?.id)}</select>`)}${field(spec.unit === "pcs" ? "Jumlah kemasan (pcs)" : "Berat hasil (kg)", `<input name="${spec.key}_qty" type="number" min="0" step="${spec.unit === "pcs" ? "1" : "0.000001"}" value="0" required>`)}${field("Kedaluwarsa hasil (opsional)", `<input name="${spec.key}_expiry" type="date">`)}</div></fieldset>`;
   })
   .join("")}
 <p class="muted">Belum ada produk hasil? Daftarkan Durpas 500 gr dan Durpas 1 kg sebagai Produk jadi bersatuan Pcs, serta Coral sebagai Produk jadi bersatuan Kilogram.</p><button type="button" data-view="products">Buka Product</button>
 ${evidenceForm()}${field("Alasan waste / catatan", '<input name="reason" required maxlength="300" placeholder="Contoh: sortasi durian untuk olahan">')}<div class="callout" id="waste-preview">Pilih batch dan isi berat durian.</div><p id="waste-error" class="error" role="alert"></p><button class="primary" type="submit" ${store ? "" : "disabled"}>Simpan waste & masukkan stok olahan</button></form></section>
 <section class="panel"><h3>Riwayat waste · store aktif</h3><div class="table-wrap"><table><thead><tr><th>TANGGAL WASTE</th><th>TANGGAL MASUK / ASAL</th><th>DURIAN DIOLAH</th><th>HASIL OLAHAN</th><th>SISA / SUSUT</th><th>STATUS / ACTION</th></tr></thead><tbody>${runs.map((r) => `<tr><td>${e(r.date)}${evidenceButton(r)}<small class="catalog-meta">${e(r.id.slice(0, 8))}</small></td><td>${e(r.receivedDate)}<br><b>${e(r.sourceName)}</b><br>${e(r.supplierName)}<small class="catalog-meta">Batch ${e(r.sourceLotId.slice(0, 8))}</small></td><td>${num(r.kg)} kg / ${num(r.pieces)} butir<br><small>${e(r.reason)}</small></td><td>${r.outputs.map((o) => `${e(o.name)}: ${num(o.qty)} ${e(o.unit)}`).join("<br>") || "Tidak ada hasil olahan"}</td><td>${num(r.lossKg)} kg</td><td>${r.voided ? `<b>Dihapus / dibatalkan</b><small class="catalog-meta">${e(r.voidReason)}</small><small class="catalog-meta">${e(r.voidedAt ? new Date(r.voidedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "")}</small>` : `<button class="small danger" data-waste-void="${e(r.id)}">Hapus</button>`}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Belum ada pencatatan waste.</td></tr>'}</tbody></table></div></section>`;
}
export function bindWaste(view, s, store, ctx) {
  if (view !== "waste") return;
  const f = document.querySelector("#waste-form"),
    c = (n) => f.elements.namedItem(n),
    requestId = id(),
    lotIds = Object.fromEntries(wasteOutputs.map((x) => [x.key, id()]));
  const proof = bindEvidence(f);
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
    date: c("date").value,
    sourceLotId: c("sourceLotId").value,
    kg: c("kg").value,
    pieces: c("pieces").value,
    reason: c("reason").value,
    evidence: proof.values(),
    outputs: wasteOutputs.map((spec) => ({
      key: spec.key,
      productId: c(spec.key + "_productId").value,
      qty: c(spec.key + "_qty").value,
      expiry: c(spec.key + "_expiry").value,
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
  function batches() {
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
    preview();
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
  f.addEventListener("input", preview);
  f.addEventListener("change", preview);
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
