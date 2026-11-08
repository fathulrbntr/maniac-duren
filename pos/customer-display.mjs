import {DISPLAY_PROTOCOL, receiverState, visibleSnapshot} from './customer-display-channel.mjs';
import {validatePaymentQR} from './payment-qr.mjs';
import {qrcode} from './vendor/qrcode.mjs';
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:2}).format(Number(n) || 0);
const number = n => new Intl.NumberFormat('id-ID', {maximumFractionDigits:3}).format(Number(n) || 0);
const root = document.querySelector('#display'), connection = document.querySelector('#connection');
const token = location.hash.slice(1); let current = null, lastRender = '', channel;
function render() {
  const s = visibleSnapshot(current), signature = JSON.stringify(s);
  const live = !!current && Date.now() - current.seenAt < 15000;
  connection.textContent = live ? 'Terhubung ke kasir' : 'Menunggu kasir'; connection.classList.toggle('live', live);
  if (signature === lastRender) {
    const timer = document.querySelector('[data-timer]');
    if (timer && s?.qr) timer.textContent = 'Tampilan QR berakhir dalam ' + Math.max(0, Math.ceil((s.qr.expiresAt - Date.now()) / 1000)) + ' detik';
    return;
  }
  lastRender = signature;
  document.querySelector('#outlet').textContent = s?.store || 'Selamat datang';
  if (!s?.lines?.length) {
    root.innerHTML = `<section class="welcome"><p class="eyebrow">MANIAC DUREN</p><h1>Selamat datang.<br>Saatnya menikmati duren.</h1><p>${live?'Pesanan Anda akan tampil di sini saat kasir menambahkan produk.':'Menunggu sambungan dari kasir. Jika sedang membayar, konfirmasikan status pada kasir sebelum mencoba kembali.'}</p></section>`;
    return;
  }
  let qr = null;
  if (s.phase === 'payment' && !s.demo && s.qr?.expiresAt > Date.now()) {
    try { qr = validatePaymentQR(s.qr.payload, s.total); } catch { /* Fail closed: never show an invalid QR. */ }
  }
  const descriptions = {
    cart: ['Periksa pesanan Anda', 'Pastikan produk dan jumlah sudah sesuai. Kasir akan membantu menyelesaikan pembayaran.'],
    payment: [s.payment === 'Tunai' ? 'Pembayaran tunai' : 'Silakan lakukan pembayaran', s.payment === 'QRIS' ? 'QR pembayaran akan tampil setelah disiapkan oleh kasir. Anda juga dapat scan langsung di EDC.' : 'Ikuti arahan kasir untuk menyelesaikan pembayaran.'],
    confirming: ['Pembayaran sedang diperiksa', 'Kasir sedang memeriksa dan menyimpan transaksi. Tidak perlu melakukan pembayaran ulang.'],
    uncertain: ['Konfirmasikan kepada kasir', 'Status transaksi sedang diperiksa. Jangan melakukan pembayaran ulang terlebih dahulu.'],
    expired: ['QR telah disembunyikan', 'Periksa status pembayaran bersama kasir sebelum meminta QR baru.'],
    paid: [s.demo ? 'Simulasi selesai' : 'Terima kasih!', s.demo ? 'Ini transaksi demo, bukan pembayaran nyata.' : 'Pembayaran sudah dicatat oleh kasir. Selamat menikmati pesanan Anda.'],
  };
  const [title, help] = descriptions[s.phase] || descriptions.cart;
  root.innerHTML = `<section class="order-detail">${s.demo?'<div class="demo-badge">DEMO · BUKAN TRANSAKSI NYATA</div>':''}<p class="eyebrow">PESANAN ANDA</p><div class="section-title"><h1>Yang enak, sudah dipilih.</h1><span class="table-badge">${e(s.table)}</span></div><div class="items">${s.lines.map(l=>`<article class="item"><div><div class="item-name">${e(l.name)}</div><div class="item-meta">${number(l.qty)} ${e(l.unit)} × ${money(l.price)}</div></div><div class="item-price">${money(l.subtotal)}</div></article>`).join('')}</div><div class="summary"><div><span>Subtotal</span><b>${money(s.subtotal)}</b></div>${s.discount?`<div><span>Diskon</span><b>− ${money(s.discount)}</b></div>`:''}</div></section><section class="payment-panel ${s.phase==='paid'?'paid':''}"><p class="eyebrow">${s.phase==='paid'?'TOTAL PEMBAYARAN':'TOTAL BELANJA'}</p><div class="grand-total">${money(s.total)}</div>${qr?'<div class="qr-box" id="payment-qr" aria-label="QRIS pembayaran"></div>':`<div class="payment-mark" aria-hidden="true">${s.phase==='paid'?'✓':s.phase==='confirming'?'…':'✦'}</div>`}<h2 class="pay-title">${qr?'Scan untuk membayar':e(title)}</h2>${qr?`<p class="merchant">${e(qr.merchant)}</p><p class="pay-help">Periksa nama merchant dan nominal di aplikasi pembayaran Anda.</p><span class="qr-timer" data-timer></span>`:`<p class="pay-help">${e(help)}</p>`}</section>`;
  if (qr) {
    // The original bank payload, including checksum, is encoded without alteration.
    const code = qrcode(0, 'M'); code.addData(qr.payload, 'Byte'); code.make();
    document.querySelector('#payment-qr').innerHTML = code.createSvgTag({cellSize:4, margin:16, scalable:true});
  }
}
document.querySelector('#fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* Browser may block fullscreen. */ }
};
if (/^[0-9a-f-]{36}$/i.test(token) && typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('md-display-' + token);
  channel.onmessage = ev => { current = receiverState(current, ev.data); render(); };
  channel.postMessage({protocol:DISPLAY_PROTOCOL, type:'hello'});
  setInterval(() => { channel.postMessage({protocol:DISPLAY_PROTOCOL, type:'hello'}); render(); }, 1000);
  window.addEventListener('pagehide', () => channel.close());
} else { connection.textContent = 'Belum terhubung'; }
