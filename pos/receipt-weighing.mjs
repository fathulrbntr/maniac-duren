import { escape as e, id, today, num, money } from './core.mjs?v=77';
import { isLegacyStock } from './catalog.mjs?v=77';
import { weighingTotals, shipmentTotals, validateShipment } from './receipt-shipment.mjs?v=82';
export { weighingTotals, shipmentTotals } from './receipt-shipment.mjs?v=82';

export function openWeighingReceipt(state, store, ctx) {
  const options = (kind, selected) => state[kind].map(p => `<option value="${e(p.id)}" ${p.id === selected ? 'selected' : ''}>${e(p.name)}</option>`).join('');
  const products = state.products.filter(isLegacyStock);
  if (!products.length || !state.suppliers.length || !state.stores.length) return ctx.toast('Tambahkan produk, store dan supplier terlebih dahulu.');
  const d = ctx.modal('Barang masuk', `<div class="form-grid receipt-header-fields"><label class="field">Tanggal masuk<input name="date" type="date" value="${today()}" max="${today()}" required></label><label class="field">Store<select name="storeId">${options('stores', store)}</select></label><label class="field">Supplier<select name="supplierId">${options('suppliers')}</select></label><label class="field">Nomor nota<input name="invoiceNo" placeholder="Contoh: NOTA-001" maxlength="100" required></label></div><div class="receipt-section-head"><h3>Produk dalam nota</h3><span data-product-count></span></div><div class="receipt-lines" data-receipt-lines></div><button type="button" class="receipt-add" data-add-product>+ Tambah produk</button><label class="field receipt-shipping">Ongkir bersama (Rp)<input name="shippingCost" type="number" min="0" step="any" value="0" required></label><p class="form-help">Ongkir dibagi otomatis menurut berat aktual setiap produk.</p><div data-weigh-summary class="weigh-summary receipt-total" aria-live="polite"></div><label class="field">Nomor surat jalan / catatan<input name="note" maxlength="300"></label><p class="form-help">Stok seluruh produk masuk sekaligus setelah penurunan barang dikonfirmasi selesai.</p>`, 'Penurunan selesai · masukkan ke stok');
  d.classList.add('receipt-shipment-dialog');
  const f = d.querySelector('form'), requestId = id(), error = d.querySelector('#form-error');
  const list = d.querySelector('[data-receipt-lines]'), submit = f.querySelector('[type=submit]');
  const lines = [];
  let saving = false;
  const payload = () => ({id:requestId,date:f.elements.date.value,storeId:f.elements.storeId.value,
    supplierId:f.elements.supplierId.value,invoiceNo:f.elements.invoiceNo.value.trim(),
    shippingCost:f.elements.shippingCost.value,note:f.elements.note.value.trim(),
    unloadingComplete:true,lines:structuredClone(lines)});
  const syncOptions = () => {
    const used = new Set(lines.map(line => line.productId));
    lines.forEach((line, index) => {
      const card = list.children[index], select = card.querySelector('[data-product]');
      select.innerHTML = products.map(p => `<option value="${e(p.id)}" ${p.id === line.productId ? 'selected' : used.has(p.id) ? 'disabled' : ''}>${e(p.name)}</option>`).join('');
      card.querySelector('[data-line-title]').textContent = `Produk ${index + 1}`;
      card.querySelector('[data-remove-product]').hidden = lines.length === 1;
    });
    d.querySelector('[data-product-count]').textContent = `${lines.length} produk`;
    d.querySelector('[data-add-product]').disabled = saving || lines.length >= Math.min(products.length, 50);
  };
  const update = () => {
    try {
      const t = shipmentTotals(lines, f.elements.shippingCost.value);
      lines.forEach((line, i) => {
        const x = t.items[i];
        list.children[i].querySelector('[data-line-summary]').innerHTML = `<b>${line.weighings.length} kali timbang · ${num(x.kg)} kg · ${num(x.pieces)} butir</b>${x.kg ? `<dl><div><dt>Bagian ongkir</dt><dd>${money(x.shipping)}</dd></div><div><dt>Modal / kg</dt><dd>${money(x.costKg)}</dd></div><div><dt>Modal / butir</dt><dd>${money(x.costPiece)}</dd></div></dl>` : '<p>Belum ada penimbangan.</p>'}`;
      });
      d.querySelector('[data-weigh-summary]').innerHTML = `<b>${lines.length} produk · ${num(t.kg)} kg · ${num(t.pieces)} butir</b><dl><div><dt>Total harga nota</dt><dd>${money(t.purchase)}</dd></div><div><dt>Ongkir bersama</dt><dd>${money(t.shipping)}</dd></div><div class="receipt-grand-total"><dt>Total modal</dt><dd>${money(t.total)}</dd></div></dl>`;
      submit.disabled = saving || lines.some(line => !line.weighings.length);
      error.textContent = '';
    } catch (err) { error.textContent = err.message; submit.disabled = true; }
  };
  const addLine = () => {
    if (saving || lines.length >= 50) return;
    const product = products.find(p => !lines.some(line => line.productId === p.id));
    if (!product) return;
    const line = {id:id(),productId:product.id,purchaseCost:'',weighings:[]};
    lines.push(line);
    const card = document.createElement('section'); card.className = 'receipt-product';
    card.innerHTML = `<div class="receipt-product-head"><h4 data-line-title></h4><button type="button" data-remove-product class="receipt-remove">Hapus</button></div><div class="form-grid"><label class="field">Produk<select data-product required></select></label><label class="field">Harga nota produk (Rp)<input name="purchaseCost" data-purchase type="number" min="0" step="any" required placeholder="0"></label></div><div class="receipt-product-actions"><button type="button" data-weigh-open>Catat penimbangan</button></div><div data-line-summary class="receipt-line-summary"></div>`;
    list.append(card);
    card.querySelector('[data-product]').onchange = ev => {
      const next = ev.target.value;
      if (lines.some(other => other !== line && other.productId === next)) {syncOptions();return;}
      if (line.weighings.length && !confirm('Ganti produk? Catatan timbang dan harga produk ini akan dikosongkan.')) {syncOptions();return;}
      line.productId = next; line.weighings = []; line.purchaseCost = '';
      card.querySelector('[data-purchase]').value = ''; syncOptions(); update();
    };
    card.querySelector('[data-purchase]').oninput = ev => {line.purchaseCost = ev.target.value;update();};
    card.querySelector('[data-remove-product]').onclick = () => {
      if (saving || lines.length === 1) return;
      if ((line.weighings.length || line.purchaseCost !== '') && !confirm('Hapus produk beserta harga dan catatan timbangnya dari nota ini?')) return;
      lines.splice(lines.indexOf(line), 1); card.remove(); d.dataset.dirty = 'true';syncOptions();update();
    };
    card.querySelector('[data-weigh-open]').onclick = () => openLineWeighing(line, products, d, update);
    syncOptions(); update();
    return card;
  };
  d.querySelector('[data-add-product]').onclick = () => { const card = addLine(); if (card) {d.dataset.dirty = 'true';card.querySelector('[data-product]').focus();} };
  f.elements.shippingCost.oninput = update;
  f.onsubmit = async ev => {
    ev.preventDefault(); if (saving || !f.reportValidity()) return;
    try {
      if (state.receiptShipmentVersion !== 82) throw Error('Jalankan database/receipt-shipment-082.sql lalu muat ulang POS.');
      const p = payload(), t = validateShipment(p, state);
      if (!confirm(`Penurunan barang sudah selesai?\nNota ${p.invoiceNo}\n${lines.length} produk · ${num(t.kg)} kg · ${num(t.pieces)} butir\nTotal modal ${money(t.total)}\nSeluruh produk akan dimasukkan ke stok sekaligus.`)) return;
      saving = true;
      if (await ctx.mutate('receipt_batch', p)) { d.close(); ctx.render(); ctx.toast(`Nota ${p.invoiceNo} tersimpan · ${lines.length} produk · ${num(t.kg)} kg · ${num(t.pieces)} butir`); }
    } catch (err) { error.textContent = err.message; } finally { saving = false; }
  };
  addLine();
  return d;
}

function openLineWeighing(line, products, d, update) {
  let rows = line.weighings;
    const w = document.createElement('dialog');
    w.className = 'modal weighing-dialog';
    w.innerHTML = `<div class="modal-head"><h2>Riwayat penimbangan</h2><button type="button" data-close aria-label="Tutup">×</button></div><p><b>${e(products.find(p => p.id === line.productId)?.name)}</b></p><p>Setiap baris mencatat berat dan butir dalam satu kali timbang.</p><form class="weigh-entry"><div class="form-grid"><label class="field">Berat (kg)<input name="kg" type="number" min="0.000000001" step="any" required autofocus></label><label class="field">Butir<input name="pieces" type="number" min="1" step="1" required></label></div><button class="primary" type="submit">Tambah timbang</button><button type="button" data-reset hidden>Batal edit</button><p class="error" data-error></p></form><div data-history class="table-wrap"></div><p data-total aria-live="polite"></p><div class="modal-actions"><button type="button" data-close class="primary">Selesai menghitung</button></div>`;
    document.body.append(w);
    const wf = w.querySelector('form');
    let editing = null;
    const reset = () => { editing = null; wf.reset(); wf.querySelector('[type=submit]').textContent = 'Tambah timbang'; w.querySelector('[data-reset]').hidden = true; w.querySelector('[data-error]').textContent = ''; wf.elements.kg.focus(); };
    const draw = () => {
      w.querySelector('[data-history]').innerHTML = `<table><thead><tr><th>Timbang</th><th>Berat kg</th><th>Butir</th><th>Aksi</th></tr></thead><tbody>${rows.slice().reverse().map((row, i) => `<tr><td>${rows.length - i}${row.editedAt ? '<small>Diedit</small>' : ''}</td><td>${num(row.kg)}</td><td>${num(row.pieces)}</td><td><button type="button" data-edit="${e(row.id)}">Edit</button> <button type="button" data-delete="${e(row.id)}">Hapus</button></td></tr>`).join('') || '<tr><td colspan="4">Belum ada penimbangan.</td></tr>'}</tbody></table>`;
      w.querySelector('[data-history]').scrollTop = 0;
      const t = weighingTotals(rows); w.querySelector('[data-total]').textContent = `Total ${rows.length} kali timbang: ${num(t.kg)} kg · ${num(t.pieces)} butir`;
      w.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); editing = row.id; wf.elements.kg.value = row.kg; wf.elements.pieces.value = row.pieces; wf.querySelector('[type=submit]').textContent = 'Simpan koreksi'; w.querySelector('[data-reset]').hidden = false; wf.elements.kg.focus(); });
      w.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => { if (!confirm('Hapus catatan timbang ini?')) return; rows = rows.filter(r => r.id !== b.dataset.delete); if (editing === b.dataset.delete) reset(); d.dataset.dirty = 'true'; line.weighings = rows; draw(); update(); });
    };
    wf.onsubmit = ev => {
      ev.preventDefault();
      try {
        const old = rows.find(r => r.id === editing);
        const row = { id: old?.id || id(), kg: Number(wf.elements.kg.value), pieces: Number(wf.elements.pieces.value), createdAt: old?.createdAt || new Date().toISOString(), ...(old ? { editedAt: new Date().toISOString() } : {}) };
        const next = old ? rows.map(r => r.id === old.id ? row : r) : [...rows, row];
        weighingTotals(next); rows = next; d.dataset.dirty = 'true'; reset(); line.weighings = rows; draw(); update();
      } catch (err) { w.querySelector('[data-error]').textContent = err.message; }
    };
    const close = () => { if (editing || wf.elements.kg.value || wf.elements.pieces.value) { if (!confirm('Isian timbang belum dicatat. Tutup popup?')) return; } w.close(); };
    w.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    w.oncancel = ev => { ev.preventDefault(); close(); };
    w.onclose = () => { w.remove(); update(); };
    w.querySelector('[data-reset]').onclick = reset;
    draw(); w.showModal();}

export function showWeighingHistory(lot, ctx) {
  const rows = lot.weighings || [];
  const d = ctx.modal('Riwayat timbang barang masuk', `<p>Nomor nota: <b>${e(lot.invoiceNo || "—")}</b></p><p>${num(lot.receivedKg)} kg · ${num(lot.receivedPieces)} butir</p><div class="table-wrap"><table><thead><tr><th>Timbang</th><th>Berat kg</th><th>Butir</th><th>Waktu</th></tr></thead><tbody>${rows.slice().reverse().map((r, i) => `<tr><td>${rows.length - i}${r.editedAt ? ' · dikoreksi' : ''}</td><td>${num(r.kg)}</td><td>${num(r.pieces)}</td><td>${e(new Date(r.editedAt || r.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</td></tr>`).join('') || '<tr><td colspan="4">Penerimaan lama tidak memiliki rincian timbang.</td></tr>'}</tbody></table></div>${lot.totalCost != null ? `<p>Harga barang: ${money(lot.purchaseCost)} · Ongkir: ${money(lot.shippingCost)}<br>Modal/kg: ${money(lot.totalCost / lot.receivedKg)} · Modal/butir: ${money(lot.totalCost / lot.receivedPieces)}</p>` : ''}`);
  d.querySelector('[type=submit]').hidden = true;
  d.querySelector('form').onsubmit = ev => ev.preventDefault();
}
