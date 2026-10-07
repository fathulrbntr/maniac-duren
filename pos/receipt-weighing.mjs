import { escape as e, id, today, num, money } from './core.mjs?v=10';
import { isLegacyStock } from './catalog.mjs?v=9';

export function weighingTotals(rows, purchase = 0, shipping = 0) {
  if (!Array.isArray(rows) || rows.length > 1000) throw Error('Maksimal 1.000 penimbangan');
  let kg = 0, pieces = 0;
  for (const row of rows) {
    const weight = Number(row.kg), count = Number(row.pieces);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 9000000000 || !Number.isSafeInteger(count) || count <= 0) throw Error('Isi berat lebih dari 0 dan butir berupa bilangan bulat');
    kg += weight; pieces += count;
  }
  kg = Number(kg.toFixed(9));
  if (kg > 9000000000 || pieces > 9000000000) throw Error('Jumlah terlalu besar');
  purchase = Number(purchase); shipping = Number(shipping);
  if (!Number.isFinite(purchase) || purchase < 0 || !Number.isFinite(shipping) || shipping < 0) throw Error('Biaya tidak valid');
  const total = purchase + shipping;
  return { kg, pieces, purchase, shipping, total, purchaseKg: kg ? purchase / kg : 0, purchasePiece: pieces ? purchase / pieces : 0, costKg: kg ? total / kg : 0, costPiece: pieces ? total / pieces : 0 };
}

export function openWeighingReceipt(state, store, ctx) {
  const options = (kind, selected) => state[kind].map(p => `<option value="${e(p.id)}" ${p.id === selected ? 'selected' : ''}>${e(p.name)}</option>`).join('');
  const products = state.products.filter(isLegacyStock);
  if (!products.length || !state.suppliers.length || !state.stores.length) return ctx.toast('Tambahkan produk, store dan supplier terlebih dahulu.');
  const d = ctx.modal('Barang masuk', `<div class="form-grid"><label class="field">Tanggal masuk<input name="date" type="date" value="${today()}" required></label><label class="field">Store<select name="storeId">${options('stores', store)}</select></label><label class="field">Produk<select name="productId">${products.map(p => `<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}</select></label><label class="field">Supplier<select name="supplierId">${options('suppliers')}</select></label><label class="field">Total harga barang masuk (Rp)<input name="purchaseCost" type="number" min="0" step="any" required></label><label class="field">Ongkir (Rp)<input name="shippingCost" type="number" min="0" step="any" value="0" required></label></div><button type="button" class="primary" data-weigh-open>Catat penimbangan</button><div data-weigh-summary class="weigh-summary"></div><label class="field">Nomor surat jalan / catatan<input name="note" maxlength="300"></label><p class="form-help">Catatan timbang belum menambah stok. Stok masuk sekaligus setelah penurunan barang dikonfirmasi selesai.</p>`, 'Penurunan selesai · masukkan ke stok');
  const f = d.querySelector('form'), requestId = id();
  let rows = [], saving = false;
  const error = d.querySelector('#form-error');
  const totals = () => weighingTotals(rows, f.elements.purchaseCost.value, f.elements.shippingCost.value);
  const update = () => {
    try {
      const t = totals();
      d.querySelector('[data-weigh-summary]').innerHTML = `<b>${rows.length} kali timbang · ${num(t.kg)} kg · ${num(t.pieces)} butir</b><div class="form-grid"><p>Harga barang / kg<br><strong>${money(t.purchaseKg)}</strong></p><p>Harga barang / butir<br><strong>${money(t.purchasePiece)}</strong></p><p>Modal termasuk ongkir / kg<br><strong>${money(t.costKg)}</strong></p><p>Modal termasuk ongkir / butir<br><strong>${money(t.costPiece)}</strong></p></div><p>Total modal: <b>${money(t.total)}</b></p>`;
      f.querySelector('[type=submit]').disabled = !rows.length;
      error.textContent = '';
    } catch (err) { error.textContent = err.message; f.querySelector('[type=submit]').disabled = true; }
  };
  f.elements.purchaseCost.oninput = update; f.elements.shippingCost.oninput = update;
  d.querySelector('[data-weigh-open]').onclick = () => {
    const w = document.createElement('dialog');
    w.className = 'modal weighing-dialog';
    w.innerHTML = `<div class="modal-head"><h2>Riwayat penimbangan</h2><button type="button" data-close aria-label="Tutup">×</button></div><p>Setiap baris mencatat berat dan butir dalam satu kali timbang.</p><form class="weigh-entry"><div class="form-grid"><label class="field">Berat (kg)<input name="kg" type="number" min="0.000000001" step="any" required autofocus></label><label class="field">Butir<input name="pieces" type="number" min="1" step="1" required></label></div><button class="primary" type="submit">Tambah timbang</button><button type="button" data-reset hidden>Batal edit</button><p class="error" data-error></p></form><div data-history class="table-wrap"></div><p data-total aria-live="polite"></p><div class="modal-actions"><button type="button" data-close class="primary">Selesai menghitung</button></div>`;
    document.body.append(w);
    const wf = w.querySelector('form');
    let editing = null;
    const reset = () => { editing = null; wf.reset(); wf.querySelector('[type=submit]').textContent = 'Tambah timbang'; w.querySelector('[data-reset]').hidden = true; w.querySelector('[data-error]').textContent = ''; wf.elements.kg.focus(); };
    const draw = () => {
      w.querySelector('[data-history]').innerHTML = `<table><thead><tr><th>Timbang</th><th>Berat kg</th><th>Butir</th><th>Aksi</th></tr></thead><tbody>${rows.slice().reverse().map((row, i) => `<tr><td>${rows.length - i}${row.editedAt ? '<small>Diedit</small>' : ''}</td><td>${num(row.kg)}</td><td>${num(row.pieces)}</td><td><button type="button" data-edit="${e(row.id)}">Edit</button> <button type="button" data-delete="${e(row.id)}">Hapus</button></td></tr>`).join('') || '<tr><td colspan="4">Belum ada penimbangan.</td></tr>'}</tbody></table>`;
      w.querySelector('[data-history]').scrollTop = 0;
      const t = weighingTotals(rows); w.querySelector('[data-total]').textContent = `Total ${rows.length} kali timbang: ${num(t.kg)} kg · ${num(t.pieces)} butir`;
      w.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); editing = row.id; wf.elements.kg.value = row.kg; wf.elements.pieces.value = row.pieces; wf.querySelector('[type=submit]').textContent = 'Simpan koreksi'; w.querySelector('[data-reset]').hidden = false; wf.elements.kg.focus(); });
      w.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => { if (!confirm('Hapus catatan timbang ini?')) return; rows = rows.filter(r => r.id !== b.dataset.delete); if (editing === b.dataset.delete) reset(); d.dataset.dirty = 'true'; draw(); update(); });
    };
    wf.onsubmit = ev => {
      ev.preventDefault();
      try {
        const old = rows.find(r => r.id === editing);
        const row = { id: old?.id || id(), kg: Number(wf.elements.kg.value), pieces: Number(wf.elements.pieces.value), createdAt: old?.createdAt || new Date().toISOString(), ...(old ? { editedAt: new Date().toISOString() } : {}) };
        const next = old ? rows.map(r => r.id === old.id ? row : r) : [...rows, row];
        weighingTotals(next); rows = next; d.dataset.dirty = 'true'; reset(); draw(); update();
      } catch (err) { w.querySelector('[data-error]').textContent = err.message; }
    };
    const close = () => { if (editing || wf.elements.kg.value || wf.elements.pieces.value) { if (!confirm('Isian timbang belum dicatat. Tutup popup?')) return; } w.close(); };
    w.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    w.oncancel = ev => { ev.preventDefault(); close(); };
    w.onclose = () => { w.remove(); update(); };
    w.querySelector('[data-reset]').onclick = reset;
    draw(); w.showModal();
  };
  f.onsubmit = async ev => {
    ev.preventDefault(); if (saving) return;
    try {
      if (state.incomingReadyVersion !== 19) throw Error('Jalankan migration 019 terlebih dahulu agar barang masuk langsung siap jual.');
      const t = totals(); if (!rows.length) throw Error('Catat penimbangan terlebih dahulu.');
      if (!confirm(`Penurunan barang sudah selesai?\n${rows.length} kali timbang · ${num(t.kg)} kg · ${num(t.pieces)} butir\nTotal modal ${money(t.total)}\nSeluruh hasil akan dimasukkan ke stok sekaligus.`)) return;
      saving = true;
      const payload = { ...Object.fromEntries(new FormData(f)), id: requestId, kg: String(t.kg), pieces: String(t.pieces), totalCost: String(t.total), weighings: structuredClone(rows), unloadingComplete: true };
      if (await ctx.mutate('receipt', payload)) { d.close(); ctx.render(); ctx.toast(`Barang masuk tersimpan · ${num(t.kg)} kg · ${num(t.pieces)} butir`); }
    } catch (err) { error.textContent = err.message; } finally { saving = false; }
  };
  update();
}

export function showWeighingHistory(lot, ctx) {
  const rows = lot.weighings || [];
  const d = ctx.modal('Riwayat timbang barang masuk', `<p>${num(lot.receivedKg)} kg · ${num(lot.receivedPieces)} butir</p><div class="table-wrap"><table><thead><tr><th>Timbang</th><th>Berat kg</th><th>Butir</th><th>Waktu</th></tr></thead><tbody>${rows.slice().reverse().map((r, i) => `<tr><td>${rows.length - i}${r.editedAt ? ' · dikoreksi' : ''}</td><td>${num(r.kg)}</td><td>${num(r.pieces)}</td><td>${e(new Date(r.editedAt || r.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</td></tr>`).join('') || '<tr><td colspan="4">Penerimaan lama tidak memiliki rincian timbang.</td></tr>'}</tbody></table></div>${lot.totalCost != null ? `<p>Harga barang: ${money(lot.purchaseCost)} · Ongkir: ${money(lot.shippingCost)}<br>Modal/kg: ${money(lot.totalCost / lot.receivedKg)} · Modal/butir: ${money(lot.totalCost / lot.receivedPieces)}</p>` : ''}`);
  d.querySelector('[type=submit]').hidden = true;
  d.querySelector('form').onsubmit = ev => ev.preventDefault();
}
