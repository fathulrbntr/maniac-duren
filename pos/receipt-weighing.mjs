import {parseMoneyInput,formatMoneyInput} from "./money-input.mjs?v=19";
import { escape as e, id, today, num, money } from './core.mjs?v=10';
import { isLegacyStock } from './catalog.mjs?v=9';

export function weighingTotals(rows, purchase = 0, shipping = 0) {
  if (!Array.isArray(rows) || rows.length > 1000) throw Error('Maksimal 1.000 penimbangan');
  let kg = 0, pieces = 0;
  for (const row of rows) {
    const weight = Number(row.kg), count = Number(row.pieces);
    if(row.tareKg!=null&&(!Number.isFinite(Number(row.tareKg))||Number(row.tareKg)<0||!Number.isFinite(Number(row.grossKg))||Math.abs(Number(row.grossKg)-Number(row.tareKg)-weight)>1e-8))throw Error('Berat bersih harus sesuai berat timbangan dikurangi tare');
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

export function availableReceiptProducts(products, lines, active) {
  const used = new Set(lines.filter((_, i) => i !== active).map(line => line.productId));
  return products.filter(product => !used.has(product.id));
}

export function shipmentTotals(lines, shipping = 0) {
  shipping = Number(shipping);
  if (!Array.isArray(lines) || !lines.length || lines.length > 50) throw Error('Isi 1–50 produk dalam kiriman');
  if (!Number.isFinite(shipping) || shipping < 0) throw Error('Ongkir tidak valid');
  const totals = lines.map(line => weighingTotals(line.weighings, line.purchaseCost, 0));
  const kg = Number(totals.reduce((sum, t) => sum + t.kg, 0).toFixed(9));
  const pieces = totals.reduce((sum, t) => sum + t.pieces, 0);
  let allocated = 0;
  const items = totals.map((t, i) => {
    const share = i === totals.length - 1 ? shipping - allocated : kg ? shipping * t.kg / kg : 0;
    allocated += share;
    return {...t, shipping: share, total: t.purchase + share, costKg: t.kg ? (t.purchase + share) / t.kg : 0, costPiece: t.pieces ? (t.purchase + share) / t.pieces : 0};
  });
  const purchase = totals.reduce((sum, t) => sum + t.purchase, 0);
  return {items, kg, pieces, purchase, shipping, total: purchase + shipping};
}

export function openWeighingReceipt(state, store, ctx) {
  const options = (kind, selected) => state[kind].map(p => `<option value="${e(p.id)}" ${p.id === selected ? 'selected' : ''}>${e(p.name)}</option>`).join('');
  const products = state.products.filter(isLegacyStock);
  if (!products.length || !state.suppliers.length || !state.stores.length) return ctx.toast('Tambahkan produk, store dan supplier terlebih dahulu.');
  const d = ctx.modal('Barang masuk', `<div class="form-grid"><label class="field">Tanggal masuk<input name="date" type="date" value="${today()}" required></label><label class="field">Store<select name="storeId">${options('stores', store)}</select></label><label class="field">Supplier<select name="supplierId">${options('suppliers')}</select></label><label class="field">Nomor nota / surat jalan<input name="invoiceNo" maxlength="100" required></label><input name="shippingCost" type="hidden" value="0"></div><p class="form-help">Catat berat bersih dan butir aktual, termasuk reject. Modal dan ongkir dilengkapi admin setelah penerimaan.</p><div data-product-cards></div><button type="button" data-add-line>+ Tambah durian</button><div data-shipment-summary class="weigh-summary"></div><label class="field">Nomor surat jalan / catatan<input name="note" maxlength="300"></label><p class="form-help">Stok penerimaan menunggu penetapan modal oleh admin sebelum dijual atau diolah.</p>`, 'Simpan barang masuk');
  const f = d.querySelector('form'), requestId = id();
  let rows = [], saving = false, active = 0;
  const lines = [{id:id(), productId:products[0].id, purchaseCost:0, expectedKg:'',expectedPieces:'',rejectKg:0,rejectPieces:0,rejectId:id(), weighings:rows}];
  const error = d.querySelector('#form-error');
  const sync = () => {lines[active].weighings=rows;};
  const update = () => {
    const focused = d.querySelector('[data-line-cost]:focus');
    const focusIndex = focused?.dataset.lineCost;
    const caret = focused?.selectionStart;
    try {
      sync();
      const shipment = shipmentTotals(lines, f.elements.shippingCost.value);
      d.querySelector('[data-product-cards]').innerHTML = lines.map((line,i) => {
        const t=shipment.items[i];
        return `<section class="weigh-summary" style="margin:12px 0;padding:16px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b>Durian ${i+1}</b><button type="button" data-remove-line="${i}" ${lines.length===1?'disabled':''}>Hapus</button></div><div class="form-grid"><label class="field">Jenis durian<select data-line-product="${i}">${availableReceiptProducts(products,lines,i).map(p=>`<option value="${e(p.id)}" ${p.id===line.productId?'selected':''}>${e(p.name)}</option>`).join('')}</select></label><label class="field">Reject saat datang (kg)<input data-line-field="rejectKg" data-index="${i}" type="number" min="0" step="0.000001" value="${e(line.rejectKg)}"></label><label class="field">Reject saat datang (butir)<input data-line-field="rejectPieces" data-index="${i}" type="number" min="0" step="1" value="${e(line.rejectPieces)}"></label></div><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;flex-wrap:wrap"><span><b>${num(t.kg)} kg · ${num(t.pieces)} butir</b><br><small>${line.weighings.length} kali timbang</small></span><button type="button" class="primary" data-weigh-open="${i}">${line.weighings.length?'Lihat / edit timbang':'Catat timbang'}</button></div><p class="form-help">Reject termasuk dalam total timbang. Modal menunggu admin.</p></section>`;
      }).join('');
      const add = d.querySelector('[data-add-line]');
      const hasUnused = products.some(p=>!lines.some(line=>line.productId===p.id));
      add.disabled=!hasUnused || lines.length>=50;
      add.title=!hasUnused ? 'Semua jenis durian sudah ditambahkan.' : 'Tambah jenis durian lain ke kiriman ini';
      d.querySelector('[data-shipment-summary]').innerHTML=`<b>Total kiriman · ${lines.length} jenis durian</b><p>${num(shipment.kg)} kg · ${num(shipment.pieces)} butir</p><b>Menunggu rekonsiliasi PO / nota oleh admin</b>`;
      if (focusIndex !== undefined) {
        const input = d.querySelector(`[data-line-cost="${focusIndex}"]`);
        input?.focus();
        if (caret != null) input?.setSelectionRange(caret,caret);
      }
      f.querySelector('[type=submit]').disabled = lines.some(line=>!line.weighings.length||line.purchaseCost==='') || new Set(lines.map(line=>line.productId)).size!==lines.length;
      error.textContent = new Set(lines.map(line=>line.productId)).size!==lines.length ? 'Produk yang sama cukup dicatat sekali dalam kiriman.' : '';
    } catch (err) { error.textContent = err.message; f.querySelector('[type=submit]').disabled = true; }
  };
  d.querySelector('[data-product-cards]').addEventListener('input', ev => {
    const detail=ev.target.closest('[data-line-field]');
    if(detail){lines[Number(detail.dataset.index)][detail.dataset.lineField]=detail.value;d.dataset.dirty='true';return;}
    const input = ev.target.closest('[data-line-cost]');
    if (!input) return;
    try {
      const value=parseMoneyInput(input.value);
      if(value!=='' && (!Number.isFinite(Number(value)) || Number(value)<0))throw Error('Harga nota tidak boleh negatif.');
      input.setCustomValidity('');
      lines[Number(input.dataset.lineCost)].purchaseCost=value;
    } catch(error) { input.setCustomValidity(error.message);return; }
    d.dataset.dirty='true';update();
  });
  d.querySelector('[data-add-line]').onclick = () => {sync(); const next=products.find(p=>!lines.some(line=>line.productId===p.id)); if(!next || lines.length>=50)return; lines.push({id:id(),productId:next.id,purchaseCost:0,expectedKg:'',expectedPieces:'',rejectKg:0,rejectPieces:0,rejectId:id(),weighings:[]});update();d.dataset.dirty='true';};
  d.querySelector('[data-product-cards]').addEventListener('change', ev => {
    const input=ev.target.closest('[data-line-product]');if(!input)return;
    const i=Number(input.dataset.lineProduct),value=input.value;
    if(lines.some((line,j)=>j!==i&&line.productId===value)){update();ctx.toast('Durian ini sudah ada dalam kiriman.');return;}
    lines[i].productId=value;update();d.dataset.dirty='true';
  });
  d.querySelector('[data-product-cards]').addEventListener('click', ev => {
    const remove=ev.target.closest('[data-remove-line]');
    if(remove){if(lines.length===1)return;if(!confirm('Hapus durian ini beserta catatan timbangnya?'))return;sync();lines.splice(Number(remove.dataset.removeLine),1);active=0;rows=lines[0].weighings;update();d.dataset.dirty='true';return;}
    const weigh=ev.target.closest('[data-weigh-open]');
    if(weigh){sync();active=Number(weigh.dataset.weighOpen);rows=lines[active].weighings;openWeighing();}
  });
  f.elements.shippingCost.oninput = update;
  const openWeighing = () => {
    const w = document.createElement('dialog');
    w.className = 'modal weighing-dialog';
    w.innerHTML = `<div class="modal-head"><h2>Timbang ${e(products.find(p=>p.id===lines[active].productId)?.name)}</h2><button type="button" data-close aria-label="Tutup">×</button></div><p>Setiap baris mencatat berat bersih buah dan butir dalam satu keranjang. Berat bersih dihitung otomatis: berat timbangan dikurangi keranjang. Isi tare 0 jika timbangan sudah di-zero-kan.</p><form class="weigh-entry"><div class="form-grid"><label class="field">Berat timbangan (kg)<input name="kg" type="number" min="0.000000001" step="any" required autofocus></label><label class="field">Berat keranjang / tare (kg)<input name="tareKg" type="number" min="0" step="any" value="0" required></label><label class="field">Butir<input name="pieces" type="number" min="1" step="1" required></label></div><button class="primary" type="submit">Tambah timbang</button><button type="button" data-reset hidden>Batal edit</button><p class="error" data-error></p></form><div data-history class="table-wrap"></div><p data-total aria-live="polite"></p><div class="modal-actions"><button type="button" data-close class="primary">Selesai menghitung</button></div>`;
    document.body.append(w);
    const wf = w.querySelector('form');
    let editing = null;
    const reset = () => { editing = null; wf.reset(); wf.querySelector('[type=submit]').textContent = 'Tambah timbang'; w.querySelector('[data-reset]').hidden = true; w.querySelector('[data-error]').textContent = ''; wf.elements.kg.focus(); };
    const draw = () => {
      w.querySelector('[data-history]').innerHTML = `<table><thead><tr><th>Timbang</th><th>Berat kg</th><th>Butir</th><th>Aksi</th></tr></thead><tbody>${rows.slice().reverse().map((row, i) => `<tr><td>${rows.length - i}${row.editedAt ? '<small>Diedit</small>' : ''}</td><td>${num(row.kg)}<small>Tare ${num(row.tareKg||0)} kg</small></td><td>${num(row.pieces)}</td><td><button type="button" data-edit="${e(row.id)}">Edit</button> <button type="button" data-delete="${e(row.id)}">Hapus</button></td></tr>`).join('') || '<tr><td colspan="4">Belum ada penimbangan.</td></tr>'}</tbody></table>`;
      w.querySelector('[data-history]').scrollTop = 0;
      const t = weighingTotals(rows); w.querySelector('[data-total]').textContent = `Total ${rows.length} kali timbang: ${num(t.kg)} kg · ${num(t.pieces)} butir`;
      w.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); editing = row.id; wf.elements.kg.value = row.grossKg ?? row.kg; wf.elements.tareKg.value = row.tareKg ?? 0; wf.elements.pieces.value = row.pieces; wf.querySelector('[type=submit]').textContent = 'Simpan koreksi'; w.querySelector('[data-reset]').hidden = false; wf.elements.kg.focus(); });
      w.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => { if (!confirm('Hapus catatan timbang ini?')) return; rows = rows.filter(r => r.id !== b.dataset.delete); if (editing === b.dataset.delete) reset(); d.dataset.dirty = 'true'; draw(); update(); });
    };
    wf.onsubmit = ev => {
      ev.preventDefault();
      try {
        const old = rows.find(r => r.id === editing);
        const row = { id: old?.id || id(), grossKg:Number(wf.elements.kg.value),tareKg:Number(wf.elements.tareKg.value),kg:Number((Number(wf.elements.kg.value)-Number(wf.elements.tareKg.value)).toFixed(9)), pieces: Number(wf.elements.pieces.value), createdAt: old?.createdAt || new Date().toISOString(), ...(old ? { editedAt: new Date().toISOString() } : {}) };
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
      if (state.batchTrackingVersion !== 21) throw Error('Jalankan migration 021 terlebih dahulu.');
      if (state.incomingReadyVersion !== 19) throw Error('Jalankan migration 019 terlebih dahulu agar barang masuk langsung siap jual.');
      sync();
      if (state.multiReceiptVersion !== 20) throw Error('Jalankan migration 020 terlebih dahulu untuk kiriman beberapa produk.');
      const t=shipmentTotals(lines,f.elements.shippingCost.value);
      if(lines.some(line=>!line.weighings.length||line.purchaseCost===''))throw Error('Isi harga barang dan penimbangan untuk setiap produk.');
      if(new Set(lines.map(line=>line.productId)).size!==lines.length)throw Error('Produk yang sama cukup dicatat sekali dalam kiriman.');
      if (!confirm(`Penurunan barang sudah selesai?\n${lines.length} produk · ${num(t.kg)} kg · ${num(t.pieces)} butir\nStok menunggu admin menetapkan modal. Reject dipisahkan otomatis.`)) return;
      saving = true; f.querySelector('[type=submit]').disabled=true;
      const payload = {id:requestId,storeId:f.elements.storeId.value,supplierId:f.elements.supplierId.value,date:f.elements.date.value,note:f.elements.note.value,invoiceNo:f.elements.invoiceNo.value,shippingCost:f.elements.shippingCost.value,unloadingComplete:true,lines:structuredClone(lines)};
      if (await ctx.mutate('receipt_intake', payload)) { d.close(); ctx.render(); ctx.toast(`Kiriman tersimpan · ${lines.length} produk · ${num(t.kg)} kg · ${num(t.pieces)} butir`); }
    } catch (err) { error.textContent = err.message; } finally { saving = false; if(d.open){const message=error.textContent;update();if(message)error.textContent=message;} }
  };
  update();
}

export function showWeighingHistory(lot, ctx) {
  const rows = lot.weighings || [];
  const d = ctx.modal('Riwayat timbang barang masuk', `<p>${num(lot.receivedKg)} kg · ${num(lot.receivedPieces)} butir</p><div class="table-wrap"><table><thead><tr><th>Timbang</th><th>Berat kg</th><th>Butir</th><th>Waktu</th></tr></thead><tbody>${rows.slice().reverse().map((r, i) => `<tr><td>${rows.length - i}${r.editedAt ? ' · dikoreksi' : ''}</td><td>${num(r.kg)}<small>Tare ${num(r.tareKg||0)} kg</small></td><td>${num(r.pieces)}</td><td>${e(new Date(r.editedAt || r.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</td></tr>`).join('') || '<tr><td colspan="4">Penerimaan lama tidak memiliki rincian timbang.</td></tr>'}</tbody></table></div>${lot.totalCost != null ? `<p>${lot.shipmentId ? `Kiriman #${e(lot.shipmentId.slice(0,8))} · Ongkir di bawah merupakan bagian untuk produk ini.<br>` : ''}Harga barang: ${money(lot.purchaseCost)} · Ongkir: ${money(lot.shippingCost)}<br>Modal/kg: ${money(lot.totalCost / lot.receivedKg)} · Modal/butir: ${money(lot.totalCost / lot.receivedPieces)}</p>` : ''}`);
  d.querySelector('[type=submit]').hidden = true;
  d.querySelector('form').onsubmit = ev => ev.preventDefault();
}
