import { variantGroupDialog, productVariantDialog } from "./variant-editor.mjs?v=45";
import {createSidebarController,sidebarIcon} from './sidebar.mjs?v=42';
const sidebar = createSidebarController();
import {installMoneyInputs} from './money-input.mjs?v=44';
installMoneyInputs();
import { openWeighingReceipt, showWeighingHistory } from './receipt-weighing.mjs?v=19';
import {inventoryPanel,bindInventory} from "./inventory-ui.mjs?v=65";
import {opsPages,opsPage,bindOps,clearOrderDraft,hasOrderDraft} from './operations-ui.mjs?v=68';
import {printReceipt} from './receipt-printer.mjs?v=64';
import {storesPage,storeDialog} from './store-settings.mjs?v=64';
import {receiptHeader,fillReceiptLogo} from './store-profile.mjs?v=64';
const storeContext=()=>({modal,mutate,render,toast,demo:mode==='stock-demo',loadStoreLogo:(storeId,version)=>request('/rest/v1/rpc/pos_store_logo',{store_id:storeId,expected_version:version||null})});
import {
  navigation,
  mayLeave,
  trackForms,
} from "./navigation.mjs?v=63";
import {
  prepareRetry,
  settleRetry,
  reconcileRetry,
  pendingRetry,
  setRetryScope,
} from "./retry.mjs?v=64";
import {batchReportPage,bindBatchReport} from './batch-report-ui.mjs?v=63';
import { wastePage, bindWaste } from "./waste-ui.mjs?v=63";
import {
  recipesPage,
  productionPage,
  unitStockPanel,
  receiptDialog,
  bindProduction,
} from "./production-ui.mjs?v=63";
import {
  today,
  money,
  num,
  escape as e,
  id,
  emptyState,
  saleRows,
  summarize,
} from "./core.mjs?v=60";
import { isLegacyStock, itemTypes } from "./catalog.mjs?v=59";
import { catalogPanel, productDialog } from "./catalog-ui.mjs?v=66";
const themeKey = "maniac-pos-theme";
function themeButton(extraClass = "") {
  return `<button type="button" class="small theme-toggle ${extraClass}" data-theme-toggle aria-label="Ganti tema"><svg class="theme-light-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><svg class="theme-dark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/></svg><span data-theme-label></span></button>`;
}
function syncThemeControls() {
  const dark = document.documentElement.dataset.theme === "dark";
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-label', dark ? 'Aktifkan mode light' : 'Aktifkan mode dark');
    button.setAttribute('aria-pressed', String(dark));
    button.querySelector('[data-theme-label]').textContent = dark ? 'Dark' : 'Light';
  });
}
document.addEventListener('click', event => {
  if (!event.target.closest('[data-theme-toggle]')) return;
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(themeKey, theme); } catch { /* Theme still works when storage is unavailable. */ }
  syncThemeControls();
});
window.addEventListener('storage', event => {
  if (event.key === themeKey && ['light','dark'].includes(event.newValue)) {
    document.documentElement.dataset.theme = event.newValue;
    syncThemeControls();
  }
});
const stockFilter = {};
const catalogFilter = { query: "", category: "", itemType: "" };
let stateRevision=0, polling=false, soundEnabled=false, audioContext;
const seenKitchen=new Map();
let state = emptyState(),
  mode = "",
  config = {},
  token = "",
  refreshToken = "",
  expires = 0,
  view = "dashboard",
  store = "",
  cart = [],
  busy = false,
  lastSale = null;
const app = document.querySelector("#app"),
  filter = { from: today(), to: today(), store: "", supplier: "" };
const title = {
  devices: "Printer & Scanner",
  discounts: "Diskon & Persetujuan", dashboard: "Dashboard", orders: "Kasir / POS", kitchen: "Kitchen Display",
  products: "Master Barang", stock: "Stok & Penerimaan", losses: "Reject & Waste", waste: "Reject & Waste", batches: "Laporan Batch Supplier",
  recipes: "Master Resep", production: "Produksi & Persiapan",
  finance: "Petty Cash & Keuangan", salesreport: "Laporan Penjualan", trace: "Jejak Stok & Produksi", reports: "Rincian Penjualan Buah",
  employees: "Karyawan & Akses", attendance: "Absensi", stores: "Outlet", suppliers: "Supplier", guide: "Panduan",
  cashier: "Kasir buah cepat",
};
const paths = {
  devices: "M6 9V3h12v6 M6 17H3V9h18v8h-3 M6 14h12v7H6z M17 12h1",
  discounts: "M19 5L5 19 M7 7h.01 M17 17h.01 M9 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  orders: "M7 4H5v17l3-2 4 2 4-2 3 2V4h-2 M9 3h6v4H9z M8 11h8 M8 15h5",
  kitchen: "M4 4h16v17H4z M8 2v4 M16 2v4 M8 10h8 M8 14h8 M8 18h4",
  cashier: "M4 3h16v13H4z M8 20h8 M12 16v4 M7 7h10 M7 11h4",
  stock: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10 M7 5l10 5",
  production: "M5 10h14v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z M2 11h3 M19 11h3 M8 3v3 M12 2v4 M16 3v3",
  waste: "M8 4l3-2 3 5 M11 2L6 10 M20 11l1 4-6 1 M21 15l-5-8 M11 21l-4-1 2-5 M7 20h9",
  losses: "M3 5h18 M5 5l1 16h12l1-16 M9 5V2h6v3 M10 9v8 M14 9v8",
  salesreport: "M5 3h14v18l-3-2-4 2-4-2-3 2z M8 7h8 M8 11h8 M8 15h3",
  finance: "M3 6h18v14H3z M3 6l14-3v3 M15 11h6v5h-6z M17 13h1",
  trace: "M5 3h10v6H5z M5 15h10v6H5z M10 9v6 M15 6h4v12h-4",
  batches: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10",
  reports: "M4 20V4 M4 20h17 M8 16v-5 M13 16V7 M18 16v-9",
  employees: "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M2 21v-3a6 6 0 0 1 12 0v3 M17 4a4 4 0 0 1 0 8 M18 15a5 5 0 0 1 4 5v1",
  attendance: "M5 4h14v17H5z M8 2v4 M16 2v4 M5 9h14 M8 15l3 3 5-6",
  guide: "M12 5c-3-2-7-2-10-1v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1z M12 5v16",
  products: "M3 3h8l10 10-8 8L3 11z M7 7h.01",
  recipes: "M4 3h13v18H4z M7 3v18 M10 7h4 M10 11h4 M10 15h3 M17 6h3v12h-3",
  stores: "M3 9l2-6h14l2 6 M3 9v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9z M5 15v6h14v-6 M10 21v-5h4v5",
  suppliers: "M2 5h12v12H2z M14 9h4l4 5v3h-8 M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M16 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
  edit: "M14 4l6 6 M3 21l5-1L21 7l-5-5L3 15z",
  master: "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5",
};
const icon = (k) =>
  `<svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[k] || paths.master}"/></svg>`;
const name = (kind, k) => state[kind].find((x) => x.id === k)?.name || "—";
const short = (k) =>
  k.startsWith("demo") ? k.toUpperCase() : k.slice(0, 8).toUpperCase();
const options = (kind, selected = "", all = false) =>
  `${all ? '<option value="">Semua</option>' : ""}${state[kind].map((x) => `<option value="${e(x.id)}" ${x.id === selected ? "selected" : ""}>${e(x.name)}</option>`).join("")}`;
const field = (label, html) =>
  `<div class="field"><label>${label}</label>${html}</div>`;
function toast(text) {
  const t = document.querySelector("#toast");
  t.textContent = (mode === "stock-demo" ? "Demo · " : "") + text;
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = "none"), 5000);
}
let stockDemoModule,demoSource=null;
const demoEngine=()=>stockDemoModule ||= import('./stock-demo.mjs?v=66').catch(error=>{stockDemoModule=null;throw error;});
function assertDemoRequest(path,allowDemoRead){
  if(mode==='stock-demo'&&!(allowDemoRead&&['/rest/v1/rpc/pos_read','/auth/v1/token?grant_type=refresh_token'].includes(path)))throw Error('Mode demo tidak mengirim perubahan ke database asli.');
}
async function switchStockDemo(reset=false){
  if(busy||!['live','stock-demo'].includes(mode))return;
  if(reset&&mode!=='stock-demo')return;
  if(document.querySelector('dialog[open]'))return toast('Tutup pop-up sebelum mengganti mode.');
  if(pendingRetry())return toast('Periksa pengiriman yang belum terkonfirmasi sebelum mengganti mode.');
  if(!mayLeave(false))return;
  if((cart.length||hasOrderDraft())&&!confirm('Pergantian mode akan mengosongkan keranjang yang belum disimpan. Lanjutkan?'))return;
  if(reset&&!confirm('Ulangi demo dari data master asli dan stok 100? Semua perubahan demo akan dibuang.'))return;
  busy=true;stateRevision++;
  const switchingControls=[...document.querySelectorAll('button,input,select,textarea')].map(node=>({node,disabled:node.disabled}));
  switchingControls.forEach(({node})=>node.disabled=true);
  try{
    if(mode==='live'||reset){
      const engine=await demoEngine();const source=reset?demoSource:state;
      const next=engine.createStockDemo(source);if(!reset)demoSource=source;
      state=next;mode='stock-demo';
    }else{
      // Keep demo active and write-protected until the real read succeeds.
      const fresh=await request('/rest/v1/rpc/pos_read',{},true,true);
      if(!Array.isArray(fresh?.products)||!Array.isArray(fresh?.stores)||fresh.stockDemo)throw Error('Respons data asli tidak lengkap. Mode demo tetap aktif.');
      state=fresh;mode='live';demoSource=null;
    }
    if(!state.stores.some(x=>x.id===store))store=state.stores[0]?.id||'';
    cart=[];clearOrderDraft();lastSale=null;seenKitchen.clear();render();
    toast(mode==='stock-demo'?'Stok uji 100 sudah siap di setiap outlet yang dapat diakses.':'Mode demo dimatikan. Data asli sudah dimuat kembali.');
  }catch(err){toast(err.message);}
  finally{busy=false;switchingControls.forEach(({node,disabled})=>{if(node.isConnected)node.disabled=disabled;});}
}
let refreshingToken;
async function request(path, body, auth = true, allowDemoRead = false) {
  assertDemoRequest(path,allowDemoRead);
  if (auth && refreshToken && Date.now() > expires - 60000) {
    refreshingToken ||= request(
      "/auth/v1/token?grant_type=refresh_token",
      { refresh_token: refreshToken },
      false,
      allowDemoRead,
    )
      .then((d) => {
        token = d.access_token;
        refreshToken = d.refresh_token;
        expires = Date.now() + d.expires_in * 1000;
      })
      .finally(() => (refreshingToken = null));
    await refreshingToken;
  }
  assertDemoRequest(path,allowDemoRead);
  const r = await fetch(config.url + path, {
    method: body ? "POST" : "GET",
    headers: {
      apikey: config.key,
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => {
    throw Error("Respons server tidak dapat dibaca");
  });
  if (!r.ok) {
    const error = Error(
      data.message || data.error_description || data.msg || "Koneksi gagal",
    );
    error.definitive = r.status < 500;
    error.code = data.code;
    error.status = r.status;
    throw error;
  }
  return data;
}
async function refresh() {
  if (busy) throw Error("Tunggu proses simpan selesai.");
  if (mode === "stock-demo") return;
  if (mode === "live") {
    const revision=stateRevision;
    const fresh=await request("/rest/v1/rpc/pos_read", {});
    if(mode!=="live"||busy||revision!==stateRevision)return;
    state=fresh;
    if (!store || !state.stores.some((x) => x.id === store))
      store = state.stores[0]?.id || "";
  } else if (!store) store = state.stores[0]?.id || "";
  const pending = pendingRetry();
  if (reconcileRetry(state)) {
    if (pending.action === "sale") cart = [];
    if (pending.action === "order_create") clearOrderDraft();
    toast("Pengiriman sebelumnya sudah tersimpan.");
  }
}
async function mutate(action, payload, {throwOnError = false} = {}) {
  if (busy) {
    if (throwOnError) throw Error("Tunggu proses simpan selesai.");
    return false;
  }
  try {
    if(!["live","stock-demo"].includes(mode))throw Error("Masuk ke POS sebelum menyimpan.");
    if(mode === "live") Object.assign(payload, prepareRetry(action, payload));
  } catch (error) {
    toast(error.message);
    if (throwOnError) throw error;
    return false;
  }
  stateRevision++;
  busy = true;
  const controls = [
    ...document.querySelectorAll("button,input,select,textarea"),
  ].map((node) => ({ node, disabled: node.disabled }));
  controls.forEach(({ node }) => (node.disabled = true));
  try {
    if (mode === "stock-demo") {
      const engine=await demoEngine();state=engine.applyStockDemoAction(state,action,payload);
    } else
      state = action === "pos_category_save"
        ? await request("/rest/v1/rpc/pos_menu_category_save", {payload})
        : action === "product_variants_save"
        ? await request("/rest/v1/rpc/pos_product_variants_save", { payload })
        : await request("/rest/v1/rpc/pos_mutate_027", { action, payload });
    if(mode === "live") settleRetry(action);
    return true;
  } catch (error) {
    if(mode === "live") settleRetry(action, !error.definitive);
    {const formError=document.querySelector('dialog[open] #form-error');if(formError)formError.textContent=error.message;}
    error.message += mode === "live" && !error.definitive
      ? " · Status simpan belum pasti. Periksa stok atau kirim ulang data yang sama."
      : "";
    toast(error.message);
    if (throwOnError) throw error;
    return false;
  } finally {
    busy = false;
    controls.forEach(({ node, disabled }) => {
      if (node.isConnected) node.disabled = disabled;
    });
  }
}
function login(message = "") {
  sidebar.reset();
  app.innerHTML = `<div class="auth auth-workspace">${themeButton("auth-theme")}<section class="auth-form"><div><img class="auth-logo" src="logo.png" alt="Maniac Duren"><h1>Selamat datang kembali</h1><p class="muted auth-intro">Masuk untuk mengelola outlet Maniac Duren.</p>${config.configured ? "" : `<div class="notice">Akses POS belum tersedia. Hubungi pengelola.</div>`}<form id="login-form">${field("Email, username, atau nomor telepon", '<input name="identifier" required autocomplete="username" placeholder="Masukkan akun Anda">')}${field("Password", '<input name="password" type="password" required autocomplete="current-password" placeholder="Masukkan password">')}<p class="error" id="login-error" role="alert">${e(message)}</p><button class="primary full" type="submit" ${config.configured ? "" : "disabled"}>Masuk</button></form><a class="auth-back" href="/">Kembali ke website</a></div></section></div>`;
  syncThemeControls();
  document.querySelector("#login-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget,
      b = form.querySelector("button");
    b.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      const response = await fetch("/api/pos-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const d = await response.json();
      if (!response.ok) throw Error(d.error || "Login gagal. Coba lagi.");
      if (!d.access_token || !d.user?.id) throw Error("Respons login tidak lengkap.");
      token = d.access_token;
      refreshToken = d.refresh_token;
      expires = Date.now() + d.expires_in * 1000;
      mode = "live";demoSource=null;
      setRetryScope(config.url + ":" + d.user.id);
      await refresh();
      view=state.access?.sell?"orders":state.access?.kitchen?"kitchen":state.access?.attendance?"attendance":"guide";
      render();
    } catch (err) {
      token = "";
      refreshToken = "";
      mode = "";
      document.querySelector("#login-error").textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
}
function stat(label, value, note) {
  return `<div class="stat"><small>${label}</small><strong>${value}</strong><span>${note}</span></div>`;
}
function accountProfile() {
  const person = state.employees?.find(employee => employee.id === state.me?.id) || state.me || {};
  const accountName = person.name || "Akun login";
  const photo = person.profile_photo;
  const role = {owner:"Owner · Akses penuh",manager:"Manager",cashier:"Kasir",kitchen:"Kitchen",warehouse:"Gudang",staff:"Staff"}[person.role] || "Staff";
  const initials = accountName.trim().split(/\s+/).slice(0,2).map(word => word[0]).join("").toUpperCase();
  return `<div class="account-profile" aria-label="Akun yang login">${photo ? `<img src="${e(photo)}" alt="Foto ${e(accountName)}">` : `<span class="account-avatar" aria-hidden="true">${e(initials)}</span>`}<div><strong>${e(accountName)}</strong><span>${e(role)}</span></div></div>`;
}
function shell(body) {
  return `<div class="shell ${["products","stock"].includes(view)?"inventory-shell":""}" ${sidebar.attributes()}>
    <aside class="sidebar" id="pos-sidebar" aria-label="Sidebar Maniac Duren">
      <div class="sidebar-header">
        <div class="sidebar-brand-row"><div class="brand"><img src="logo.png" alt=""><div><strong>Maniac Duren</strong><span>Operations / POS</span></div></div><button type="button" class="sidebar-toggle" data-sidebar-toggle aria-controls="pos-sidebar" aria-label="Tutup sidebar">${sidebarIcon}</button></div>
        <div class="sidebar-store"><label for="active-store">Outlet aktif</label><div class="store-select-wrap">${icon("stores")}<select id="active-store" aria-label="Outlet aktif" title="${e(name("stores", store))}">${options("stores", store)}</select></div></div>
      </div>
      <nav class="nav" id="pos-navigation" aria-label="Navigasi POS">${navigation(title, view, icon, {...state.access,cashierOwner:state.me?.role==='owner'}, sidebar.closedGroups)}</nav>
      <div class="sidebar-account">${accountProfile()}<button id="logout" class="sidebar-logout" type="button" aria-label="Logout" title="Logout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10"/></svg><span>Logout</span></button></div>
    </aside>
    <button type="button" class="sidebar-backdrop" data-sidebar-close tabindex="-1" aria-label="Tutup sidebar"></button>
    <main id="pos-main"><header class="topbar"><div class="workspace-heading"><button id="sidebar-toggle" type="button" class="sidebar-toggle" data-sidebar-toggle aria-controls="pos-sidebar" aria-label="Buka sidebar">${sidebarIcon}</button><h1>${e(title[view] || "Maniac Duren")}</h1></div><div class="workspace-tools"><span class="workspace-outlet">${icon("stores")}<span>${e(name("stores", store))}</span></span><button type="button" id="stock-demo-toggle" class="stock-demo-toggle" role="switch" aria-checked="${mode==='stock-demo'}"><span class="stock-demo-track" aria-hidden="true"></span>Mode demo</button>${themeButton()}</div></header><div class="workspace-content">${mode==='stock-demo'?'<aside class="stock-demo-banner" role="status"><div><b>MODE DEMO · Stok awal 100</b><p>Data uji hanya di tab ini. Semua penyimpanan demo terpisah dari database asli. Harga dan resep mengikuti master.</p><small>Buah: 100 kg + 100 butir. Bahan / produk stok: 100 sesuai satuannya. ${e(itemTypes.recipe)} mengikuti bahan.</small></div><button type="button" id="stock-demo-reset">Reset demo</button></aside>':''}${body}<p class="page-foot">Maniac Duren · ${e(name("stores", store))}</p></div></main>
  </div>`;
}
function dashboard() {
  const rows = saleRows(state, { from: today(), to: today(), store }),
    s = summarize(rows),
    lots = state.lots.filter((x) => x.storeId === store),
    kg = lots.reduce((a, x) => a + x.kg, 0),
    pieces = lots.reduce((a, x) => a + x.pieces, 0);
  const receiptCount = new Set(rows.map((x) => x.saleId)).size;
  return `<div class="intro"><div><h2>Ringkasan hari ini</h2><div class="muted">${e(name("stores", store))} · ${new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" }).format(new Date())}</div></div><button class="primary" data-view="orders">${icon("cashier")} Transaksi baru</button></div><div class="stats">${stat("Omzet hari ini", money(s.total), `${receiptCount} transaksi selesai`)}${stat("Stok durian utuh", num(kg) + " kg", num(pieces) + " butir di store ini")}${stat("Omzet jual per butir", money(s.pieceRevenue), "Menggunakan " + num(s.pieceKg) + " kg stok")}${stat("Durian terjual", num(s.kg) + " kg", num(s.pieces) + " butir terjual")}</div><div class="split"><section class="panel"><div class="header-row"><h3>Penjualan terbaru</h3><button class="small" data-view="reports">Lihat laporan</button></div>${salesTable(rows.slice(-6).reverse(), false)}</section><section class="panel"><h3>Omzet berdasarkan cara jual</h3>${[
    "KG",
    "BUTIR",
  ]
    .map((u, i) => {
      const value = i ? s.pieceRevenue : s.kgRevenue;
      return `<div class="bar-row"><span>Per ${i ? "butir" : "kg"}</span><div class="bar"><div style="width:${s.total ? (value / s.total) * 100 : 0}%"></div></div><b>${money(value)}</b></div>`;
    })
    .join(
      "",
    )}<div class="callout">Penjualan per butir menggunakan <b>${num(s.pieceKg)} kg</b> stok dan menghasilkan <b>${money(s.pieceRevenue)}</b>.</div><h3 style="margin-top:25px">Omzet 7 hari</h3><div class="trend">${Array.from(
    { length: 7 },
    (_, i) => {
      const d = new Date(today() + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 6 + i);
      const day = d.toISOString().slice(0, 10);
      const val = summarize(
        saleRows(state, { from: day, to: day, store }),
      ).total;
      return { day, val };
    },
  )
    .map(
      (x, _, a) =>
        `<div class="trend-col" title="${x.day}: ${money(x.val)}"><div style="height:${Math.max(1, (x.val / Math.max(1, ...a.map((x) => x.val))) * 105)}px"></div><small>${x.day.slice(8)}</small></div>`,
    )
    .join(
      "",
    )}</div></section></div><section class="panel"><h3>Stok per produk</h3>${inventoryTable(lots)}</section>`;
}
function inventoryTable(lots) {
  const grouped = state.products.filter(isLegacyStock).map((p) => ({
    ...p,
    kg: lots.filter((l) => l.productId === p.id).reduce((a, l) => a + l.kg, 0),
    pieces: lots
      .filter((l) => l.productId === p.id)
      .reduce((a, l) => a + l.pieces, 0),
  }));
  return `<div class="table-wrap"><table><thead><tr><th>PRODUK</th><th class="numeric">STOK KG</th><th class="numeric">STOK BUTIR</th><th>STATUS</th></tr></thead><tbody>${grouped.map((p) => `<tr><td><b>${e(p.name)}</b><small>${e(p.sku)}</small></td><td class="numeric">${num(p.kg)} kg</td><td class="numeric">${num(p.pieces)} butir</td><td><span class="pill">${p.kg > 0 && p.pieces > 0 ? "Tersedia" : "Habis / cek fisik"}</span></td></tr>`).join("") || '<tr><td colspan="4" class="empty">Tambahkan produk di halaman Product.</td></tr>'}</tbody></table></div>`;
}
function salesTable(rows, details = true) {
  return `<div class="table-wrap"><table><thead><tr><th>TRANSAKSI / PRODUK</th>${details ? "<th>STORE / SUPPLIER</th>" : ""}<th>CARA JUAL</th><th class="numeric">BERAT / BUTIR</th><th class="numeric">OMZET</th></tr></thead><tbody>${rows.map((r) => `<tr><td><button class="small" data-receipt="${e(r.saleId)}">#${short(r.saleId)}</button><small style="display:block;margin-top:6px">${r.date} · ${e(name("products", r.productId))}</small></td>${details ? `<td><b>${e(name("stores", r.storeId))}</b><small>${e(name("suppliers", r.supplierId))} · ${short(r.lotId)}</small></td>` : ""}<td><span class="pill ${r.unit === "BUTIR" ? "butir" : ""}">Per ${r.unit === "KG" ? "kg" : "butir"}</span></td><td class="numeric"><b>${num(r.kg)} kg</b><small>${r.pieces} butir</small></td><td class="numeric"><b>${money(r.total)}</b></td></tr>`).join("") || `<tr><td colspan="5" class="empty">Belum ada penjualan dalam periode ini.</td></tr>`}</tbody></table></div>`;
}
function cashier() {
  const total = cart.reduce((a, l) => a + l.total, 0);
  return `<div class="pos-layout"><section><div class="header-row"><div><h3>Pilih durian</h3><p class="muted">Store ${e(name("stores", store))}</p></div><button class="small" id="reload">Perbarui stok</button></div><div class="products">${
    state.products
      .filter(isLegacyStock)
      .map((p) => {
        const lots = state.lots.filter(
          (l) => l.storeId === store && l.productId === p.id,
        );
        const kg = lots.reduce((a, l) => a + l.kg, 0),
          pieces = lots.reduce((a, l) => a + l.pieces, 0);
        return `<button class="product" data-product="${e(p.id)}" ${kg <= 0 || pieces <= 0 ? "disabled" : ""}><div class="product-mark">${e(p.name.slice(0, 2).toUpperCase())}</div><h3>${e(p.name)}</h3><div class="muted">${e(p.sku)} · ${num(kg)} kg / ${pieces} butir</div><div class="price">${money(p.priceKg)} <span class="muted">/ kg</span></div><div class="muted">${money(p.pricePiece)} / butir</div></button>`;
      })
      .join("") ||
    '<div class="empty">Tambah produk dan barang masuk dahulu.</div>'
  }</div></section><aside class="panel receipt"><div class="header-row"><h3>Pesanan</h3><span class="tag">${cart.length} item</span></div>${cart.map((l, i) => `<div class="cart-item"><div class="cart-line"><b>${e(name("products", l.productId))}</b><button data-remove="${i}" aria-label="Hapus ${e(name("products", l.productId))}">×</button></div><div class="muted">${num(l.kg)} kg · ${l.pieces} butir · per ${l.unit === "KG" ? "kg" : "butir"}</div><div class="muted">${e(name("suppliers", l.supplierId))} · ${short(l.lotId)}</div><div style="text-align:right;margin-top:9px"><b>${money(l.total)}</b></div></div>`).join("") || '<div class="empty">Pilih produk untuk mulai.</div>'}<div class="total"><span>Total</span><span>${money(total)}</span></div><form id="checkout">${field("Tanggal penjualan", `<input type="date" name="date" value="${today()}" required>`)}${field("Metode pembayaran", '<select name="payment"><option>Tunai</option><option>QRIS</option><option>Transfer</option></select>')}${field("Nominal diterima (Rp)", `<input name="paid" type="number" min="${total}" step="any" value="${total || ""}" required>`)}<p class="muted" id="change">Kembalian ${money(0)}</p><button type="submit" class="primary full" ${cart.length ? "" : "disabled"}>Simpan transaksi</button></form></aside></div>`;
}
function stockPage() {return inventoryPanel(state,store,stockFilter,"stock")+`<details class="inventory-history"><summary>Rincian penerimaan, asal barang & riwayat pergerakan</summary>${stockHistoryPage()}</details>`;}
function stockHistoryPage() {
  const lots = state.lots.filter((l) => l.storeId === store);
  return `${unitStockPanel(state, store)}<section class="panel">${inventoryTable(lots)}</section><section class="panel"><h3>Rincian asal barang</h3><div class="table-wrap"><table><thead><tr><th>ID / TANGGAL MASUK</th><th>PRODUK</th><th>SUPPLIER</th><th class="numeric">AWAL KG / BUTIR</th><th class="numeric">SISA KG / BUTIR</th><th>CATATAN</th></tr></thead><tbody>${lots.map((l) => `<tr><td><b>${short(l.id)}</b><small>${l.date}${l.sourceLotId ? " · transfer" : ""}</small></td><td>${e(name("products", l.productId))}</td><td>${e(name("suppliers", l.supplierId))}</td><td class="numeric">${num(l.receivedKg)} kg / ${l.receivedPieces}</td><td class="numeric"><b>${num(l.kg)} kg</b><small>${l.pieces} butir</small></td><td>${e(l.note || "—")}${l.weighings?.length ? `<br><button type="button" data-weigh-history="${e(l.id)}">Riwayat timbang</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Belum ada barang masuk.</td></tr>'}</tbody></table></div></section><section class="panel"><h3>Riwayat waste, pemakaian dapur & transfer</h3><div class="table-wrap"><table><thead><tr><th>TANGGAL</th><th>JENIS</th><th>PRODUK / SUPPLIER</th><th class="numeric">KG / BUTIR</th><th>CATATAN</th></tr></thead><tbody>${
    state.movements
      .filter((x) => x.storeId === store || x.toStoreId === store)
      .slice()
      .reverse()
      .map(
        (x) =>
          `<tr><td>${x.date}</td><td>${e(x.kind)}</td><td>${e(name("products", x.productId))}<small style="display:block">${e(name("suppliers", x.supplierId))}</small></td><td class="numeric">${num(x.kg)} kg / ${x.pieces}</td><td>${e(x.note)}${x.toStoreId ? " · " + e(name("stores", x.toStoreId)) : ""}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="5" class="empty">Belum ada pergerakan stok.</td></tr>'
  }</tbody></table></div></section>`;
}
function reportPage() {
  const rows = saleRows(state, filter),
    s = summarize(rows),
    groups = state.suppliers.map((p) => ({
      p,
      s: summarize(rows.filter((r) => r.supplierId === p.id)),
    }));
  return `<div class="intro"><div><h2>Omzet & pemakaian stok</h2><div class="muted">Pisahkan cara jual, tetap lacak kg yang keluar.</div></div><button id="export-csv">Ekspor CSV</button></div><form id="filters" class="filters">${field("Dari", `<input type="date" name="from" value="${filter.from}" required>`)}${field("Sampai", `<input type="date" name="to" value="${filter.to}" required>`)}${field("Store", `<select name="store">${options("stores", filter.store, true)}</select>`)}${field("Supplier", `<select name="supplier">${options("suppliers", filter.supplier, true)}</select>`)}<button class="primary">Terapkan</button></form><div class="stats">${stat("Total omzet", money(s.total), new Set(rows.map((x) => x.saleId)).size + " transaksi")}${stat("Omzet per kg", money(s.kgRevenue), num(rows.filter((x) => x.unit === "KG").reduce((a, r) => a + r.kg, 0)) + " kg terjual")}${stat("Omzet per butir", money(s.pieceRevenue), num(s.pieceKg) + " kg stok terpakai")}${stat("Total stok terjual", num(s.kg) + " kg", num(s.pieces) + " butir")}</div><section class="panel"><h3>Penjualan per supplier</h3><div class="table-wrap"><table><thead><tr><th>SUPPLIER</th><th class="numeric">OMZET PER KG</th><th class="numeric">OMZET PER BUTIR</th><th class="numeric">KG UNTUK JUAL BUTIR</th><th class="numeric">TOTAL KG / BUTIR</th><th class="numeric">TOTAL OMZET</th></tr></thead><tbody>${groups.map(({ p, s }) => `<tr><td><b>${e(p.name)}</b></td><td class="numeric">${money(s.kgRevenue)}</td><td class="numeric">${money(s.pieceRevenue)}</td><td class="numeric"><b>${num(s.pieceKg)} kg</b></td><td class="numeric">${num(s.kg)} kg / ${s.pieces}</td><td class="numeric"><b>${money(s.total)}</b></td></tr>`).join("")}</tbody></table></div></section><section class="panel"><h3>Detail penjualan</h3>${salesTable(rows.slice().reverse())}</section><section class="panel"><h3>Transaksi dibatalkan</h3>${
    state.sales
      .filter(
        (x) =>
          x.voided &&
          (!filter.store || x.storeId === filter.store) &&
          x.date >= filter.from &&
          x.date <= filter.to,
      )
      .map(
        (x) =>
          `<p class="muted"><b>#${short(x.id)}</b> · ${x.date} · ${money(x.total)} · ${e(x.voidReason)}</p>`,
      )
      .join("") ||
    '<p class="muted">Tidak ada pembatalan dalam periode ini.</p>'
  }</section>`;
}
function productsPage() {
  return catalogPanel(state.products,catalogFilter,state,store);
}
function directoryPage(kind) {
  if(kind === "stores")return storesPage(state);
  const isStore = kind === "stores",
    label = isStore ? "Store" : "Supplier";
  return `<div class="intro"><div><h2>Master ${label}</h2><p class="muted">${isStore ? "Ubah nama toko dan lokasi melalui tombol Edit toko." : "Kelola supplier, nomor telepon, dan alamat."}</p></div><button class="primary" data-master="${kind}">Tambah ${label}</button></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>NAMA</th>${isStore ? "<th>LOKASI</th>" : "<th>NOMOR TELEPON</th><th>ALAMAT</th>"}<th>ACTION</th></tr></thead><tbody>${state[kind].map((p) => `<tr><td><b>${e(p.name)}</b></td>${isStore ? `<td>${e(p.location || "—")}</td>` : `<td>${e(p.phone || "—")}</td><td>${e(p.address || "—")}</td>`}<td><button class="small" data-edit-kind="${kind}" data-edit-id="${e(p.id)}">${icon("edit")}${isStore ? "Edit toko" : "Edit"}</button></td></tr>`).join("") || `<tr><td colspan="${isStore ? 3 : 4}" class="empty">Belum ada ${label.toLowerCase()}.</td></tr>`}</tbody></table></div></section>`;
}
function render() {
  sidebar.capture();
  app.innerHTML = shell(
    {
      ...Object.fromEntries(opsPages.map(key=>[key,()=>opsPage(key,state,store)])),
      dashboard,
      recipes: () => recipesPage(state, store),
      production: () => productionPage(state, store),
      cashier,
      stock: stockPage,
      waste: () => wastePage(state, store),
      losses: () => wastePage(state, store),
      batches: () => batchReportPage(state,store),
      reports: reportPage,
      products: productsPage,
      stores: () => directoryPage("stores"),
      suppliers: () => directoryPage("suppliers"),
    }[view](),
  );
  syncThemeControls();
  sidebar.mount();
  document.querySelector("#stock-demo-toggle")?.addEventListener("click",()=>switchStockDemo());
  document.querySelector("#stock-demo-reset")?.addEventListener("click",()=>switchStockDemo(true));
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        if (!mayLeave(busy)) return;
        view = b.dataset.view;
        sidebar.navigate();
        render();
      }),
  );
  document.querySelector("#active-store").onchange = (ev) => {
    if (!mayLeave(busy)) {
      ev.target.value = store;
      return;
    }
    if (
      cart.length &&
      !confirm("Ganti store akan mengosongkan pesanan. Lanjutkan?")
    ) {
      ev.target.value = store;
      return;
    }
    store = ev.target.value;
    cart = [];
    clearOrderDraft();
    render();
  };
  document.querySelector("#logout").onclick = () => {
    if (!mayLeave(busy)) return;
    if (cart.length && !confirm("Keluar dan kosongkan pesanan?")) return;
    token = "";
    refreshToken = "";
    expires = 0;
    mode = "";demoSource=null;lastSale=null;
    stateRevision++;
    seenKitchen.clear();
    cart = [];
    state = emptyState();
    view = "dashboard";
    clearOrderDraft();
    login();
  };
  document
    .querySelectorAll("[data-receipt]")
    .forEach((b) => (b.onclick = () => receipt(b.dataset.receipt)));
  document.querySelectorAll('[data-weigh-history]').forEach(b => b.onclick = () => {
    const lot = state.lots.find(l => l.id === b.dataset.weighHistory);
    if (lot) showWeighingHistory(lot, { modal });
  });
  const pending = mode === "live" ? pendingRetry() : null;
  if (pending) {
    const box = document.createElement("div");
    box.className = "notice";
    box.innerHTML =
      '<b>Ada pengiriman yang belum terkonfirmasi.</b> <button id="recover-pending">Periksa / kirim ulang</button>';
    document.querySelector("main").prepend(box);
    box.querySelector("button").onclick = async () => {
      try {
        await refresh();
        if (
          pendingRetry() &&
          confirm("Kirim ulang data transaksi sebelumnya dengan ID yang sama?")
        ) {
          if (await mutate(pending.action, { ...pending.payload })) {
            if (pending.action === "sale") cart = [];
            if (pending.action === "order_create") clearOrderDraft();
            render();
          }
        } else render();
      } catch (error) {
        toast(error.message);
      }
    };
  }
  bindOps(view,state,store,{...storeContext(),refresh,getState:()=>state,employeeDocument:employeeId=>request("/rest/v1/rpc/pos_employee_document",{employee_id:employeeId}),createAccount:async(employeeId,password,action="create")=>{
    if(mode!=="live")throw Error("Akun hanya dapat dibuat saat login database.");
    await request("/rest/v1/rpc/pos_account_target",{employee_id:employeeId});
    if(mode!=="live")throw Error("Akun hanya dapat dibuat saat login database.");
    const res=await fetch("/api/pos-employee",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({employeeId,password,action})});
    const data=await res.json();if(!res.ok)throw Error(data.error||"Gagal membuat akun");return data;
  }});
  bindKitchenSound();
  observeKitchen();
  trackForms();
  bindProduction(view, state, store, { modal, mutate, render, toast, refresh });
  if(view === "batches") bindBatchReport(state,store,{modal,refresh,render,toast});
  bindWaste(view, state, store, {
    getState:()=>state,
    loadRejectEvidence: async recordId => mode === "stock-demo" ? state.rejectRecords.find(r=>r.id===recordId)?.evidence : request("/rest/v1/rpc/pos_reject_evidence",{record_id:recordId}),
    modal,
    mutate,
    render,
    toast,
    refresh,
    loadEvidence: async (wasteId) =>
      mode === "stock-demo"
        ? state.wasteRuns.find((x) => x.id === wasteId)?.evidence
        : request("/rest/v1/rpc/pos_waste_evidence", { waste_id: wasteId }),
  });
  if (view === "cashier") {
    document
      .querySelectorAll("[data-product]")
      .forEach((b) => (b.onclick = () => addItem(b.dataset.product)));
    document.querySelectorAll("[data-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          cart.splice(Number(b.dataset.remove), 1);
          render();
        }),
    );
    document.querySelector("#reload").onclick = async () => {
      try {
        await refresh();
        render();
        toast("Stok diperbarui");
      } catch (err) {
        toast(err.message);
      }
    };
    const form = document.querySelector("#checkout");
    form.paid.oninput = () => {
      const change =
        Number(form.paid.value) - cart.reduce((a, l) => a + l.total, 0);
      document.querySelector("#change").textContent =
        change < 0 ? "Kurang " + money(-change) : "Kembalian " + money(change);
    };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const payload = {
        ...Object.fromEntries(new FormData(form)),
        id: id(),
        storeId: store,
        paid: Number(form.paid.value),
        lines: cart,
      };
      if (await mutate("sale", payload)) {
        lastSale = payload.id;
        cart = [];
        render();
        toast("Transaksi tersimpan. Stok kg dan butir berkurang.");
        receipt(lastSale);
      }
    };
  }
  if (view === "stock") {
    bindInventory(state,store,stockFilter,"stock",{modal,mutate,render,toast,getState:()=>state});
    document.querySelector("#add-receipt").onclick = () => {
      const d = modal(
        "Barang masuk",
        '<p>Pilih jenis barang yang diterima.</p><button type="button" id="receive-durian">Durian utuh (kg + butir)</button> <button type="button" id="receive-unit">Bahan / produk satuan</button>',
      );
      d.querySelector("button[type=submit]").hidden = true;
      d.querySelector("#receive-durian").onclick = () => {
        d.close();
        addReceipt();
      };
      d.querySelector("#receive-unit").onclick = () => {
        d.close();
        receiptDialog(state, store, { modal, mutate, render, toast });
      };
    };
    document.querySelector("#movement").onclick = movement;
  }
  if (view === "reports") {
    document.querySelector("#filters").onsubmit = (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.currentTarget));
      if (f.from > f.to) return toast("Tanggal awal melebihi tanggal akhir");
      Object.assign(filter, f);
      render();
    };
    document.querySelector("#export-csv").onclick = exportCSV;
  }
  if (["products", "stores", "suppliers"].includes(view)) {
    if (view === "products") {
      document.querySelector("#add-catalog-product").onclick = () =>
        productDialog({ state, store, modal, mutate, render, toast });
      bindInventory(state,store,catalogFilter,"products",{modal,mutate,render,toast,getState:()=>state,addProductVariant:productId=>productVariantDialog({productId,state,modal,mutate,render,toast}),addVariant:groupId=>variantGroupDialog({groupId,state,modal,mutate,render,toast}),edit:key=>productDialog({product:state.products.find(p=>p.id===key),state,store,modal,mutate,render,toast})});
    }
    document
      .querySelectorAll("[data-edit-kind]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            editMasterDetails(b.dataset.editKind, b.dataset.editId)),
      );
    document
      .querySelectorAll("[data-master]")
      .forEach((b) => (b.onclick = () => addMaster(b.dataset.master)));

  }
}
function modal(title, body, submitLabel = "Simpan") {
  const d = document.createElement("dialog");
  d.className = "modal";
  d.innerHTML = `<div class="modal-head"><h2>${mode==="stock-demo"?"DEMO · ":""}${title}</h2><button type="button" class="close" aria-label="Tutup">×</button></div><form>${body}<p class="error" id="form-error"></p><div class="modal-actions"><button type="button" class="close">Batal</button><button class="primary" type="submit">${submitLabel}</button></div></form>`;
  document.body.append(d);
  const canClose = () =>
    !busy &&
    (d.dataset.dirty !== "true" ||
      confirm("Isian belum disimpan. Tutup form ini?"));
  d.addEventListener("input", () => (d.dataset.dirty = "true"));
  d.addEventListener("change", () => (d.dataset.dirty = "true"));
  d.querySelectorAll(".close").forEach(
    (b) =>
      (b.onclick = () => {
        if (canClose()) d.close();
      }),
  );
  d.addEventListener("cancel", (ev) => {
    if (!canClose()) ev.preventDefault();
  });
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}
function addItem(productId) {
  const product = state.products.find((x) => x.id === productId),
    lots = state.lots.filter(
      (l) =>
        l.productId === productId &&
        l.storeId === store &&
        l.kg > 0 &&
        l.pieces > 0,
    );
  const d = modal(
    "Tambah " + e(product.name),
    `${field("Asal barang / supplier", `<select name="lotId" required>${lots.map((l) => `<option value="${e(l.id)}">${e(name("suppliers", l.supplierId))} · ${l.date} · ${short(l.id)} · ${num(l.kg)} kg / ${l.pieces} butir</option>`).join("")}</select>`)}<div class="form-grid">${field("Cara jual", '<select name="unit"><option value="KG">Per kilogram</option><option value="BUTIR">Per butir</option></select>')}${field("Harga per satuan (Rp)", `<input name="price" type="number" min="0.01" step="any" value="${product.priceKg}" required>`)}${field("Berat ditimbang (kg)", '<input name="kg" type="number" min="0.000001" step="any" required placeholder="Contoh: 2,5">')}${field("Jumlah butir", '<input name="pieces" type="number" min="1" step="1" value="1" required>')}</div><div class="callout">Penjualan per butir tetap wajib ditimbang. Pilih asal barang yang sesuai dengan durian fisiknya.</div><div class="total"><span>Subtotal</span><span id="subtotal">${money(0)}</span></div>`,
    "Tambah ke pesanan",
  );
  const f = d.querySelector("form");
  const update = () => {
    document.querySelector("#subtotal").textContent = money(
      Number(f.price.value) *
        (f.unit.value === "KG" ? Number(f.kg.value) : Number(f.pieces.value)),
    );
  };
  f.unit.onchange = () => {
    f.price.value =
      f.unit.value === "KG" ? product.priceKg : product.pricePiece;
    update();
  };
  f.oninput = update;
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const x = Object.fromEntries(new FormData(f)),
      l = lots.find((l) => l.id === x.lotId),
      kg = Number(x.kg),
      pieces = Number(x.pieces),
      price = Number(x.price);
    const used = cart.filter((c) => c.lotId === l.id);
    if (
      kg + used.reduce((a, x) => a + x.kg, 0) > l.kg + 1e-9 ||
      pieces + used.reduce((a, x) => a + x.pieces, 0) > l.pieces
    ) {
      d.querySelector("#form-error").textContent =
        "Jumlah melebihi stok setelah pesanan sebelumnya.";
      return;
    }
    cart.push({
      ...x,
      kg,
      pieces,
      price,
      productId,
      supplierId: l.supplierId,
      total: (x.unit === "KG" ? kg : pieces) * price,
    });
    d.close();
    render();
  };
}
function addReceipt() {
  openWeighingReceipt(state, store, { modal, mutate, render, toast });
}

function movement() {
  const lots = state.lots.filter(
    (l) => l.storeId === store && l.kg > 0 && l.pieces > 0,
  );
  if (!lots.length) return toast("Tidak ada stok tersedia");
  const d = modal(
    "Transfer / pemakaian",
    `${field("Asal barang", `<select name="lotId">${lots.map((l) => `<option value="${e(l.id)}">${e(name("products", l.productId))} · ${e(name("suppliers", l.supplierId))} · ${short(l.id)}</option>`).join("")}</select>`)}<div class="form-grid">${field("Tanggal", `<input name="date" type="date" value="${today()}" required>`)}${field("Jenis", '<select name="kind"><option>Pemakaian dapur</option><option>Transfer</option></select>')}${field("Berat keluar (kg)", '<input name="kg" type="number" min="0.000001" step="any" required>')}${field("Butir keluar", '<input name="pieces" type="number" min="1" step="1" required>')}</div><div id="destination" hidden>${field("Store tujuan", `<select name="toStoreId">${options("stores")}</select>`)}</div>${field("Catatan / alasan", '<input name="note" required maxlength="300">')}<p class="form-help">Pemakaian dapur hanya mengurangi stok. Untuk mencatat hasil olahan durian, gunakan menu Waste & Olahan.</p>`,
  );
  const f = d.querySelector("form");
  f.kind.onchange = () =>
    (d.querySelector("#destination").hidden = f.kind.value !== "Transfer");
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const p = { ...Object.fromEntries(new FormData(f)), id: id() };
    if (p.kind !== "Transfer") delete p.toStoreId;
    if (await mutate("movement", p)) {
      d.close();
      render();
      toast("Pergerakan stok tersimpan");
    }
  };
}
function addMaster(kind) {
  if(kind === "stores")return storeDialog(state,{...storeContext(),render:()=>{store=store||state.stores[0]?.id||"";render();}});
  if (kind === "products")
    return productDialog({ state, store, modal, mutate, render, toast });
  const masterId = id();
  const d = modal(
    "Tambah " +
      { products: "produk", stores: "store", suppliers: "supplier" }[kind],
    `${field("Nama", '<input name="name" required maxlength="100">')}${kind === "products" ? `${field("SKU", '<input name="sku" required maxlength="40" placeholder="DUR-004">')}<div class="form-grid">${field("Harga jual per kg (Rp)", '<input name="priceKg" type="number" min="0.01" step="any" required>')}${field("Harga jual per butir (Rp)", '<input name="pricePiece" type="number" min="0.01" step="any" required>')}</div>` : masterDetailFields(kind)}`,
  );
  d.querySelector("form").onsubmit = async (ev) => {
    ev.preventDefault();
    if (
      await mutate("master", {
        ...Object.fromEntries(new FormData(ev.currentTarget)),
        id: masterId,
        kind,
      })
    ) {
      store = store || state.stores[0]?.id || "";
      d.close();
      render();
      toast("Master tersimpan");
    }
  };
}
function receipt(saleId) {
  const s = state.sales.find((x) => x.id === saleId);
  if (!s) return;
  const d = document.createElement("dialog");
  d.className = "modal receipt-dialog";
  const lines = [
    "#" + short(s.id) + " · " + s.date,
    "--------------------------------",
    ...s.lines.flatMap((l) => [
      name("products", l.productId),
      `${num(l.kg)} kg / ${l.pieces} butir · per ${l.unit}`,
      `${money(l.price)} × ${num(l.unit === "KG" ? l.kg : l.pieces)} = ${money(l.total)}`,
    ]),
    "--------------------------------",
    "TOTAL       " + money(s.total),
    "PEMBAYARAN  " + s.payment,
    "DITERIMA    " + money(s.paid),
    "KEMBALIAN   " + money(s.change),
    ...(s.voided ? ["DIBATALKAN: " + s.voidReason] : []),
  ];
  d.innerHTML = `<div class="modal-head"><h2>Struk transaksi</h2><button id="close-receipt" aria-label="Tutup">×</button></div><div class="receipt-print">${receiptHeader(state.stores.find(x=>x.id===s.storeId))}<div class="receipt-plain">${e(lines.join("\n"))}</div></div><div class="modal-actions">${!s.voided ? '<button class="danger" id="void-sale">Batalkan transaksi</button>' : ""}<button class="primary" id="print">Cetak</button></div>`;
  document.body.append(d);
  d.oncancel = (ev) => {
    if (busy) ev.preventDefault();
  };
  d.onclose = () => d.remove();
  d.querySelector("#close-receipt").onclick = () => d.close();
  const outlet=state.stores.find(x=>x.id===s.storeId);
  fillReceiptLogo(d,outlet,storeContext()).catch(error=>toast(error.message));
  d.querySelector("#print").onclick = async () => {
    const button=d.querySelector("#print");if(button.disabled)return;button.disabled=true;
    try{await fillReceiptLogo(d,outlet,storeContext());if(d.hasAttribute('open'))await printReceipt(d.querySelector('.receipt-print'));}catch(error){toast(error.message);}finally{button.disabled=false;}
  };
  d.querySelector("#void-sale")?.addEventListener("click", async () => {
    const reason = prompt("Alasan pembatalan (stok akan dikembalikan):");
    if (!reason?.trim()) return;
    if (await mutate("void", { id: id(), saleId, reason })) {
      d.close();
      render();
      toast("Transaksi dibatalkan dan stok dikembalikan");
    }
  });
  d.showModal();
}
function exportCSV() {
  const rows = saleRows(state, filter);
  const q = (x) =>
    '"' +
    String(x ?? "")
      .replace(/^[=+@-]/, "'")
      .replaceAll('"', '""') +
    '"';
  const lines = [
    [
      "Tanggal",
      "Transaksi",
      "Store",
      "SKU",
      "Produk",
      "Supplier",
      "ID Masuk",
      "KG Terjual",
      "Butir",
      "Satuan Jual",
      "Harga Satuan",
      "Omzet",
    ],
    ...rows.map((r) => [
      r.date,
      r.saleId,
      name("stores", r.storeId),
      state.products.find((p) => p.id === r.productId)?.sku,
      name("products", r.productId),
      name("suppliers", r.supplierId),
      r.lotId,
      r.kg,
      r.pieces,
      r.unit,
      r.price,
      r.total,
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + lines.map((l) => l.map(q).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${mode==="stock-demo"?"DEMO-":""}penjualan-${filter.from}-${filter.to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
try {
  const r = await fetch("/api/pos-config", { signal: AbortSignal.timeout(15000) });
  config = r.ok ? await r.json() : {};
} catch {
  config = {};
}
login();

function masterDetailFields(kind, p = {}) {
  return kind === "stores"
    ? field(
        "Lokasi store (opsional)",
        `<input name="location" maxlength="300" value="${e(p.location || "")}" placeholder="Alamat atau lokasi store">`,
      )
    : `${field("Nomor telepon (opsional)", `<input name="phone" type="tel" maxlength="40" value="${e(p.phone || "")}" placeholder="08… atau +62…">`)}${field("Alamat supplier (opsional)", `<input name="address" maxlength="300" value="${e(p.address || "")}" placeholder="Alamat lengkap">`)}`;
}
function editMasterDetails(kind, recordId) {
  if(kind === "stores")return storeDialog(state,storeContext(),state.stores.find(s=>s.id===recordId));
  const p = state[kind]?.find((x) => x.id === recordId);
  if (!p || !["stores", "suppliers"].includes(kind)) return;
  const editRequestId = id();
  const d = modal(kind === "stores" ? "Edit toko" : "Edit " + e(p.name),
    (kind === "stores" ? field("Nama toko", `<input name="name" required maxlength="100" value="${e(p.name)}" autocomplete="organization">`) : "") + masterDetailFields(kind, p));
  d.querySelector("form").onsubmit = async (ev) => {
    ev.preventDefault();
    if (
      await mutate("master_details", {
        ...Object.fromEntries(new FormData(ev.currentTarget)),
        id: recordId,
        editRequestId,
        kind,
      })
    ) {
      d.close();
      render();
      toast("Detail tersimpan");
    }
  };
}

// Poll only the signed-in POS session; keep order inputs intact while refreshing stock.

function beepKitchen(){
 if(!soundEnabled||!audioContext)return;
 const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
 oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.frequency.value=880;
 gain.gain.setValueAtTime(.12,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.5);
 oscillator.start();oscillator.stop(audioContext.currentTime+.5);
}
function bindKitchenSound(){
 const button=document.querySelector('#kitchen-sound');if(!button)return;
 button.textContent=soundEnabled?'Suara aktif':'Aktifkan suara';button.setAttribute('aria-pressed',String(soundEnabled));
 button.onclick=async()=>{try{if(!soundEnabled){audioContext ||= new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();}soundEnabled=!soundEnabled;bindKitchenSound();beepKitchen();}catch{toast('Suara tidak tersedia di browser ini. Notifikasi layar tetap aktif.');}};
}
function observeKitchen(){
 if(view!=='kitchen')return;
 const orders=(state.orders||[]).filter(o=>o.store_id===store&&o.lines.some(l=>l.itemType==='recipe')&&(o.payment_status==='paid'||(!o.payment_status&&o.status==='paid')));
 const previous=seenKitchen.get(store);
 const incoming=previous?orders.filter(o=>o.status==='queued'&&!previous.has(o.id)):[];
 seenKitchen.set(store,new Set(orders.map(o=>o.id)));
 if(incoming.length){toast(`${incoming.length} pesanan baru masuk ke kitchen`);beepKitchen();}
}
setInterval(async()=>{
 if(mode!=='live'||busy||polling||!['orders','kitchen','discounts'].includes(view))return;
 polling=true;const revision=stateRevision,sessionToken=token;
 try{
  const fresh=await request('/rest/v1/rpc/pos_read',{});
  if(mode!=='live'||busy||revision!==stateRevision||sessionToken!==token)return;
  state=fresh;observeKitchen();
  if(['kitchen','discounts'].includes(view)&&!document.querySelector('dialog[open]'))render();
  else document.querySelector('#order-products')?.dispatchEvent(new CustomEvent('stock-refresh',{detail:state}));
  const status=document.querySelector('#kitchen-sync');if(status)status.textContent='Terhubung · diperbarui '+new Date().toLocaleTimeString('id-ID');
 }catch(err){if(mode!=='live'||revision!==stateRevision||sessionToken!==token)return;const status=document.querySelector('#kitchen-sync');if(status)status.textContent='Koneksi terputus. Mencoba lagi otomatis; tekan Perbarui untuk mencoba sekarang.';}
 finally{polling=false;}
},5000);
