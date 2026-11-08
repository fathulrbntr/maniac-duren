// EMV merchant-presented QR validation. The bank's original payload is never edited.
export function crc16(text) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export function emvFields(payload) {
  const fields = new Map();
  for (let offset = 0; offset < payload.length;) {
    const header = payload.slice(offset, offset + 4);
    if (!/^\d{4}$/.test(header)) throw Error('Struktur QR pembayaran tidak valid.');
    const tag = header.slice(0, 2), length = Number(header.slice(2));
    if (!length || fields.has(tag) || offset + 4 + length > payload.length) throw Error('Panjang atau tag QR tidak valid.');
    fields.set(tag, payload.slice(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  return fields;
}
export function validatePaymentQR(raw, expectedTotal) {
  const payload = String(raw ?? '').replace(/[\r\n]+$/, '');
  if (payload.length < 50 || payload.length > 2953 || /[^\x20-\x7e]/.test(payload)) throw Error('Scan QR pembayaran resmi dari EDC; teks ini bukan QR yang didukung.');
  const f = emvFields(payload);
  if (f.get('00') !== '01' || ![...f.keys()].some(k => +k >= 26 && +k <= 51)) throw Error('QR merchant tidak dikenali.');
  if (!/6304[0-9A-Fa-f]{4}$/.test(payload) || crc16(payload.slice(0, -4)) !== f.get('63')?.toUpperCase()) throw Error('QR rusak atau tidak lengkap (CRC). Scan ulang.');
  if (f.get('01') !== '12') throw Error('Gunakan QR dinamis dari EDC yang sudah berisi nominal, bukan QR statis toko.');
  if (f.get('53') !== '360' || f.get('58') !== 'ID') throw Error('QR harus menggunakan Rupiah (IDR) dan merchant Indonesia.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(f.get('54') || '')) throw Error('QR tidak memuat nominal yang valid.');
  const amount = Number(f.get('54')), expected = Number(expectedTotal);
  if (!Number.isFinite(expected) || expected <= 0 || Math.round(amount * 100) !== Math.round(expected * 100)) throw Error('Nominal QR berbeda dengan total belanja. Buat ulang QR di EDC.');
  if (['55', '56', '57'].some(k => f.has(k))) throw Error('QR dengan biaya tambahan / tip belum didukung. Gunakan pembayaran langsung di EDC.');
  if (!f.get('59')?.trim() || !f.get('60')?.trim()) throw Error('Nama dan kota merchant tidak ditemukan.');
  return {payload, amount, merchant: f.get('59').trim(), city: f.get('60').trim()};
}

// This is a local display limit, not a claim about the bank's expiry time.
export const QR_DISPLAY_TTL = 180000;
const assignedQRs = new Map();
export function createQRSession({total, transactionId, now = Date.now()}) {
  return {total, transactionId, openedAt: now, qr: null};
}
export function attachQR(session, raw, merchantConfirmed, now = Date.now()) {
  if (!merchantConfirmed) throw Error('Pastikan nama merchant sesuai toko di EDC.');
  const qr = validatePaymentQR(raw, session.total), previous = assignedQRs.get(qr.payload);
  if (previous && previous.transactionId !== session.transactionId) throw Error('QR ini sudah digunakan pada proses pembayaran lain. Buat QR baru di EDC.');
  const expiresAt = previous?.expiresAt ?? now + QR_DISPLAY_TTL;
  if (expiresAt <= now) throw Error('Batas tampilan QR sudah habis. Periksa EDC dan buat QR baru bila belum dibayar.');
  assignedQRs.set(qr.payload, {transactionId:session.transactionId, expiresAt});
  return {...session, qr: {...qr, expiresAt}};
}
export function activeQR(session, transactionId, total, now = Date.now()) {
  return session?.transactionId === transactionId && session.total === total && session.qr?.expiresAt > now ? session.qr : null;
}
