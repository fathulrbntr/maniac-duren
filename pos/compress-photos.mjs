import { compressStoredPhotos } from './photo-maintenance.mjs?v=41';
const $ = id => document.getElementById(id);
let config, session, expires = 0, running = false, stop = false;
const labels = { product: 'produk', profile: 'profil', ktp: 'KTP', evidence: 'bukti reject' };
async function jsonFetch(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options, signal: AbortSignal.timeout(45000) });
  let data;
  try { data = await response.json(); } catch { throw Error('Server tidak mengirim respons yang valid.'); }
  if (!response.ok) {
    if (data?.code === 'PGRST202') throw Error('Jalankan database/compress-pos-photos.sql di Supabase terlebih dahulu.');
    throw Error(data?.error_description || data?.message || data?.error || 'Permintaan gagal. Periksa koneksi lalu ulangi.');
  }
  return data;
}
function keepSession(data) {
  if (!data.access_token || !data.refresh_token) throw Error('Sesi login tidak valid');
  session = data;
  expires = Date.now() + Math.max(30, (data.expires_in || 3600) - 60) * 1000;
}
async function rpc(action, payload = {}) {
  if (!session) throw Error('Masuk kembali sebagai owner');
  if (Date.now() >= expires) keepSession(await jsonFetch(config.url + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  }));
  return jsonFetch(config.url + '/rest/v1/rpc/pos_photo_maintain', {
    method: 'POST', headers: { apikey: config.key, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
}
function summary(report) {
  return `${report.checked} foto diperiksa · ${report.updated} dikompres · ${report.skipped} sudah kecil\n${report.conflicts} berubah saat proses (dilewati) · ${report.errors.length} gagal diproses\nPengurangan data foto: ${(report.savedBytes / 1048576).toFixed(2)} MB (termasuk Base64).`;
}
$('login').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget, credentials = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button');button.disabled = true;
  try {
    config = await jsonFetch('/api/pos-config');
    if (!config.configured) throw Error('Konfigurasi POS belum lengkap');
    keepSession(await jsonFetch('/api/pos-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) }));
    await rpc('check');
    $('login').reset();$('login').hidden = true;$('controls').hidden = false;
    $('status').textContent = 'Owner terverifikasi. Pilih folder cadangan untuk mulai.';
  } catch (error) { session = null;$('status').textContent = error.message; }
  finally { button.disabled = false; }
};
$('start').onclick = async () => {
  if (running) return;
  if (typeof window.showDirectoryPicker !== 'function') {
    $('status').textContent = 'Buka halaman ini melalui HTTPS di Chrome atau Edge desktop untuk menyimpan cadangan ke folder.';return;
  }
  running = true;stop = false;$('start').disabled = true;$('logout').disabled = true;$('stop').disabled = false;
  let last = { checked: 0, updated: 0, skipped: 0, conflicts: 0, errors: [], savedBytes: 0 };
  try {
    const directory = await window.showDirectoryPicker({ mode: 'readwrite' });
    const folder = await directory.getDirectoryHandle('maniac-foto-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8), { create: true });
    $('status').textContent = 'Memeriksa foto…';
    const result = await compressStoredPhotos({
      rpc, shouldStop: () => stop,
      backup: async original => {
        const file = await folder.getFileHandle(`${original.kind}-${original.id}${original.slot ? '-' + original.slot : ''}.json`, { create: true });
        const stream = await file.createWritable();
        try { await stream.write(JSON.stringify({ ...original, project: config.url, savedAt: new Date().toISOString() }));await stream.close(); }
        catch (error) { try { await stream.abort(); } catch {} throw Error('Cadangan gagal disimpan. Proses dihentikan: ' + error.message); }
      },
      onProgress: (report, item) => { last = report;$('status').textContent = `Memproses foto ${labels[item.kind]}…\n` + summary(report); },
    });
    const log = await folder.getFileHandle('hasil-kompresi.json', { create: true });
    const stream = await log.createWritable();
    await stream.write(JSON.stringify({ ...result, project: config.url, completedAt: new Date().toISOString() }, null, 2));await stream.close();
    $('status').textContent = (result.stopped ? 'Dihentikan. Foto yang sudah berhasil tetap tersimpan.\n' : 'Pemeriksaan selesai.\n') + summary(result) + '\nCadangan dan rincian hasil tersimpan di folder pilihan. Muat ulang POS untuk membaca foto terbaru.';
  } catch (error) {
    $('status').textContent = error.name === 'AbortError' ? 'Pemilihan folder dibatalkan.' : `Proses berhenti: ${error.message}\n${summary(last)}\nJika koneksi terputus saat menyimpan, hasil terakhir perlu diperiksa. Jalankan ulang setelah masalah teratasi; foto kecil akan dilewati.`;
  } finally { running = false;$('start').disabled = false;$('logout').disabled = false;$('stop').disabled = true; }
};
$('stop').onclick = () => { stop = true;$('stop').disabled = true; };
$('logout').onclick = () => { session = null;expires = 0;$('controls').hidden = true;$('login').hidden = false;$('status').textContent = 'Sesi halaman kompresi ditutup.'; };
window.addEventListener('beforeunload', event => { if (running) { event.preventDefault();event.returnValue = ''; } });
