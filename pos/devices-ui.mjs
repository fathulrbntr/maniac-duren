import {escape as e} from './core.mjs?v=10';
import {readDeviceSettings,saveDeviceSettings,defaultDeviceSettings,validateDeviceSettings,canConfigureDevices} from './device-settings.mjs?v=58';
import {barcodeProduct,bindBarcodeInput} from './barcode-scanner.mjs?v=66';
import {printReceipt} from './receipt-printer.mjs?v=64';
import {receiptHeader,fillReceiptLogo} from './store-profile.mjs?v=64';
const choice=(values,current)=>values.map(([value,label])=>`<option value="${value}" ${String(current)===String(value)?'selected':''}>${label}</option>`).join('');
const deviceIcon=type=>`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${type==='printer'?'M6 9V3h12v6 M6 17H3V9h18v8h-3 M6 14h12v7H6z M17 12h1':'M3 7V3h4 M17 3h4v4 M21 17v4h-4 M7 21H3v-4 M7 7v10 M10 7v10 M14 7v10 M17 7v10'}"/></svg>`;
const field=(label,control)=>`<label class="field">${label}${control}</label>`;

export function devicesPage(state) {
  if (!canConfigureDevices(state)) return '<section class="panel">Pengaturan perangkat tersedia untuk kasir dan pengelola master.</section>';
  const {printer:p,scanner:s}=readDeviceSettings();
  return `<div class="intro"><div><h2>Pengaturan perangkat</h2><p class="muted">Atur printer dan scanner untuk komputer kasir ini.</p></div><span class="device-local">Tersimpan di browser ini</span></div>
  <form id="device-settings" class="device-settings">
    <div class="device-grid"><section class="panel device-card"><div class="device-heading"><span class="device-symbol" aria-hidden="true">${deviceIcon('printer')}</span><div><h3>Printer struk</h3><p class="muted">Atur format dan kapan struk dicetak.</p></div></div>
      <div class="form-grid">${field('Lebar kertas',`<select name="paperWidth">${choice([[80,'80 mm'],[58,'58 mm']],p.paperWidth)}</select>`)}${field('Ukuran teks',`<select name="fontSize">${choice([[10,'10 px · kecil'],[11,'11 px'],[12,'12 px'],[13,'13 px'],[14,'14 px · besar']],p.fontSize)}</select>`)}${field('Margin isi',`<select name="padding">${choice([[2,'2 mm'],[3,'3 mm'],[4,'4 mm']],p.padding)}</select>`)}</div>
      <label class="device-check"><input name="autoPrint" type="checkbox" ${p.autoPrint?'checked':''}><span><b>Cetak setelah pembayaran</b><small>Buka proses cetak setelah transaksi berhasil disimpan.</small></span></label>
      ${field('Pesan di bawah struk',`<textarea name="footer" rows="3" maxlength="200" placeholder="Contoh: Terima kasih sudah berbelanja di Maniac Duren">${e(p.footer)}</textarea>`)}
      <button type="button" id="device-print-test">Uji cetak struk</button><p id="device-print-status" class="device-status" role="status"></p>
      <details class="device-help"><summary>Cetak langsung & pilihan printer</summary><p>Printer tujuan dipilih pada dialog cetak browser. Untuk cetak langsung tanpa menekan Print lagi, buka POS melalui pembuka khusus Windows dan tetapkan printer kasir sebagai default.</p><a class="button small" download="Maniac-Duren-Cetak-Otomatis.cmd" href="../scripts/windows/Maniac-Duren-Cetak-Otomatis.cmd">Unduh pembuka cetak otomatis</a><p class="muted">Browser biasa tidak dapat membaca daftar printer atau memastikan mode cetak langsung sudah aktif. Matikan header/footer pada dialog cetak bila masih muncul. Pengaturan ini perlu disimpan ulang jika memakai profil browser lain.</p></details>
    </section>
    <section class="panel device-card"><div class="device-heading"><span class="device-symbol" aria-hidden="true">${deviceIcon('scanner')}</span><div><h3>Barcode scanner</h3><p class="muted">USB / Bluetooth dengan mode keyboard.</p></div></div>
      <label class="device-check"><input name="scannerEnabled" type="checkbox" ${s.enabled?'checked':''}><span><b>Aktifkan scanner di kasir</b><small>Scan barcode atau SKU pada kolom scan di POS.</small></span></label>
      ${field('Tombol akhir scan',`<select name="terminator">${choice([['Enter','Enter'],['Tab','Tab']],s.terminator)}</select>`)}
      <details class="device-help"><summary>Awalan / akhiran tambahan</summary><p class="muted">Isi hanya jika scanner mengirim karakter tambahan. Karakter ini dilepas sebelum kode dicocokkan.</p><div class="form-grid">${field('Awalan',`<input name="prefix" maxlength="16" value="${e(s.prefix)}" autocomplete="off" placeholder="Kosongkan jika tidak ada">`)}${field('Akhiran',`<input name="suffix" maxlength="16" value="${e(s.suffix)}" autocomplete="off" placeholder="Kosongkan jika tidak ada">`)}</div></details>
      <div class="device-scan-test">${field('Uji scanner', '<input id="device-scan-input" type="text" maxlength="256" autocomplete="off" spellcheck="false" placeholder="Klik di sini, lalu scan barcode">')}<button type="button" id="device-scan-test">Periksa kode</button><p id="device-scan-status" class="device-status" role="status">Hasil uji tidak menambah keranjang atau mengubah stok.</p></div>
      <p class="muted">Pasangkan scanner Bluetooth melalui Windows terlebih dahulu. Label CAS POS KG (21IIIIWWWWWWC) membaca kode barang 4 digit dan berat gram 6 digit. Isi kolom Barcode buah di Master Barang dengan kode seperti 0001. Harga per kg di POS harus sama dengan timbangan. Awalan tambahan scanner tetap kosong jika tidak ada; angka 21 merupakan bagian label.</p>
    </section></div>
    <div class="device-settings-actions"><p id="device-save-status" role="status">Uji perangkat memakai isian saat ini. Simpan untuk menerapkannya di kasir.</p><div><button type="button" id="device-reset">Kembalikan bawaan</button><button type="submit" class="primary">Simpan pengaturan</button></div></div>
  </form>`;
}
export function bindDevices(state,store,ctx) {
  if (!canConfigureDevices(state)) return;
  const form=document.querySelector('#device-settings');if(!form)return;
  const control=name=>form.elements.namedItem(name);
  const values=()=>validateDeviceSettings({printer:{paperWidth:control('paperWidth').value,fontSize:control('fontSize').value,padding:control('padding').value,autoPrint:control('autoPrint').checked,footer:control('footer').value},scanner:{enabled:control('scannerEnabled').checked,terminator:control('terminator').value,prefix:control('prefix').value,suffix:control('suffix').value}});
  const status=document.querySelector('#device-save-status');
  form.onsubmit=event=>{event.preventDefault();try{saveDeviceSettings(values());form.dataset.dirty='false';status.textContent='Pengaturan tersimpan untuk browser ini.';ctx.toast('Pengaturan perangkat tersimpan.');}catch(error){status.textContent=error.message;}};
  document.querySelector('#device-reset').onclick=()=>{
    const {printer:p,scanner:s}=defaultDeviceSettings();
    for(const key of ['paperWidth','fontSize','padding','footer'])control(key).value=p[key];
    control('autoPrint').checked=p.autoPrint;control('scannerEnabled').checked=s.enabled;
    for(const key of ['terminator','prefix','suffix'])control(key).value=s[key];
    form.dataset.dirty='true';status.textContent='Isian kembali ke bawaan. Klik Simpan untuk menerapkan.';
  };
  const printButton=document.querySelector('#device-print-test'),printStatus=document.querySelector('#device-print-status');
  printButton.onclick=async()=>{
    if(printButton.disabled)return;printButton.disabled=true;
    try{
      const settings=values(),receipt=document.createElement('div');receipt.className='receipt-print';
      const outlet=(ctx.getState?.()||state).stores.find(s=>s.id===store);
      receipt.innerHTML=`${receiptHeader(outlet)}<h3>UJI PRINTER · BUKAN TRANSAKSI</h3><p>${e(new Date().toLocaleString('id-ID'))}</p><table><thead><tr><th>Produk</th><th>Jumlah</th><th>Subtotal</th></tr></thead><tbody><tr><td>Durpas Bawor 500 gr</td><td>1 pcs</td><td>Rp 50.000</td></tr></tbody></table><p><b>Total uji: Rp 50.000</b><br>Tidak ada pembayaran atau stok yang berubah.</p>`;
      await fillReceiptLogo(receipt,outlet,{...ctx,demo:!!state.stockDemo});
      await printReceipt(receipt,settings);printStatus.textContent='Proses cetak dibuka. Periksa hasil pada printer; browser tidak dapat memastikan kertas sudah tercetak.';
    }catch(error){printStatus.textContent=error.message;}finally{printButton.disabled=false;}
  };
  const scanStatus=document.querySelector('#device-scan-status');
  const scanInput=document.querySelector('#device-scan-input');
  for(const type of ['input','change'])scanInput.addEventListener(type,event=>event.stopPropagation());
  const scan=bindBarcodeInput(scanInput,{getSettings:values,onScan:(raw,settings)=>{
    const {code,product,scale}=barcodeProduct(ctx.getState?.()||state,raw,settings);
    scanStatus.textContent=`Terbaca: ${code} · ${product.name}${scale?` · kode ${scale.itemCode} · ${scale.kg.toFixed(3)} kg`:""}. Produk ditemukan; keranjang dan stok tidak berubah.`;
  },onError:message=>scanStatus.textContent=message});
  document.querySelector('#device-scan-test').onclick=scan;
}
