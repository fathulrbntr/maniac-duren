import {coralPanel} from "./batch-ui.mjs?v=21";
import { mayLeave } from "./navigation.mjs?v=9";
import {
  bindEvidence,
  evidenceButton,
  bindEvidenceHistory,
} from "./waste-evidence.mjs?v=9";
import { escape as e, num, today, id } from "./core.mjs?v=9";
import { isLegacyStock } from "./catalog.mjs?v=9";
import { wasteOutputs, wastePlan } from "./waste.mjs?v=21";
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
  return `<div class="intro"><div><h2>Pengolahan reject</h2><p class="muted">Catat durian yang diproses dan timbang hasil olahannya.</p></div><button id="waste-refresh">Perbarui stok</button></div>
 <section class="panel"><form id="waste-form"><div class="form-grid">${field(
   "Tanggal barang masuk",
   `<input name="receivedDate" type="date" required max="${today()}">`,
 )}${field("Produk durian asal", '<select name="sourceProductId" required><option value="">Pilih tanggal masuk dulu</option></select>')}${field("Batch / supplier asal", '<select name="sourceLotId" required><option value="">Pilih produk dulu</option></select>')}${field("Tanggal pengolahan", `<input name="date" type="date" value="${today()}" readonly aria-readonly="true" required>`)}</div><div class="form-grid waste-input-row">${field("Berat durian yang diolah (kg)", '<input name="kg" type="number" min="0.000001" step="0.000001" required>')}${field("Jumlah durian (butir)", '<input name="pieces" type="number" min="1" step="1" required>')}</div><div class="form-grid waste-proof-row">${field("Nama pengolah", `<input name="processedBy" value="${e(s.me?.name||'')}" required maxlength="100" readonly>`)}${field("Foto reject sebelum diolah", '<input data-proof-file="reject" type="file" accept="image/*,.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.avif,.heic,.heif,.tif,.tiff"><small data-proof-status="reject">Wajib · maksimal 2 MB setelah kompresi</small>')}</div><p id="waste-source-stock" class="muted"></p>
 <div class="form-grid">${field("Kulit dibuang (kg)",'<input name="shellKg" type="number" min="0" step="0.000001" value="0" required>')}${field("Isi rusak / waste (kg)",'<input name="spoiledKg" type="number" min="0" step="0.000001" value="0" required>')}${field("Biaya tambahan bersama (Rp)",'<input name="additionalCost" type="number" min="0" step="any" value="0" required>')}</div><h3>Hasil olahan</h3><p class="muted">Durian kupas dihitung per kemasan; coral dalam kg. Keduanya masih berbiji. Catat keduanya dalam satu proses. Semua hasil 0 hanya untuk buah yang tidak dapat dimanfaatkan.</p>
 <div class="waste-output-grid">${wasteOutputs
   .map((spec) => {
     const products = s.products.filter(
         (p) =>
           p.stockUnit === spec.unit &&
           ["prep", "finished", "direct"].includes(p.itemType),
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
     return `<fieldset class="waste-output waste-output-card"><legend>${spec.label}</legend><select class="sr-only" name="${spec.key}_productId" aria-label="Produk ${spec.label}"><option value="">Pilih produk ${spec.unit}</option>${choices(products, preferred?.id)}</select>${field(spec.unit === "pcs" ? "Jumlah (pcs)" : "Jumlah (kg)", `<input name="${spec.key}_qty" type="number" min="0" step="${spec.unit === "pcs" ? "1" : "0.000001"}" value="0" required>`)}${field("Biaya kemasan khusus (Rp)", `<input name="${spec.key}_additionalCost" type="number" min="0" step="any" value="0" required>`)}${field("Bukti (input foto)", `<input data-proof-file="${spec.key}" type="file" accept="image/*,.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.avif,.heic,.heif,.tif,.tiff"><small data-proof-status="${spec.key}">Opsional · maksimal 2 MB setelah kompresi</small>`)}</fieldset>`;
   })
   .join("")}</div>
 <p class="muted">Produk hasil diambil otomatis dari master: Durpas 500 gr, Durpas 1 kg, dan Coral.</p><button type="button" data-view="products">Buka Product</button>
 ${field("Alasan reject / catatan", '<input name="reason" required maxlength="300" placeholder="Contoh: sortasi durian untuk olahan">')}<div class="callout" id="waste-preview">Pilih batch dan isi berat durian.</div><p id="waste-error" class="error" role="alert"></p><button class="primary" type="submit" ${store ? "" : "disabled"}>Simpan pengolahan & hasil</button></form></section>
 <section class="panel"><h3>Riwayat pengolahan reject · store aktif</h3><div class="table-wrap"><table><thead><tr><th>TANGGAL OLAH</th><th>ASAL / PENGOLAH</th><th>HASIL OLAHAN</th><th>BUKTI FOTO</th><th>STATUS / ACTION</th></tr></thead><tbody>${runs.flatMap((r) => (r.outputs?.length ? r.outputs : [{ key: "total", name: "Waste total", qty: 0, unit: "kg" }]).map((o, i) => `<tr><td>${e(r.date)}<small class="catalog-meta">${e(r.id.slice(0, 8))}</small></td><td>${e(r.receivedDate)}<br><b>${e(r.sourceName)}</b><br>${e(r.supplierName)}<small class="catalog-meta">Pengolah: ${e(r.processedBy || "—")}</small></td><td>${e(o.name)}<br>${o.key === "total" ? `${num(r.kg)} kg input · ${num(r.lossKg)} kg waste` : `${num(o.qty)} ${e(o.unit)}`}</td><td>${o.key === "total" ? evidenceButton(r, "reject") : evidenceButton(r, o.key)}</td><td>${i === 0 && r.voided ? `<b>Dihapus / dibatalkan</b><small class="catalog-meta">${e(r.voidReason)}</small>` : i === 0 ? `<button class="small danger" data-waste-void="${e(r.id)}">Hapus</button>` : ""}</td></tr>`)).join("") || '<tr><td colspan="5" class="empty">Belum ada pencatatan waste.</td></tr>'}</tbody></table></div></section>${coralPanel(s,store)}`;
}
export function bindWaste(view, s, store, ctx) {
  if (view !== "waste") return;
  const f = document.querySelector("#waste-form"),
    c = (n) => f.elements.namedItem(n),
    requestId = id(),
    lotIds = Object.fromEntries(wasteOutputs.map((x) => [x.key, id()]));
  const proof = bindEvidence(f, wasteOutputs.map((spec) => spec.key));
  bindEvidenceHistory(s, ctx);
  const sourceLots = () =>
    s.lots.filter(
      (l) =>
        l.storeId === store &&
        l.date === c("receivedDate").value &&
        l.quality === "reject" && l.costFinalized !== false && l.kg > 0 &&
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
    shellKg:c("shellKg").value,spoiledKg:c("spoiledKg").value,additionalCost:c("additionalCost").value,
    pieces: c("pieces").value,
    reason: c("reason").value,
    evidence: proof.values(),
    outputs: wasteOutputs.map((spec) => ({
      key: spec.key,
      productId: c(spec.key + "_productId").value,
      qty: c(spec.key + "_qty").value,
      additionalCost:c(spec.key+"_additionalCost").value,
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
      `Hasil berbiji: ${num(weight)} kg · Kulit: ${num(Number(c("shellKg").value))} kg · Waste isi: ${num(Number(c("spoiledKg").value))} kg · Selisih belum dicatat: ${num(kg-weight-Number(c("shellKg").value)-Number(c("spoiledKg").value))} kg.`;
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
          name: `${s.suppliers.find((p) => p.id === l.supplierId)?.name || "Supplier"} · ${l.invoiceNo || l.id.slice(0, 8)} · ${num(l.kg)} kg / ${l.pieces} butir`,
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
      if(s.batchTrackingVersion!==21)throw Error("Jalankan migration 021 terlebih dahulu.");
      const plan=wastePlan(s, p);
      if(Math.abs(plan.kg-plan.outputKg-Number(p.shellKg)-Number(p.spoiledKg))>0.000001)throw Error("Input harus sama dengan hasil + kulit + isi rusak.");
      if(plan.outputKg>0&&(!plan.outputs.some(o=>o.key==='coral')||!plan.outputs.some(o=>o.key!=='coral')))throw Error("Catat durian kupas dan coral sekaligus.");
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
          "Pengolahan tersimpan; modal dan asal batch diteruskan ke hasil",
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
