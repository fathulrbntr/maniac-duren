// A separate ephemeral channel for each cashier tab. Never persist auth, cart or QR.
export const DISPLAY_PROTOCOL = 'md-customer-display-1';
export const DISPLAY_STALE_MS = 15000;
const clip = (s, max = 120) => String(s ?? '').slice(0, max);
export function customerSnapshot(state, payment, totals, phase = 'cart', qr = null) {
  return {
    phase, demo: !!state.stockDemo,
    store: clip(state.stores?.find(x => x.id === payment.storeId)?.name || 'Maniac Duren'),
    table: payment.tableNo ? `Meja ${Number(payment.tableNo)}` : 'Takeaway',
    lines: (payment.lines || []).slice(0, 200).map(l => ({
      name: clip(state.products?.find(x => x.id === l.productId)?.name || l.name || 'Produk'),
      qty: Number(l.qty), unit: clip(l.unit, 12), price: Number(l.price), subtotal: Number(l.qty) * Number(l.price),
    })),
    subtotal: Number(totals.subtotal ?? totals.total), discount: Number(totals.discountAmount || 0), total: Number(totals.total || 0),
    payment: clip(payment.payment, 60), qr: phase === 'payment' && !state.stockDemo && qr ? {...qr} : null,
  };
}
export function receiverState(current, message, now = Date.now()) {
  if (message?.protocol !== DISPLAY_PROTOCOL || message.type !== 'snapshot' || !Number.isSafeInteger(message.seq) || message.seq <= (current?.seq ?? -1)) return current;
  return {seq: message.seq, seenAt: now, snapshot: message.snapshot};
}
export function visibleSnapshot(current, now = Date.now()) {
  if (!current || now - current.seenAt > DISPLAY_STALE_MS) return null;
  const snapshot = current.snapshot;
  if (snapshot?.qr && snapshot.qr.expiresAt <= now) return {...snapshot, qr: null, phase: 'expired'};
  return snapshot;
}
const observers = new Set();
export function observeCustomerDisplay(fn) { observers.add(fn);fn(last);return () => observers.delete(fn); }
let displayEpoch = 0;
export function getDisplayEpoch() { return displayEpoch; }
let cartSignature = '';
export function publishCustomerCart(snapshot) {
  const signature=JSON.stringify(snapshot);
  if (signature===cartSignature) return;
  cartSignature=signature; publishCustomer(snapshot);
}
let channel = null, token = '', seq = 0, last = null, timer = null, win = null;
const emit = () => channel?.postMessage({protocol: DISPLAY_PROTOCOL, type: 'snapshot', seq: ++seq, snapshot: last});
export function publishCustomer(snapshot) { last = snapshot; emit(); for(const fn of observers)fn(snapshot); }
export function resetCustomerDisplay() { displayEpoch++; cartSignature=''; publishCustomer(null); }
export function openCustomerDisplay() {
  if (typeof window === 'undefined' || typeof window.open !== 'function' || typeof BroadcastChannel === 'undefined') throw Error('Layar pelanggan membutuhkan Chrome / Edge terbaru pada komputer kasir.');
  if (!channel) {
    token = crypto.randomUUID();
    channel = new BroadcastChannel('md-display-' + token);
    channel.onmessage = ev => { if (ev.data?.protocol === DISPLAY_PROTOCOL && ev.data.type === 'hello') emit(); };
    timer = setInterval(emit, 3000);
    window.addEventListener('pagehide', () => { last = null; emit(); clearInterval(timer); channel.close(); channel = null; token = ''; win = null; }, {once: true});
  }
  if (win && !win.closed) { win.focus(); emit(); return; }
  // The fragment is not sent to the server or included in Referer headers.
  win = window.open(new URL('./customer-display.html#' + token, import.meta.url).href, 'md-display-' + token, 'popup,width=1280,height=800');
  if (!win) throw Error('Izinkan pop-up untuk membuka layar pelanggan.');
  try { win.opener = null; } catch { /* Browser may already isolate windows. */ }
  emit();
}
