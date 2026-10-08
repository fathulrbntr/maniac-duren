import { escape as e } from './core.mjs?v=9';
import { variantAxes, buildVariantRows, variantPayload } from './product-variants.mjs?v=44';
const field = (label,html) => `<label class="field">${label}${html}</label>`;
export const variantEditorMarkup = () => `<section class="variant-editor" aria-label="Pilihan varian">
 <div class="variant-heading"><b>1. Tentukan pilihan varian</b><small>Satu pilihan per kolom. Pisahkan nilainya dengan koma.</small></div>
 <div data-variant-axes></div><datalist id="variant-axis-names"><option value="Ukuran"><option value="Rasa"><option value="Kondisi"><option value="Warna"><option value="Kemasan"></datalist>
 <div class="variant-tools"><button type="button" data-add-axis>+ Tambah pilihan</button><button type="button" data-build-variants>Susun daftar varian</button></div>
 <p class="muted">Contoh: Kondisi → Fresh, Nitrogen. Ukuran → 500 gr, 1 kg. Keduanya menghasilkan 4 varian.</p>
 <p data-variant-status role="status" aria-live="polite"></p><div data-variant-results></div>
</section>`;
export function bindVariantEditor(root,{getCommon,state,groupId,operationId,existing=[],error}) {
  const axesBox = root.querySelector('[data-variant-axes]'), results = root.querySelector('[data-variant-results]'), status = root.querySelector('[data-variant-status]');
  let rows = [], builtSignature = '', axes = variantAxes(existing);
  if (!axes.length) axes = [{name:'Ukuran',values:[]}];
  const readAxes = () => [...axesBox.querySelectorAll('[data-axis-row]')].map(row=>({name:row.querySelector('[data-axis-name]').value,values:row.querySelector('[data-axis-values]').value}));
  const signature = () => JSON.stringify({axes:readAxes(),...getCommon()});
  function drawAxes() {
    axesBox.innerHTML = axes.map((a,i)=>`<div class="variant-axis" data-axis-row>${field('Nama pilihan',`<input data-axis-name list="variant-axis-names" maxlength="30" value="${e(a.name)}" placeholder="Ukuran, rasa, kondisi…" ${existing.length?'readonly':''}>`)}${field('Nilai pilihan',`<input data-axis-values value="${e(Array.isArray(a.values)?a.values.join(', '):a.values)}" placeholder="Contoh: 500 gr, 1 kg">`)}${existing.length?'':`<button type="button" data-remove-axis="${i}" aria-label="Hapus pilihan ${i+1}">×</button>`}</div>`).join('');
    root.querySelector('[data-add-axis]').hidden = !!existing.length || axes.length >= 3;
    axesBox.querySelectorAll('[data-remove-axis]').forEach(button=>button.onclick=()=>{axes=readAxes().filter((_,i)=>i!==Number(button.dataset.removeAxis));if(!axes.length)axes=[{name:'Ukuran',values:[]}];drawAxes();markDirty();});
    axesBox.querySelectorAll('input').forEach(input=>input.addEventListener('input',markDirty));
  }
  function markDirty() {status.textContent = 'Klik “Susun daftar varian” untuk memperbarui daftar sebelum menyimpan.';}
  function capture() {
    results.querySelectorAll('[data-variant-row]').forEach(card=>{
      const row=rows.find(p=>p.id===card.dataset.variantRow);
      card.querySelectorAll('[data-value]').forEach(input=>row[input.dataset.value]=input.value);
    });
  }
  const priceKeys = common => ['raw','prep'].includes(common.itemType)?[]:common.stockUnit==='kg_butir'?['priceKg','pricePiece']:['salePrice'];
  const priceLabel = key => ({priceKg:'Harga jual / kg (Rp)',pricePiece:'Harga jual / butir (Rp)',salePrice:'Harga jual / satuan (Rp)',buyPrice:'Harga beli referensi (Rp)'})[key];
  function drawRows() {
    const common=getCommon(), prices=priceKeys(common), count=rows.filter(p=>!p.existing).length;
    results.innerHTML = `<div class="variant-heading"><b>2. Periksa ${rows.length} varian</b><small>${existing.length?`${existing.length} sudah tersimpan · `:''}${count} varian baru. SKU dibuat otomatis dan boleh diganti.</small></div>${count?`<div class="variant-bulk"><span>Isi harga yang sama untuk varian baru</span><div class="form-grid">${['buyPrice',...prices].map(k=>field(priceLabel(k),`<input data-bulk="${k}" type="number" min="${k==='buyPrice'?0:0.01}" step="any" placeholder="Opsional">`)).join('')}</div><button type="button" data-apply-prices>Terapkan ke varian baru</button></div>`:''}<div class="variant-cards">${rows.map(p=>`<article class="variant-row" data-variant-row="${e(p.id)}"><div class="variant-row-title"><b>${e(p.name)}</b><span class="variant-tag">${p.existing?'Sudah tersimpan':'Baru'}</span></div>${p.existing?`<small>${e(p.sku)} · Ubah harga dan foto melalui Edit pada varian ini.</small>`:`<div class="form-grid">${field('SKU',`<input data-value="sku" value="${e(p.sku)}" required maxlength="40">`)}${field('Barcode (opsional)',`<input data-value="barcode" value="${e(p.barcode)}" maxlength="80" placeholder="Ketik atau scan barcode">`)}${['buyPrice',...prices].map(k=>field(priceLabel(k),`<input data-value="${k}" type="number" min="${k==='buyPrice'?0:0.01}" max="1000000000000" step="any" value="${e(p[k]??'')}" ${(k==='buyPrice'||common.itemType==='finished')?'placeholder="Opsional"':'required'}>`)).join('')}</div>`}</article>`).join('')}</div><p class="muted">Stok tiap varian dicatat melalui Barang masuk. Foto dapat ditambahkan lewat Edit pada masing-masing varian.</p>`;
    results.querySelector('[data-apply-prices]')?.addEventListener('click',()=>{
      for(const input of results.querySelectorAll('[data-bulk]')) if(input.value!=='') {
        if(!input.checkValidity()){input.reportValidity();return;}
        results.querySelectorAll(`[data-value="${input.dataset.bulk}"]`).forEach(target=>target.value=input.value);
      }
      capture();status.textContent='Harga diterapkan ke varian baru. Periksa sebelum menyimpan.';
    });
    status.textContent=`${rows.length} varian siap diperiksa. Lengkapi harga yang wajib sebelum menyimpan.`;
  }
  function build() {
    error('');capture();
    try {
      rows=buildVariantRows({name:getCommon().name,axes:readAxes(),previous:rows,existing,products:state.products,groupId});
      builtSignature=signature();drawRows();
    }catch(err){error(err.message);}
  }
  root.querySelector('[data-add-axis]').onclick=()=>{axes=readAxes();if(axes.length<3)axes.push({name:'',values:[]});drawAxes();markDirty();};
  root.querySelector('[data-build-variants]').onclick=build;
  drawAxes();
  if(existing.length)build();
  return {
    markDirty,
    payload() {
      if(!rows.length || builtSignature!==signature())throw Error('Klik “Susun daftar varian” setelah mengubah nama, jenis, satuan, atau pilihan varian.');
      capture();
      return variantPayload({id:operationId,groupId,name:getCommon().name,common:getCommon(),rows,existing,products:state.products});
    },
  };
}
export function variantGroupDialog({groupId,state,modal,mutate,render,toast}) {
  const existing=state.products.filter(p=>p.variantGroupId===groupId),first=existing[0];
  if(!first)return;
  const d=modal('Tambah varian',`<p><b>${e(first.variantGroupName)}</b></p><p class="muted">Tambahkan nilai pada pilihan di bawah. Varian yang sudah ada tetap disertakan.</p>${variantEditorMarkup()}`,'Simpan varian baru');
  d.classList.add('product-modal','variants-modal');
  const error=message=>d.querySelector('#form-error').textContent=message;
  const editor=bindVariantEditor(d,{state,groupId,operationId:crypto.randomUUID(),existing,error,getCommon:()=>({name:first.variantGroupName,itemType:first.itemType,category:first.category,stockUnit:first.stockUnit})});
  let saving=false;
  d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(saving)return;error('');try{const payload=editor.payload();saving=true;if(await mutate('product_variants_save',payload)){d.close();render();toast('Varian baru tersimpan');}}catch(err){error(err.message);}finally{saving=false;}};
}
