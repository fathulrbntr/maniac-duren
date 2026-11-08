import {validatePaymentQR, createQRSession, attachQR, activeQR} from './payment-qr.mjs';
import {readQRPhoto} from './qr-image.mjs';
import {openCustomerDisplay} from './customer-display-channel.mjs';
import {money} from './core.mjs';

export function paymentQRFields(demo) {
  return `<section data-edc-qr hidden><h3>QRIS dari EDC BCA</h3><p>Masukkan total belanja di EDC dan buat QR pembayaran. Scan QR tersebut di bawah atau pilih fotonya.</p><label class="field">Scan QR dari EDC<textarea data-qr-payload rows="2" maxlength="2953" autocomplete="off" spellcheck="false" placeholder="Klik di sini, lalu scan QR dengan scanner 2D" ${demo?'disabled':''}></textarea></label><label class="field">Foto QR dari EDC<input data-qr-file type="file" accept="image/png,image/jpeg,image/webp" ${demo?'disabled':''}></label><p data-qr-merchant role="status">${demo?'Mode demo: QR pembayaran nyata dinonaktifkan.':'Foto dibaca di perangkat ini dan tidak diunggah.'}</p><label class="payment-receive-confirm"><input data-qr-confirm type="checkbox" ${demo?'disabled':''}> Nama merchant di QR sudah sesuai toko pada EDC.</label><div class="header-row"><button data-qr-show type="button" ${demo?'disabled':''}>Tampilkan QR</button><button data-qr-clear type="button">Sembunyikan QR</button></div><p data-qr-status role="status">QR opsional. Pelanggan juga dapat scan langsung pada EDC.</p><button data-customer-open type="button">Hubungkan tablet / layar pelanggan ↗</button></section>`;
}
export function bindPaymentQR(dialog, {total, transactionId, demo, onQR, onError, onOpenDisplay=openCustomerDisplay}) {
  const box = dialog.querySelector('[data-edc-qr]');
  if (!box) return {setMethod(){}, dispose(){}};
  const field = box.querySelector('[data-qr-payload]'), file = box.querySelector('[data-qr-file]'), confirmed = box.querySelector('[data-qr-confirm]');
  const info = box.querySelector('[data-qr-merchant]'), status = box.querySelector('[data-qr-status]');
  let session = createQRSession({total, transactionId}), disposed = false, generation = 0, qris = false, expiry = null;
  const clear = () => { session.qr = null; clearTimeout(expiry); onQR(null); };
  const validate = () => {
    generation++; clear(); confirmed.checked = false;
    try { const qr = validatePaymentQR(field.value, total); info.textContent = `${qr.merchant} · ${qr.city} · ${money(qr.amount)}`; status.textContent = 'Periksa merchant, lalu pilih Tampilkan QR.'; }
    catch (error) { info.textContent = field.value ? error.message : 'Foto dibaca di perangkat ini dan tidak diunggah.'; status.textContent = ''; }
  };
  field.addEventListener('input', validate);
  field.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); validate(); } });
  confirmed.addEventListener('change', () => { if (!confirmed.checked) clear(); });
  file.addEventListener('change', async () => {
    const attempt = ++generation; clear(); confirmed.checked = false;
    try { const payload = await readQRPhoto(file.files?.[0]); if (disposed || attempt !== generation || !qris) return; field.value = payload; validate(); }
    catch(error) { if (!disposed && attempt === generation) status.textContent = error.message; }
    finally { file.value = ''; }
  });
  box.querySelector('[data-qr-show]').onclick = () => {
    try {
      if (demo || !qris || disposed) throw Error('QR pembayaran tidak tersedia.');
      session = attachQR(session, field.value, confirmed.checked);
      onQR(activeQR(session, transactionId, total));
      status.textContent = 'QR tampil maksimal 3 menit. Status berhasil tetap diperiksa pada EDC.';
      clearTimeout(expiry); expiry = setTimeout(() => { clear(); status.textContent = 'QR disembunyikan. Periksa EDC sebelum menampilkan QR baru.'; }, 180000);
    } catch(error) { clear(); status.textContent = error.message; }
  };
  box.querySelector('[data-qr-clear]').onclick = () => { clear(); status.textContent = 'QR disembunyikan.'; };
  box.querySelector('[data-customer-open]').onclick = () => { try { onOpenDisplay(); } catch(error) { onError(error); } };
  return {
    setMethod(method) { qris = method === 'QRIS'; box.hidden = !qris; generation++; clear(); field.value = ''; confirmed.checked = false; info.textContent = demo ? 'Mode demo: QR pembayaran nyata dinonaktifkan.' : 'Foto dibaca di perangkat ini dan tidak diunggah.'; },
    dispose() { if(disposed)return; disposed = true; generation++; clear(); field.value = ''; },
  };
}
