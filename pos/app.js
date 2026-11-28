import { officeInventoryPage, bindOfficeInventory } from "./office-inventory-ui.mjs";
import { costPricesPage } from "./cost-prices-ui.mjs";
import { outboundPage } from "./outbound-ui.mjs";
import { confirmAction, requestReason } from "../shared/confirmation.mjs";
import { pricesForBranch } from "./branch-prices.mjs";
import { prepareBarcodeInput } from "./barcode-scanner.mjs";
import { createBackNavigation } from "./back-navigation.mjs";
import { homePage, bindHome } from "./home-ui.mjs";
import { supplierDialog, bindSupplierSelect } from "./supplier-ui.mjs";
import { commitMutation } from "./data/mutations.mjs";
import { branchPreparationPage } from "./branch-notes-ui.mjs";
import { supplyActions, location } from "./warehouse-flow.mjs";
import {
  supplyHome,
  transfersPage,
  pricingPage,
  supplierNotesPage,
  servicePage,
  cuttingPage,
  bindSupply,
  openDispatch,
  openWarehouseReceipt,
} from "./warehouse-ui.mjs";
import { spacesFor, spaceTitles, defaultSpace, storePageTitles } from "./workspaces.mjs";
import { resetCustomerDisplay } from "./customer-display-channel.mjs";
import { openFruitTransfer } from "./fruit-transfer-ui.mjs";
import { crmPage, bindCrm, memberFields, bindMemberPicker } from "./crm-ui.mjs";
import { paymentsPage, bindPayments, paymentOptions } from "./payment-methods-ui.mjs";
import { availablePayments, requireEnabledPayment } from "./payment-methods.mjs";
import { validPayment } from "./cashier.mjs";
import {
  shiftBanner,
  bindShiftBanner,
  shiftsPage,
  bindShiftsPage,
} from "./cashier-shifts-ui.mjs";
import { activeShift, cashierName, readShiftsDemo } from "./cashier-shifts.mjs";
import {
  dashboardPage,
  bindDashboard,
  resetDashboard,
  followDashboardStore,
} from "./dashboard-ui.mjs";
import { createSessionManager } from "./session.mjs";
import { installButton, bindInstall } from "./pwa.mjs";
import { pettyPanel, bindPetty } from "./petty-cash-ui.mjs";
import {
  expenseDialog,
  reportsPage,
  bindReports,
  selectReportTab,
} from "./reports-ui.mjs";
import { documentsPage, bindDocuments } from "./documents-ui.mjs";
import { variantGroupDialog, productVariantDialog } from "./variant-editor.mjs";
import { createSidebarController, sidebarIcon } from "./sidebar.mjs";
import { systemDock, bindDockSettings } from "./system-dock.mjs";
import { installMoneyInputs } from "./money-input.mjs";
import { openWeighingReceipt, showWeighingHistory } from "./receipt-weighing.mjs";
import { inventoryPanel, bindInventory } from "./inventory-ui.mjs";
import {
  opsPages,
  opsPage,
  bindOps,
  clearOrderDraft,
  hasOrderDraft,
} from "./operations-ui.mjs";
import { printReceipt } from "./receipt-printer.mjs";
import {
  storesPage,
  storeDialog,
  locationLabel,
  locationOptions,
} from "./store-settings.mjs";
import { receiptHeader, fillReceiptLogo } from "./store-profile.mjs";
import {
  navigation,
  pageTitles as title,
  pageIcon as icon,
  visibleSections,
  hasUnsavedForm,
  confirmLeave,
  trackForms,
} from "./navigation.mjs";
import {
  prepareRetry,
  settleRetry,
  reconcileRetry,
  pendingRetry,
  setRetryScope,
} from "./retry.mjs";
import { wastePage, bindWaste } from "./waste-ui.mjs";
import {
  recipesPage,
  productionPage,
  unitStockPanel,
  receiptDialog,
  bindProduction,
} from "./production-ui.mjs";
import { today, money, num, escape as e, id, emptyState } from "./core.mjs";
import { isLegacyStock } from "./catalog.mjs";
import { catalogPanel, productDialog } from "./catalog-ui.mjs";

import { storeExpensesPage, bindStoreExpenses } from "./store-expenses-ui.mjs";

let workspace = "";
let hideHomeTotal = false;
let officePage = "",
  officeBranch = "";
function workspaceAccess() {
  return {
    ...state.access,
    branchNotes: state.branchNoteVersion >= 135 && !state.stockDemo,
    branchStock: state.branchStockVersion >= 132 && !state.stockDemo,
    legacyOutbound: !!state.outboundOrders?.length,
    pettyCash: state.pettyCashVersion >= 130 && !state.stockDemo,
    cashierExpenses: state.cashierExpenseVersion >= 128 && !state.stockDemo,
    cashierOwner: state.me?.role === "owner",
    crmAdmin: ["owner", "admin"].includes(state.me?.role),
    ...(state.warehouseVersion && !state.stockDemo
      ? { workspace: workspace || defaultSpace(state) }
      : {}),
  };
}
function workspaceSwitch() {
  return state.warehouseVersion && !state.stockDemo
    ? `<div class="workspace-switch" role="group" aria-label="Area kerja">${spacesFor(
        state,
      )
        .map(
          (k) =>
            `<button type="button" data-workspace="${k}" aria-pressed="${workspace === k}">${k === "warehouse" && state.branchStockVersion >= 132 ? "Gudang lama" : spaceTitles[k]}</button>`,
        )
        .join("")}</div>`
    : "";
}

const sidebar = createSidebarController();

installMoneyInputs();

const storeContext = () => ({
  displayHost: (payload) => {
    if (mode !== "live") throw Error("Sambungan tablet tersedia pada mode operasional.");
    return request("/rest/v1/rpc/pos_customer_display_host", payload);
  },
  modal,
  mutate,
  render,
  toast,
  crmRead: async (payload) => {
    const session = activeSessionId,
      currentMode = mode,
      demoSession = state.stockDemo?.sessionId;
    const data = await adminRpc("pos_crm_read", { payload });
    if (
      session !== activeSessionId ||
      currentMode !== mode ||
      demoSession !== state.stockDemo?.sessionId
    )
      throw Error("Sesi berubah. Buka kembali CRM.");
    return data;
  },
  demo: mode === "stock-demo",
  loadStoreLogo: (storeId, version) =>
    request("/rest/v1/rpc/pos_store_logo", {
      store_id: storeId,
      expected_version: version || null,
    }),
});

const themeKey = "maniac-pos-theme";
function themeButton(extraClass = "") {
  return `<button type="button" class="small theme-toggle ${extraClass}" data-theme-toggle aria-label="Ganti tema"><svg class="theme-light-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><svg class="theme-dark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/></svg><span data-theme-label></span></button>`;
}
function syncThemeControls() {
  const dark = document.documentElement.dataset.theme === "dark";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#172019" : "#f3f0df");
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute(
      "aria-label",
      dark ? "Aktifkan mode light" : "Aktifkan mode dark",
    );
    button.setAttribute("aria-pressed", String(dark));
    button.querySelector("[data-theme-label]").textContent = dark ? "Dark" : "Light";
  });
}
document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-theme-toggle]")) return;
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(themeKey, theme);
  } catch {
    /* Theme still works when storage is unavailable. */
  }
  syncThemeControls();
});
window.addEventListener("storage", (event) => {
  handleSessionStorage(event);
  if (event.key === themeKey && ["light", "dark"].includes(event.newValue)) {
    document.documentElement.dataset.theme = event.newValue;
    syncThemeControls();
  }
});
let sessions,
  activeSessionId = "",
  loginAttempt = 0,
  authBusy = false,
  startupBusy = false;
const stockFilter = {};
const catalogFilter = { query: "", category: "", itemType: "" };
let stateRevision = 0,
  polling = false,
  soundEnabled = false,
  audioContext;
let reportRefreshPending = false,
  reportRefreshRevision = 0;
const seenKitchen = new Map();
let state = emptyState(),
  mode = "",
  config = {},
  token = "",
  view = "dashboard",
  store = "",
  cart = [],
  busy = false,
  lastSale = null;
const app = document.querySelector("#app");
const name = (kind, k) => state[kind].find((x) => x.id === k)?.name || "—";
const short = (k) =>
  k.startsWith("demo") ? k.toUpperCase() : k.slice(0, 8).toUpperCase();
const field = (label, html) => `<div class="field"><label>${label}</label>${html}</div>`;
function toast(text, duration = 5000) {
  const t = document.querySelector("#toast");
  t.textContent = (mode === "stock-demo" ? "Demo · " : "") + text;
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = "none"), duration);
}
const backNavigation = createBackNavigation({
  atHome: () =>
    (!activeSessionId || view === "home") &&
    !busy &&
    !authBusy &&
    !startupBusy &&
    !document.querySelector('dialog[open], .shell[data-mobile-open="true"]'),
  returnHome: async () => {
    if (busy || authBusy || startupBusy) return toast("Tunggu proses selesai.");
    if (!activeSessionId) return;
    const sessionId = activeSessionId;
    if (sessions?.read()?.sessionId !== sessionId)
      return handleSessionStorage({ key: null });
    const confirmation = document.querySelector("dialog.brand-confirmation[open]");
    if (confirmation) {
      confirmation.querySelector("[data-cancel]")?.click();
      return;
    }
    if (
      (hasUnsavedForm() || document.querySelector('dialog[open][data-dirty="true"]')) &&
      !(await confirmLeave())
    )
      return;
    if (busy || sessionId !== activeSessionId) return;
    document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
    view = "home";
    sidebar.navigate();
    render();
    window.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
  },
  warnExit: (duration) => {
    toast(
      (cart.length || hasOrderDraft() ? "Ada pesanan belum dibayar. " : "") +
        "Tekan Kembali sekali lagi untuk keluar.",
      duration,
    );
    const warningTimer = toast.timer;
    return () => {
      if (toast.timer === warningTimer)
        document.querySelector("#toast").style.display = "none";
    };
  },
});
let stockDemoModule,
  demoSource = null;
const demoEngine = () =>
  (stockDemoModule ||= import("./stock-demo.mjs").catch((error) => {
    stockDemoModule = null;
    throw error;
  }));
async function adminRpc(name, p) {
  if (mode !== "stock-demo") {
    const sessionId = activeSessionId,
      currentMode = mode;
    const data = await request("/rest/v1/rpc/" + name, p);
    if (sessionId !== activeSessionId || currentMode !== mode)
      throw Error("Sesi berubah. Buka kembali halaman.");
    return data;
  }
  const snapshot = state,
    engine = await demoEngine();
  if (mode !== "stock-demo" || state !== snapshot)
    throw Error("Sesi demo berubah. Buka kembali dokumen.");
  return engine.readStockDemo(snapshot, name, p);
}
function assertDemoRequest(path, allowDemoRead) {
  if (
    mode === "stock-demo" &&
    !(
      allowDemoRead &&
      ["/rest/v1/rpc/pos_read", "/auth/v1/token?grant_type=refresh_token"].includes(path)
    )
  )
    throw Error("Mode demo tidak mengirim perubahan ke database asli.");
}
async function switchStockDemo(reset = false) {
  if (busy || !["live", "stock-demo"].includes(mode)) return;
  if (reset && mode !== "stock-demo") return;
  if (document.querySelector("dialog[open]"))
    return toast("Tutup pop-up sebelum mengganti mode.");
  if (pendingRetry())
    return toast("Periksa pengiriman yang belum terkonfirmasi sebelum mengganti mode.");
  busy = true;
  const switchingControls = [
    ...document.querySelectorAll("button,input,select,textarea"),
  ].map((node) => ({ node, disabled: node.disabled }));
  switchingControls.forEach(({ node }) => (node.disabled = true));
  try {
    if (hasUnsavedForm() && !(await confirmLeave())) return;
    if (
      (cart.length || hasOrderDraft()) &&
      !(await confirmAction(
        "Pergantian mode akan mengosongkan keranjang yang belum disimpan. Lanjutkan?",
      ))
    )
      return;
    if (
      reset &&
      !(await confirmAction(
        "Ulangi demo dengan harga Rp150.000 dan stok 100? Semua perubahan demo akan dibuang.",
      ))
    )
      return;
    stateRevision++;
    if (mode === "live" || reset) {
      const engine = await demoEngine();
      const source = reset ? demoSource : state;
      const next = engine.createStockDemo(source);
      if (!reset) demoSource = source;
      state = next;
      mode = "stock-demo";
      if (["backoffice", "storehome", "warehouse"].includes(view)) view = "home";
    } else {
      // Keep demo active and write-protected until the real read succeeds.
      const fresh = await request("/rest/v1/rpc/pos_read", {}, true, true);
      if (
        !Array.isArray(fresh?.products) ||
        !Array.isArray(fresh?.stores) ||
        fresh.stockDemo
      )
        throw Error("Respons data asli tidak lengkap. Mode demo tetap aktif.");
      state = fresh;
      mode = "live";
      demoSource = null;
    }
    if (!state.stores.some((x) => x.id === store)) store = state.stores[0]?.id || "";
    cart = [];
    clearOrderDraft();
    lastSale = null;
    seenKitchen.clear();
    render();
    toast(
      mode === "stock-demo"
        ? "Stok uji 100 sudah siap di setiap outlet yang dapat diakses."
        : "Mode demo dimatikan. Data asli sudah dimuat kembali.",
    );
  } catch (err) {
    toast(err.message);
  } finally {
    busy = false;
    switchingControls.forEach(({ node, disabled }) => {
      if (node.isConnected) node.disabled = disabled;
    });
  }
}
async function request(path, body, auth = true, allowDemoRead = false) {
  assertDemoRequest(path, allowDemoRead);
  const sessionId = activeSessionId;
  try {
    let requestToken = auth ? await sessions.accessToken(sessionId) : "";
    if (auth) token = requestToken;
    assertDemoRequest(path, allowDemoRead);
    const send = () =>
      fetch(config.url + path, {
        method: body ? "POST" : "GET",
        headers: {
          apikey: config.key,
          "Content-Type": "application/json",
          ...(auth ? { Authorization: "Bearer " + requestToken } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
    let response = await send();
    if (auth && response.status === 401) {
      requestToken = await sessions.accessToken(sessionId, {
        force: true,
        rejectedToken: requestToken,
      });
      token = requestToken;
      assertDemoRequest(path, allowDemoRead);
      response = await send();
    }
    if (
      auth &&
      (sessionId !== activeSessionId || sessions.read()?.sessionId !== sessionId)
    )
      throw Object.assign(Error("Sesi berubah. Silakan masuk kembali."), {
        sessionChanged: true,
      });
    const data = await response.json().catch(() => {
      throw Error("Respons server tidak dapat dibaca. Coba lagi.");
    });
    // Parsing a large response yields too. A logout during parsing must discard it.
    if (
      auth &&
      (sessionId !== activeSessionId || sessions.read()?.sessionId !== sessionId)
    )
      throw Object.assign(Error("Sesi berubah. Silakan masuk kembali."), {
        sessionChanged: true,
      });
    if (!response.ok) {
      const error = Object.assign(
        Error(data.message || data.error_description || data.msg || "Koneksi gagal"),
        {
          definitive: response.status < 500,
          code: data.code,
          status: response.status,
        },
      );
      if (auth && response.status === 401) {
        sessions.clear(sessionId);
        error.authExpired = true;
        error.message = "Sesi sudah berakhir. Silakan masuk kembali.";
      }
      throw error;
    }
    return data;
  } catch (error) {
    if (
      auth &&
      (error.authExpired || error.sessionChanged) &&
      activeSessionId === sessionId
    ) {
      resetWorkspace();
      login(error.message);
    }
    throw error;
  }
}
function resetWorkspace(forget = false) {
  backNavigation.stop();
  resetCustomerDisplay();
  if (forget) sessions?.clear(activeSessionId || undefined);
  resetDashboard();
  workspace = "";
  officePage = officeBranch = "";
  loginAttempt++;
  authBusy = false;
  activeSessionId = "";
  token = "";
  mode = "";
  demoSource = null;
  lastSale = null;
  stateRevision++;
  seenKitchen.clear();
  hideHomeTotal = false;
  cart = [];
  state = emptyState();
  view = "dashboard";
  store = "";
  clearOrderDraft();
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  resetCustomerDisplay();
}
function sessionProgress(text, hidden = false) {
  return `<div class="auth-progress" data-auth-progress ${hidden ? "hidden" : ""}><div class="auth-progress-track" role="progressbar" aria-label="Proses masuk"></div><p class="auth-progress-text" data-auth-progress-text role="status" aria-live="polite">${e(text)}</p></div>`;
}
function setLoginProgress(form, text, working) {
  form.setAttribute("aria-busy", String(working));
  const progress = form.querySelector("[data-auth-progress]");
  if (progress) progress.hidden = !working;
  const label = form.querySelector("[data-auth-progress-text]");
  if (label) label.textContent = text;
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = working;
    button.textContent = working ? "Sedang masuk…" : "Masuk";
  }
  form.querySelectorAll?.("input").forEach((input) => (input.readOnly = working));
}
function loadingPage(text, error = "", retry = restoreSession) {
  workspace = "";
  sidebar.reset();
  app.innerHTML = `<div class="auth auth-workspace auth-startup">${themeButton("auth-theme")}<section class="auth-form"><div><img class="auth-logo" src="/assets/logo.png" alt="Maniac Duren"><h1>${error ? "Koneksi belum siap" : "Menyiapkan POS"}</h1><p class="muted auth-intro">${e(text)}</p>${sessionProgress(text, !!error)}<p class="auth-session-error" role="alert">${e(error)}</p><div class="auth-actions" ${error ? "" : "hidden"}><button type="button" id="auth-retry" class="primary">Coba lagi</button><button type="button" id="auth-switch">Gunakan akun lain</button></div></div></section></div>`;
  syncThemeControls();
  const again = document.querySelector("#auth-retry");
  if (again) again.onclick = () => retry();
  const other = document.querySelector("#auth-switch");
  if (other)
    other.onclick = () => {
      resetWorkspace(true);
      login();
    };
}
async function restoreSession() {
  if (startupBusy) return;
  const saved = sessions?.read();
  if (!saved) return login();
  startupBusy = true;
  activeSessionId = saved.sessionId;
  store = saved.store;
  mode = "live";
  setRetryScope(config.url + ":" + saved.userId);
  loadingPage("Memulihkan sesi dan memuat data outlet…");
  try {
    await refresh();
    if (activeSessionId !== saved.sessionId) return;
    workspace = spacesFor(state).includes(saved.workspace)
      ? saved.workspace
      : defaultSpace(state);
    view = "home";
    render();
  } catch (error) {
    if (activeSessionId !== saved.sessionId) return;
    mode = "";
    if (error.authExpired || error.sessionChanged) {
      resetWorkspace();
      login(error.message);
    } else
      loadingPage(
        "Sesi masih tersimpan. Coba sambungkan kembali.",
        error.name === "TimeoutError"
          ? "Server belum merespons. Silakan coba lagi."
          : error.message,
      );
  } finally {
    startupBusy = false;
  }
}
async function refresh() {
  if (busy) throw Error("Tunggu proses simpan selesai.");
  if (mode === "stock-demo") return;
  if (mode === "live") {
    const revision = stateRevision;
    const fresh = await request("/rest/v1/rpc/pos_read", {});
    if (mode !== "live" || busy || revision !== stateRevision) return;
    state = fresh;
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
async function mutate(action, payload, { throwOnError = false } = {}) {
  if (busy) {
    if (throwOnError) throw Error("Tunggu proses simpan selesai.");
    return false;
  }
  try {
    if (!["live", "stock-demo"].includes(mode))
      throw Error("Masuk ke POS sebelum menyimpan.");
    if (mode === "live") Object.assign(payload, prepareRetry(action, payload));
  } catch (error) {
    toast(error.message);
    if (throwOnError) throw error;
    return false;
  }
  stateRevision++;
  busy = true;
  const controls = [...document.querySelectorAll("button,input,select,textarea")].map(
    (node) => ({ node, disabled: node.disabled }),
  );
  controls.forEach(({ node }) => (node.disabled = true));
  try {
    if (mode === "stock-demo") {
      if (supplyActions.has(action))
        throw Error("Operasional gudang tidak tersedia di mode demo POS.");
      const engine = await demoEngine();
      state = engine.applyStockDemoAction(state, action, payload);
    } else {
      state = await commitMutation(state, action, payload, request);
    }
    if (mode === "live") settleRetry(action);
    return true;
  } catch (error) {
    if (mode === "live") settleRetry(action, !error.definitive);
    {
      const formError = [...document.querySelectorAll("dialog[open]")]
        .at(-1)
        ?.querySelector("#form-error");
      if (formError) formError.textContent = error.message;
    }
    error.message +=
      mode === "live" && !error.definitive
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
  app.innerHTML = `<div class="auth auth-workspace">${themeButton("auth-theme")}<section class="auth-form"><div><img class="auth-logo" src="/assets/logo.png" alt="Maniac Duren"><h1>Selamat datang kembali</h1><p class="muted auth-intro">Masuk untuk mengelola outlet Maniac Duren.</p>${config.configured ? "" : `<div class="notice">Akses POS belum tersedia. Hubungi pengelola.</div>`}<form id="login-form">${field("Email, username, atau nomor telepon", '<input name="identifier" required autocomplete="username" placeholder="Masukkan akun Anda">')}${field("Password", '<input name="password" type="password" required autocomplete="current-password" placeholder="Masukkan password">')}<p class="error" id="login-error" role="alert">${e(message)}</p><button class="primary full" type="submit" ${config.configured ? "" : "disabled"}>Masuk</button>${sessionProgress("Memeriksa akun…", true)}</form>${installButton()}<a class="auth-back" href="/">Kembali ke website</a></div></section></div>`;
  backNavigation.sync();
  syncThemeControls();
  bindInstall();
  document.querySelector("#login-form").onsubmit = async (ev) => {
    ev.preventDefault();
    if (authBusy) return;
    const form = ev.currentTarget,
      attempt = ++loginAttempt;
    const values = Object.fromEntries(new FormData(form));
    authBusy = true;
    document.querySelector("#login-error").textContent = "";
    setLoginProgress(form, "Memeriksa akun…", true);
    try {
      const response = await fetch("/api/pos-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        signal: AbortSignal.timeout(45000),
      });
      const data = await response.json();
      if (attempt !== loginAttempt) return;
      if (!response.ok) throw Error(data.error || "Login gagal. Coba lagi.");
      const saved = sessions.save(data);
      activeSessionId = saved.sessionId;
      token = saved.accessToken;
      mode = "live";
      demoSource = null;
      setRetryScope(config.url + ":" + saved.userId);
      setLoginProgress(form, "Memuat data outlet…", true);
      await refresh();
      if (attempt !== loginAttempt) return;
      view = "home";
      render();
      if (!sessions.persistent)
        toast(
          "Browser membatasi penyimpanan sesi. Login dapat diminta kembali setelah refresh.",
        );
    } catch (error) {
      if (attempt !== loginAttempt) return;
      const message =
        error.name === "TimeoutError"
          ? "Server belum merespons. Silakan coba lagi."
          : error.message;
      if (activeSessionId && sessions.read()?.sessionId === activeSessionId) {
        mode = "";
        loadingPage(
          "Akun sudah terverifikasi. Data outlet belum selesai dimuat.",
          message,
        );
      } else {
        token = "";
        mode = "";
        document.querySelector("#login-error").textContent = message;
      }
    } finally {
      if (attempt === loginAttempt) {
        authBusy = false;
        setLoginProgress(form, "", false);
      }
    }
  };
}
function accountProfile() {
  const person =
    state.employees?.find((employee) => employee.id === state.me?.id) || state.me || {};
  const accountName = person.name || "Akun login";
  const photo = person.profile_photo;
  const role =
    {
      owner: "Owner · Akses penuh",
      manager: "Manager",
      cashier: "Kasir",
      admin: "Admin Back Office",
      waitress: "Waitress",
      cutter: "Tukang Potong",
      kitchen: "Kitchen",
      warehouse: "Gudang",
      staff: "Staff",
    }[person.role] || "Staff";
  const initials = accountName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return `<div class="account-profile" aria-label="Akun yang login">${photo ? `<img src="${e(photo)}" alt="Foto ${e(accountName)}">` : `<span class="account-avatar" aria-hidden="true">${e(initials)}</span>`}<div><strong>${e(accountName)}</strong><span>${e(role)}</span></div></div>`;
}
function workspaceLocations() {
  if (!state.warehouseVersion || state.stockDemo) return state.stores;
  if (workspace === "backoffice") return state.stores;
  return state.stores.filter((x) =>
    workspace === "warehouse"
      ? x.locationType === "warehouse"
      : x.locationType !== "warehouse",
  );
}
function officeBranchPanel(s, page, selected) {
  const payments = page === "payments";
  const shops = s.stores.filter((l) => !payments || l.locationType !== "warehouse");
  const choices = locationOptions(shops, selected);
  const rows = shops.map((l) => {
    const hours = s.workHours?.find((h) => h.store_id === l.id);
    const detail = payments
      ? availablePayments(s, l.id)
          .map((m) => m.label)
          .join(", ")
      : hours
        ? hours.start_time.slice(0, 5) + " – " + hours.end_time.slice(0, 5)
        : "Belum diatur";
    return `<tr><td>${e(l.name)}</td><td>${e(detail)}</td></tr>`;
  });
  return `<section class="panel">${field(payments ? "Atur pembayaran cabang" : "Pilih lokasi absensi", `<select id="office-branch"><option value="">Semua cabang</option>${choices}</select>`)}
    ${selected ? "" : `<div class="table-wrap"><table><thead><tr><th>Cabang</th><th>${payments ? "Metode pembayaran aktif" : "Jam kerja (WIB)"}</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`}</section>`;
}
function workspaceTitles(access) {
  return access.workspace === "store"
    ? {
        ...title,
        ...storePageTitles,
        ...(access.branchStock
          ? {
              supplierNotes: "Terima dari supplier",
              receiving: "Terima dari cabang",
            }
          : {}),
      }
    : access.pettyCash
      ? {
          ...title,
          ...(access.branchStock
            ? {
                transfers:
                  workspace === "backoffice"
                    ? "Transfer Stok"
                    : "Dokumen distribusi lama",
              }
            : {}),
          documents: "Arsip dokumen",
          backoffice: "Dashboard",
          products: "Master barang",
          employees: "Akun karyawan",
        }
      : title;
}

function shell(body, access, dockOptions) {
  const pageTitles = dockOptions.titles;
  const central = access.workspace === "backoffice";
  const activeLocation = state.stores.find((x) => x.id === store),
    activeIcon = activeLocation?.locationType === "warehouse" ? "warehouse" : "stores";
  const scopeLabel = central ? "Pusat · Semua cabang" : locationLabel(activeLocation);
  const selectableLocations = workspaceLocations();
  return `<div class="shell ${["products", "stock"].includes(view) ? "inventory-shell" : ""} ${["dashboard", "backoffice", "storehome"].includes(view) ? "dashboard-shell" : ""}" ${sidebar.attributes()} data-page="${e(view)}">
    <aside class="sidebar" id="pos-sidebar" aria-label="Sidebar Maniac Duren">
      <div class="sidebar-header">
        <div class="sidebar-brand-row"><div class="brand"><img src="/assets/logo.png" alt=""><div><strong>Maniac Duren</strong><span>${central ? "Back Office pusat" : "Operasional outlet"}</span></div></div><button type="button" class="sidebar-toggle" data-sidebar-toggle aria-controls="pos-sidebar" aria-label="Tutup sidebar">${sidebarIcon}</button></div>
        ${workspaceSwitch()}${central ? "" : `<div class="sidebar-store"><label for="active-store">Lokasi aktif</label><div class="store-select-wrap">${icon(activeIcon)}<select id="active-store" aria-label="Lokasi aktif: branch outlet atau gudang" title="${e(locationLabel(activeLocation))}">${locationOptions(selectableLocations, store)}</select></div></div>`}
      </div>
      <nav class="nav" id="pos-navigation" data-workspace-nav="${e(access.workspace || "")}" aria-label="Navigasi POS">${navigation(pageTitles, view, icon, access, sidebar.closedGroups)}</nav>
      <div class="sidebar-account">${accountProfile()}<button id="logout" class="sidebar-logout" type="button" aria-label="Logout" title="Logout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10"/></svg><span>Logout</span></button></div>
    </aside>
    <button type="button" class="sidebar-backdrop" data-sidebar-close tabindex="-1" aria-label="Tutup sidebar"></button>
    <main id="pos-main"><header class="topbar"><div class="workspace-heading"><button id="sidebar-toggle" type="button" class="sidebar-toggle" data-sidebar-toggle aria-controls="pos-sidebar" aria-label="Buka sidebar">${sidebarIcon}</button><div class="workspace-title"><span class="workspace-breadcrumb">Maniac Duren</span><h1>${view === "orders" ? `Selamat datang, <span>${e((state.me?.name || "Kasir").trim().split(/\s+/)[0])}</span>` : e(pageTitles[view] || "Maniac Duren")}</h1></div></div><div class="workspace-tools">${installButton()}<span class="workspace-outlet" title="${e(scopeLabel)}">${icon(central ? "backoffice" : activeIcon)}<span>${e(scopeLabel)}</span></span><button type="button" id="stock-demo-toggle" class="stock-demo-toggle" role="switch" aria-label="Mode demo" aria-checked="${mode === "stock-demo"}"><span class="stock-demo-track" aria-hidden="true"></span>Mode demo</button>${themeButton()}</div></header><div class="workspace-content">${mode === "stock-demo" ? '<aside class="stock-demo-banner" role="status"><div><b>MODE DEMO · Stok awal 100</b><p>Data uji hanya di tab ini. Semua penyimpanan demo terpisah dari database asli. Harga jual demo Rp150.000 per satuan; resep mengikuti master.</p><small>Buah: 100 kg + 100 butir. Bahan / produk stok: 100 sesuai satuannya. ${e(itemTypes.recipe)} mengikuti bahan.</small></div><button type="button" id="stock-demo-reset">Reset demo</button></aside>' : ""}${body}<p class="page-foot">Maniac Duren · ${e(scopeLabel)}</p></div>${systemDock(view, access, dockOptions)}</main>
  </div>`;
}

function inventoryTable(lots) {
  const grouped = state.products.filter(isLegacyStock).map((p) => ({
    ...p,
    kg: lots.filter((l) => l.productId === p.id).reduce((a, l) => a + l.kg, 0),
    pieces: lots.filter((l) => l.productId === p.id).reduce((a, l) => a + l.pieces, 0),
  }));
  return `<div class="table-wrap"><table><thead><tr><th>PRODUK</th><th class="numeric">STOK KG</th><th class="numeric">STOK BUTIR</th><th>STATUS</th></tr></thead><tbody>${grouped.map((p) => `<tr><td><b>${e(p.name)}</b><small>${e(p.sku)}</small></td><td class="numeric">${num(p.kg)} kg</td><td class="numeric">${num(p.pieces)} butir</td><td><span class="pill">${p.kg > 0 && p.pieces > 0 ? "Tersedia" : "Habis / cek fisik"}</span></td></tr>`).join("") || '<tr><td colspan="4" class="empty">Tambahkan produk di halaman Product.</td></tr>'}</tbody></table></div>`;
}
function cashier() {
  const total = cart.reduce((a, l) => a + l.total, 0);
  return `<div class="pos-layout"><section><div class="header-row"><div><h3>Pilih durian</h3><p class="muted">Store ${e(name("stores", store))}</p></div><button class="small" id="reload">Perbarui stok</button></div><div class="products">${
    pricesForBranch(state, store)
      .products.filter(isLegacyStock)
      .map((p) => {
        const lots = state.lots.filter(
          (l) => l.storeId === store && l.productId === p.id,
        );
        const kg = lots.reduce((a, l) => a + l.kg, 0),
          pieces = lots.reduce((a, l) => a + l.pieces, 0);
        return `<button class="product" data-product="${e(p.id)}" ${kg <= 0 || pieces <= 0 ? "disabled" : ""}><div class="product-mark">${e(p.name.slice(0, 2).toUpperCase())}</div><h3>${e(p.name)}</h3><div class="muted">${e(p.sku)} · ${num(kg)} kg / ${pieces} butir</div><div class="price">${money(p.priceKg)} <span class="muted">/ kg</span></div><div class="muted">${money(p.pricePiece)} / butir</div></button>`;
      })
      .join("") || '<div class="empty">Tambah produk dan barang masuk dahulu.</div>'
  }</div></section><aside class="panel receipt"><div class="header-row"><h3>Pesanan</h3><span class="tag">${cart.length} item</span></div>${cart.map((l, i) => `<div class="cart-item"><div class="cart-line"><b>${e(name("products", l.productId))}</b><button data-remove="${i}" aria-label="Hapus ${e(name("products", l.productId))}">×</button></div><div class="muted">${num(l.kg)} kg · ${l.pieces} butir · per ${l.unit === "KG" ? "kg" : "butir"}</div><div class="muted">${e(name("suppliers", l.supplierId))} · ${short(l.lotId)}</div><div style="text-align:right;margin-top:9px"><b>${money(l.total)}</b></div></div>`).join("") || '<div class="empty">Pilih produk untuk mulai.</div>'}<div class="total"><span>Total</span><span>${money(total)}</span></div><form id="checkout">${memberFields(state)}${field("Tanggal penjualan", `<input type="date" name="date" value="${today()}" required>`)}${field("Metode pembayaran", `<select name="payment" required>${paymentOptions(state, store)}</select>`)}${field("Nominal diterima (Rp)", `<input name="paid" type="number" min="${total}" step="any" value="${total || ""}" required>`)}<p class="muted" id="change">Kembalian ${money(0)}</p><button type="submit" class="primary full" ${cart.length ? "" : "disabled"}>Simpan</button></form></aside></div>`;
}
function stockPage() {
  return (
    inventoryPanel(state, store, stockFilter, "stock") +
    `<details class="inventory-history"><summary>Rincian penerimaan, asal barang & riwayat pergerakan</summary>${stockHistoryPage()}</details>`
  );
}
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

function directoryPage(kind) {
  if (kind === "stores") return storesPage(state);
  const isStore = kind === "stores",
    label = isStore ? "Store" : "Supplier";
  return `<div class="intro"><div><h2>Master ${label}</h2><p class="muted">${isStore ? "Ubah nama toko dan lokasi melalui tombol Edit toko." : "Kelola supplier, nomor telepon, dan alamat."}</p></div><button class="primary" data-master="${kind}">Tambah ${label}</button></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>NAMA</th>${isStore ? "<th>LOKASI</th>" : "<th>NOMOR TELEPON</th><th>ALAMAT</th>"}<th>ACTION</th></tr></thead><tbody>${state[kind].map((p) => `<tr><td><b>${e(p.name)}</b></td>${isStore ? `<td>${e(p.location || "—")}</td>` : `<td>${e(p.phone || "—")}</td><td>${e(p.address || "—")}</td>`}<td><button class="small" data-edit-kind="${kind}" data-edit-id="${e(p.id)}">${icon("edit")}${isStore ? "Edit toko" : "Edit"}</button></td></tr>`).join("") || `<tr><td colspan="${isStore ? 3 : 4}" class="empty">Belum ada ${label.toLowerCase()}.</td></tr>`}</tbody></table></div></section>`;
}
async function changeStore(next) {
  if (
    !state.stores.some((x) => x.id === next) ||
    busy ||
    (hasUnsavedForm() && !(await confirmLeave()))
  )
    return false;
  if (next === store) {
    followDashboardStore();
    render();
    return true;
  }
  if (
    (cart.length || hasOrderDraft()) &&
    !(await confirmAction("Ganti toko akan mengosongkan pesanan. Lanjutkan?"))
  )
    return false;
  resetCustomerDisplay();
  store = next;
  cart = [];
  clearOrderDraft();
  followDashboardStore();
  render();
  return true;
}

function bindPageNavigation(root) {
  root.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (busy || (hasUnsavedForm() && !(await confirmLeave()))) return;
        if (
          view === "home" &&
          workspace === "backoffice" &&
          ["backoffice", "officeInventory"].includes(b.dataset.view)
        )
          officePage = b.dataset.view;
        if (
          view === "backoffice" &&
          b.dataset.view === "officeInventory" &&
          b.closest(".dash-workspace")
        )
          officePage = "officeInventory";
        if (b.dataset.view === "reports") {
          const dashboard = b.closest(".dash-workspace")?.dataset;
          if (b.dataset.openReport || (workspace === "backoffice" && view === "home"))
            selectReportTab(
              b.dataset.openReport || "summary",
              dashboard
                ? {
                    store: dashboard.reportStore,
                    from: dashboard.reportFrom,
                    to: dashboard.reportTo,
                    period: dashboard.reportPeriod,
                  }
                : { store: workspace === "backoffice" ? officeBranch : store },
            );
        }
        view = b.dataset.view;
        sidebar.navigate();
        render();
        window.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
      }),
  );
  root.querySelector("[data-dock-scan]")?.addEventListener("click", async () => {
    if (busy || (state.access && !state.access.stock)) return;
    if (document.querySelector("dialog[open]")) {
      toast("Tutup pop-up sebelum scan barcode.");
      return;
    }
    if (hasUnsavedForm() && !(await confirmLeave())) return;
    if (
      state.warehouseVersion &&
      !state.stockDemo &&
      location(state, store)?.locationType !== "warehouse"
    ) {
      view = workspaceAccess().branchStock ? "supplierNotes" : "receiving";
      render();
      return;
    }
    if (view !== "stock") {
      view = "stock";
      sidebar.navigate();
      render();
    }
    addReceipt();
  });
}

function render() {
  if (state.warehouseVersion && !state.stockDemo) {
    if (!spacesFor(state).includes(workspace)) {
      workspace = defaultSpace(state);
    }
    const locations = workspaceLocations();
    if (!locations.some((x) => x.id === store)) store = locations[0]?.id || "";
    const permitted = new Set(visibleSections(workspaceAccess()).flatMap((g) => g.pages));
    if (
      workspace === "backoffice" &&
      workspaceAccess().pettyCash &&
      state.access.backoffice
    ) {
      permitted.add("documents");
    }
    if (!permitted.has(view)) view = "home";
  }

  if (
    ["finance", "batches", "trace"].includes(view) ||
    (view === "salesreport" && workspaceAccess().workspace !== "store")
  ) {
    selectReportTab(
      {
        salesreport: "summary",
        finance:
          state.cashFlowVersion >= 127 && workspace === "backoffice"
            ? "cashflow"
            : "expenses",
        batches: "batches",
        trace: "stock",
      }[view],
    );
    view = "reports";
  }
  sessions?.location(activeSessionId, store, view, workspaceAccess().workspace || "");
  const central = workspaceAccess().workspace === "backoffice";
  if (!central || officePage !== view) {
    officePage = central ? view : "";
    officeBranch = "";
  }
  if (officeBranch && !state.stores.some((l) => l.id === officeBranch)) officeBranch = "";
  const pageStore = central ? officeBranch || null : store;
  const chooseBranch = central && ["payments", "attendance"].includes(view);
  sidebar.capture();
  const access = workspaceAccess();
  const titles = workspaceTitles(access);
  const pages = {
    home: () =>
      homePage(state, pageStore, access, titles, workspaceLocations(), hideHomeTotal),
    ...Object.fromEntries(
      opsPages.map((key) => [key, () => opsPage(key, state, pageStore)]),
    ),
    crm: () => crmPage(state),
    payments: () => paymentsPage(state, pageStore),
    shifts: () => shiftsPage(state, pageStore),
    retailFunds: () => pettyPanel(state, pageStore, true),
    storeExpenses: () => storeExpensesPage(state, pageStore),
    dashboard: () => dashboardPage(state, pageStore),
    backoffice: () => supplyHome(state, pageStore, "backoffice"),
    warehouse: () => supplyHome(state, pageStore, "warehouse"),
    storehome: () => supplyHome(state, pageStore, "store"),
    transferPrep: () => branchPreparationPage(state, pageStore),
    transfers: () => transfersPage(state, pageStore, false, workspace),
    receiving: () => transfersPage(state, pageStore, true),
    legacyTransfers: () => outboundPage(state, pageStore, workspace),
    officeInventory: () => officeInventoryPage(state, workspace),
    costPrices: () => costPricesPage(state, pageStore, workspace),
    pricing: () => pricingPage(state, pageStore),
    supplierNotes: () => supplierNotesPage(state, pageStore, workspace),
    service: () => servicePage(state, pageStore),
    cutting: () => cuttingPage(state, pageStore),
    recipes: () => recipesPage(state, pageStore),
    production: () => productionPage(state, pageStore),
    cashier,
    stock: stockPage,
    waste: () => wastePage(state, pageStore),
    losses: () => wastePage(state, pageStore),
    reports: () => reportsPage(state, workspace),
    documents: () => documentsPage(state, pageStore),
    products: () => catalogPanel(state.products, catalogFilter, state, pageStore),
    stores: () => directoryPage("stores"),
    suppliers: () => directoryPage("suppliers"),
  };
  const dockOptions = {
    titles,
    userId: state.me?.id || state.me?.user_id,
    demo: !!state.stockDemo,
  };
  app.innerHTML = shell(
    chooseBranch
      ? officeBranchPanel(state, view, officeBranch) + (officeBranch ? pages[view]() : "")
      : pages[view](),
    access,
    dockOptions,
  );
  const changeOfficeBranch = async (next) => {
    if (
      busy ||
      (next && !state.stores.some((l) => l.id === next)) ||
      (hasUnsavedForm() && !(await confirmLeave()))
    )
      return false;
    officeBranch = next;
    followDashboardStore();
    render();
    return true;
  };
  if (view === "home")
    bindHome({
      changeStore: central ? changeOfficeBranch : changeStore,
      setHidden: (value) => {
        hideHomeTotal = value;
      },
    });
  const picker = document.querySelector("#office-branch");
  if (picker)
    picker.onchange = async () => {
      if (!(await changeOfficeBranch(picker.value))) picker.value = officeBranch;
    };
  if (view === "orders" || view === "cashier") {
    const banner = document.createElement("div");
    banner.dataset.shiftBanner = "";
    banner.innerHTML = shiftBanner(state, store);
    document.querySelector(".workspace-content").prepend(banner);
  }
  const shiftContext = {
    ...storeContext(),
    getState: () => state,
    refresh,
    showLegacyReceipt: receipt,
    readCashDeposits: (filters) => adminRpc("pos_cash_deposits_read", { filters }),
    readDepositProof: (depositId) =>
      adminRpc("pos_cash_deposit_proof", { deposit_id: depositId }),
    readShifts: async (filters) => {
      if (mode === "stock-demo") return readShiftsDemo(state, filters);
      const sessionId = activeSessionId,
        revision = stateRevision;
      const data = await request("/rest/v1/rpc/pos_cashier_shifts_read", {
        filters,
      });
      if (mode !== "live" || sessionId !== activeSessionId)
        throw Error("Sesi berubah. Muat ulang halaman shift.");
      if (revision === stateRevision) state.cashierShifts = data.active;
      return data;
    },
  };
  bindSupply(state, pageStore, view, {
    ...shiftContext,
    getState: () => state,
    refresh,
    workspace,
  });
  document.querySelectorAll("[data-workspace]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (busy || (hasUnsavedForm() && !(await confirmLeave()))) return;
        if (
          hasOrderDraft() &&
          !(await confirmAction(
            "Pesanan belum dibayar. Pindah area dan kosongkan keranjang?",
          ))
        )
          return;
        clearOrderDraft();
        workspace = b.dataset.workspace;
        resetDashboard();
        view = "home";
        render();
      }),
  );
  if (view === "crm") bindCrm(shiftContext);
  if (view === "payments") bindPayments(shiftContext, pageStore);
  bindShiftBanner(shiftContext, store);
  if (view === "shifts") bindShiftsPage(shiftContext, store);
  if (view === "storeExpenses") bindStoreExpenses(state, store, shiftContext);
  document.querySelector("#order-products")?.addEventListener("stock-refresh", () => {
    const banner = document.querySelector("[data-shift-banner]");
    if (banner) {
      banner.innerHTML = shiftBanner(state, store);
      bindShiftBanner(shiftContext, store, banner);
    }
  });
  syncThemeControls();
  bindInstall();
  sidebar.mount();
  backNavigation.sync();
  document
    .querySelector("#stock-demo-toggle")
    ?.addEventListener("click", () => switchStockDemo());
  document
    .querySelector("#stock-demo-reset")
    ?.addEventListener("click", () => switchStockDemo(true));
  bindPageNavigation(document);
  bindDockSettings(view, access, dockOptions, {
    modal,
    bindNavigation: bindPageNavigation,
    toast,
  });
  const activePicker = document.querySelector("#active-store");
  if (activePicker)
    activePicker.onchange = async (ev) => {
      if (!(await changeStore(ev.target.value))) ev.target.value = store;
    };
  if (["dashboard", "backoffice", "storehome"].includes(view))
    bindDashboard(state, pageStore, {
      ...shiftContext,
      workspace: workspaceAccess().workspace,
      readShifts: shiftContext.readShifts,
      render,
      refresh,
      toast,
      changeStore: central ? changeOfficeBranch : changeStore,
      isBusy: () => busy,
    });

  document.querySelector("#logout").onclick = async () => {
    if (busy || (hasUnsavedForm() && !(await confirmLeave()))) return;
    if (cart.length && !(await confirmAction("Keluar dan kosongkan pesanan?"))) return;
    if (
      activeShift(state) &&
      !(await confirmAction(
        "Shift kasir masih terbuka. Logout tidak menutup shift. Tetap keluar?",
      ))
    )
      return;
    resetWorkspace(true);
    login();
  };
  document
    .querySelectorAll("[data-receipt]")
    .forEach((b) => (b.onclick = () => receipt(b.dataset.receipt)));
  document.querySelectorAll("[data-weigh-history]").forEach(
    (b) =>
      (b.onclick = () => {
        const lot = state.lots.find((l) => l.id === b.dataset.weighHistory);
        if (lot) showWeighingHistory(lot, { modal });
      }),
  );
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
          (await confirmAction(
            "Kirim ulang data transaksi sebelumnya dengan ID yang sama?",
          ))
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
  if (!chooseBranch || officeBranch)
    bindOps(view, state, pageStore, {
      ...storeContext(),
      refresh,
      getState: () => state,
      employeeDocument: (employeeId) =>
        request("/rest/v1/rpc/pos_employee_document", {
          employee_id: employeeId,
        }),
      createAccount: async (employeeId, password, action = "create") => {
        if (mode !== "live") throw Error("Akun hanya dapat dibuat saat login database.");
        await request("/rest/v1/rpc/pos_account_target", {
          employee_id: employeeId,
        });
        if (mode !== "live") throw Error("Akun hanya dapat dibuat saat login database.");
        const res = await fetch("/api/pos-employee", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ employeeId, password, action }),
        });
        const data = await res.json();
        if (!res.ok) throw Error(data.error || "Gagal membuat akun");
        return data;
      },
    });
  bindKitchenSound();
  observeKitchen();
  trackForms();
  bindProduction(view, state, store, { modal, mutate, render, toast, refresh });
  const adminContext = {
    workspace,
    bindNavigation: bindPageNavigation,
    modal,
    mutate,
    render,
    toast,
    refresh,
    getState: () => state,
    rpc: adminRpc,
    refreshBatchState: async () => {
      reportRefreshPending = true;
      reportRefreshRevision++;
      try {
        await refresh();
      } finally {
        reportRefreshPending = false;
      }
    },
  };
  if (view === "retailFunds") {
    bindPetty(state, pageStore, adminContext);
    document.querySelector("[data-pt-expense]").onclick = () =>
      expenseDialog(state, pageStore, adminContext, true);
  }
  if (view === "officeInventory") bindOfficeInventory(state, adminContext, pageStore);
  if (view === "reports") bindReports(state, pageStore, adminContext);
  if (view === "documents") bindDocuments(state, pageStore, adminContext);
  bindWaste(view, state, store, {
    getState: () => state,
    loadRejectEvidence: async (recordId) =>
      mode === "stock-demo"
        ? state.rejectRecords.find((r) => r.id === recordId)?.evidence
        : request("/rest/v1/rpc/pos_reject_evidence", { record_id: recordId }),
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
    const memberPicker = bindMemberPicker(shiftContext, form, () => cart);
    form.paid.oninput = () => {
      const change = Number(form.paid.value) - cart.reduce((a, l) => a + l.total, 0);
      document.querySelector("#change").textContent =
        change < 0 ? "Kurang " + money(-change) : "Kembalian " + money(change);
    };
    form.payment.onchange = () => {
      form.paid.readOnly = form.payment.value !== "Tunai";
      if (form.paid.readOnly) form.paid.value = cart.reduce((a, l) => a + l.total, 0);
      form.paid.oninput();
    };
    form.payment.onchange();
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const payload = {
        ...Object.fromEntries(new FormData(form)),
        id: id(),
        storeId: store,
        paid: Number(form.paid.value),
        lines: cart,
        memberId: memberPicker.get()?.id || null,
      };
      try {
        requireEnabledPayment(state, store, payload.payment);
        validPayment(
          payload,
          cart.reduce((a, l) => a + l.total, 0),
        );
      } catch (error) {
        toast(error.message);
        return;
      }
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
    bindInventory(state, store, stockFilter, "stock", {
      modal,
      mutate,
      render,
      toast,
      getState: () => state,
    });
    const receiveButton = document.querySelector("#add-receipt");
    if (receiveButton)
      receiveButton.onclick = () => {
        if (
          state.warehouseVersion &&
          !state.stockDemo &&
          (state.supplierStockVersion >= 122 || !state.access?.backoffice)
        )
          return addReceipt();
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
    document.querySelector("#movement")?.addEventListener("click", movement);
  }
  if (["products", "stores", "suppliers"].includes(view)) {
    if (view === "products") {
      document.querySelector("#add-catalog-product").onclick = () =>
        productDialog({
          state,
          store: pageStore,
          modal,
          mutate,
          render,
          toast,
          getState: () => state,
        });
      bindInventory(state, pageStore, catalogFilter, "products", {
        modal,
        mutate,
        render,
        toast,
        getState: () => state,
        addProductVariant: (productId) =>
          productVariantDialog({
            productId,
            state,
            modal,
            mutate,
            render,
            toast,
          }),
        addVariant: (groupId) =>
          variantGroupDialog({ groupId, state, modal, mutate, render, toast }),
        edit: (key) =>
          productDialog({
            product: state.products.find((p) => p.id === key),
            state,
            store: pageStore,
            modal,
            mutate,
            render,
            toast,
          }),
      });
    }
    document
      .querySelectorAll("[data-edit-kind]")
      .forEach(
        (b) =>
          (b.onclick = () => editMasterDetails(b.dataset.editKind, b.dataset.editId)),
      );
    document
      .querySelectorAll("[data-master]")
      .forEach((b) => (b.onclick = () => addMaster(b.dataset.master)));
  }
}
function modal(title, body, submitLabel = "Simpan") {
  const d = document.createElement("dialog");
  d.className = "modal";
  d.innerHTML = `<div class="modal-head"><h2>${mode === "stock-demo" ? "DEMO · " : ""}${title}</h2><button type="button" class="close" aria-label="Tutup">×</button></div><form>${body}<p class="error" id="form-error"></p><div class="modal-actions"><button type="button" class="close">Batal</button><button class="primary" type="submit">${submitLabel}</button></div></form>`;
  document.body.append(d);
  const requestClose = async () => {
    if (busy) return;
    if (
      d.dataset.dirty === "true" &&
      !(await confirmAction("Isian belum disimpan. Tutup form ini?"))
    )
      return;
    if (d.hasAttribute("open")) d.close();
  };
  d.addEventListener("input", () => (d.dataset.dirty = "true"));
  d.addEventListener("change", () => (d.dataset.dirty = "true"));
  d.querySelectorAll(".close").forEach((button) => {
    button.onclick = requestClose;
  });
  d.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClose();
  });
  d.addEventListener("close", () => d.remove());
  d.querySelectorAll('select[name="supplierId"]').forEach((select) =>
    bindSupplierSelect(select, { getState: () => state, modal, mutate, toast }),
  );
  d.querySelectorAll('input[name="barcode"], input[data-value="barcode"]').forEach(
    (input) => {
      prepareBarcodeInput(input);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });
    },
  );
  d.showModal();
  return d;
}
function addItem(productId) {
  const product = pricesForBranch(state, store).products.find((x) => x.id === productId),
    lots = state.lots.filter(
      (l) => l.productId === productId && l.storeId === store && l.kg > 0 && l.pieces > 0,
    );
  const d = modal(
    "Tambah " + e(product.name),
    `${field("Asal barang / supplier", `<select name="lotId" required>${lots.map((l) => `<option value="${e(l.id)}">${e(name("suppliers", l.supplierId))} · ${l.date} · ${short(l.id)} · ${num(l.kg)} kg / ${l.pieces} butir</option>`).join("")}</select>`)}<div class="form-grid">${field("Cara jual", '<select name="unit"><option value="KG">Per kilogram</option><option value="BUTIR">Per butir</option></select>')}${field("Harga per satuan (Rp)", `<input name="price" type="number" min="0.01" step="any" value="${product.priceKg}" ${state.branchPricingVersion >= 123 ? "readonly" : ""} required>`)}${field("Berat ditimbang (kg)", '<input name="kg" type="number" min="0.000001" step="any" required placeholder="Contoh: 2,5">')}${field("Jumlah butir", '<input name="pieces" type="number" min="1" step="1" value="1" required>')}</div><div class="callout">Penjualan per butir tetap wajib ditimbang. Pilih asal barang yang sesuai dengan durian fisiknya.</div><div class="total"><span>Subtotal</span><span id="subtotal">${money(0)}</span></div>`,
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
    f.price.value = f.unit.value === "KG" ? product.priceKg : product.pricePiece;
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
  if (state.warehouseVersion && !state.stockDemo)
    return openWarehouseReceipt(state, store, {
      modal,
      mutate,
      render,
      toast,
      getState: () => state,
      workspace,
      refresh,
    });
  openWeighingReceipt(state, store, {
    modal,
    mutate,
    render,
    toast,
    getState: () => state,
  });
}

function movement() {
  if (state.warehouseVersion && !state.stockDemo)
    return openDispatch(state, store, {
      workspace,
      modal,
      mutate,
      render,
      toast,
      getState: () => state,
    });
  return openFruitTransfer(state, store, { modal, mutate, render, toast });
}

function addMaster(kind) {
  if (kind === "suppliers")
    return supplierDialog({ getState: () => state, modal, mutate, toast }, () =>
      render(),
    );
  if (kind === "stores")
    return storeDialog(state, {
      ...storeContext(),
      render: () => {
        store = store || state.stores[0]?.id || "";
        render();
      },
    });
  if (kind === "products")
    return productDialog({
      state,
      store,
      modal,
      mutate,
      render,
      toast,
      getState: () => state,
    });
  const masterId = id();
  const d = modal(
    "Tambah " + { products: "produk", stores: "store", suppliers: "supplier" }[kind],
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
    "Kasir: " + cashierName(s),
    ...(s.customer
      ? [
          "Member: " + s.customer.name,
          (s.pointsReversed ? "Poin dibatalkan: " : "Poin diperoleh: ") +
            (s.pointsEarned || 0),
        ]
      : []),
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
  d.innerHTML = `<div class="modal-head"><h2>Struk transaksi</h2><button id="close-receipt" aria-label="Tutup">×</button></div><div class="receipt-print">${receiptHeader(state.stores.find((x) => x.id === s.storeId))}<div class="receipt-plain">${e(lines.join("\n"))}</div></div><div class="modal-actions">${!s.voided ? '<button class="danger" id="void-sale">Batalkan transaksi</button>' : ""}<button class="primary" id="print">Cetak</button></div>`;
  document.body.append(d);
  d.oncancel = (ev) => {
    if (busy) ev.preventDefault();
  };
  d.onclose = () => d.remove();
  d.querySelector("#close-receipt").onclick = () => d.close();
  const outlet = state.stores.find((x) => x.id === s.storeId);
  fillReceiptLogo(d, outlet, storeContext()).catch((error) => toast(error.message));
  d.querySelector("#print").onclick = async () => {
    const button = d.querySelector("#print");
    if (button.disabled) return;
    button.disabled = true;
    try {
      await fillReceiptLogo(d, outlet, storeContext());
      if (d.hasAttribute("open")) await printReceipt(d.querySelector(".receipt-print"));
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  };
  d.querySelector("#void-sale")?.addEventListener("click", async () => {
    const reason = await requestReason("Alasan pembatalan (stok akan dikembalikan):");
    if (!reason?.trim()) return;
    if (await mutate("void", { id: id(), saleId, reason })) {
      d.close();
      render();
      toast("Transaksi dibatalkan dan stok dikembalikan");
    }
  });
  d.showModal();
}

async function bootstrap() {
  loadingPage("Menghubungkan ke layanan POS…", "", bootstrap);
  try {
    const response = await fetch("/api/pos-config", {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!response.ok) throw Error("Layanan POS belum dapat dihubungi. Coba lagi.");
    config = await response.json();
    if (!config.configured) {
      login();
      return;
    }
    sessions = createSessionManager({ url: config.url, key: config.key });
    if (sessions.read()) await restoreSession();
    else login();
  } catch (error) {
    loadingPage(
      "Periksa koneksi internet Anda.",
      error.name === "TimeoutError" ? "Server belum merespons." : error.message,
      bootstrap,
    );
  }
}
function handleSessionStorage(event) {
  if (!sessions || (event.key !== sessions.storageKey && event.key !== null)) return;
  if (activeSessionId && sessions.read()?.sessionId !== activeSessionId) {
    resetWorkspace();
    login("Sesi keluar atau akun berganti di tab lain. Silakan masuk kembali.");
  }
}
await bootstrap();

function masterDetailFields(kind, p = {}) {
  return kind === "stores"
    ? field(
        "Lokasi store (opsional)",
        `<input name="location" maxlength="300" value="${e(p.location || "")}" placeholder="Alamat atau lokasi store">`,
      )
    : `${field("Nomor telepon (opsional)", `<input name="phone" type="tel" maxlength="40" value="${e(p.phone || "")}" placeholder="08… atau +62…">`)}${field("Alamat supplier (opsional)", `<input name="address" maxlength="300" value="${e(p.address || "")}" placeholder="Alamat lengkap">`)}`;
}
function editMasterDetails(kind, recordId) {
  if (kind === "stores")
    return storeDialog(
      state,
      storeContext(),
      state.stores.find((s) => s.id === recordId),
    );
  const p = state[kind]?.find((x) => x.id === recordId);
  if (!p || !["stores", "suppliers"].includes(kind)) return;
  const editRequestId = id();
  const d = modal(
    kind === "stores" ? "Edit toko" : "Edit " + e(p.name),
    (kind === "stores"
      ? field(
          "Nama toko",
          `<input name="name" required maxlength="100" value="${e(p.name)}" autocomplete="organization">`,
        )
      : "") + masterDetailFields(kind, p),
  );
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

function beepKitchen() {
  if (!soundEnabled || !audioContext) return;
  const oscillator = audioContext.createOscillator(),
    gain = audioContext.createGain();
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.12, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.5);
}
function bindKitchenSound() {
  const button = document.querySelector("#kitchen-sound");
  if (!button) return;
  button.textContent = soundEnabled ? "Suara aktif" : "Aktifkan suara";
  button.setAttribute("aria-pressed", String(soundEnabled));
  button.onclick = async () => {
    try {
      if (!soundEnabled) {
        audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
      }
      soundEnabled = !soundEnabled;
      bindKitchenSound();
      beepKitchen();
    } catch {
      toast("Suara tidak tersedia di browser ini. Notifikasi layar tetap aktif.");
    }
  };
}
function observeKitchen() {
  if (view !== "kitchen") return;
  const orders = (state.orders || []).filter(
    (o) =>
      o.store_id === store &&
      o.lines.some((l) => l.itemType === "recipe") &&
      (o.payment_status === "paid" || (!o.payment_status && o.status === "paid")),
  );
  const previous = seenKitchen.get(store);
  const incoming = previous
    ? orders.filter((o) => o.status === "queued" && !previous.has(o.id))
    : [];
  seenKitchen.set(store, new Set(orders.map((o) => o.id)));
  if (incoming.length) {
    toast(`${incoming.length} pesanan baru masuk ke kitchen`);
    beepKitchen();
  }
}
setInterval(async () => {
  const liveBatch = view === "reports" && document.querySelector("#batch-results");
  if (
    mode !== "live" ||
    busy ||
    polling ||
    (!["orders", "kitchen", "discounts"].includes(view) && !liveBatch)
  )
    return;
  if (liveBatch && (document.hidden || reportRefreshPending)) return;
  polling = true;
  const revision = stateRevision,
    sessionId = activeSessionId,
    reportRevision = reportRefreshRevision;
  try {
    const fresh = await request("/rest/v1/rpc/pos_read", {});
    if (
      mode !== "live" ||
      busy ||
      revision !== stateRevision ||
      sessionId !== activeSessionId ||
      reportRevision !== reportRefreshRevision
    )
      return;
    state = fresh;
    observeKitchen();
    if (view === "reports")
      document
        .querySelector("#report-result")
        ?.dispatchEvent(new CustomEvent("report-sync", { detail: { state } }));
    if (
      ["kitchen", "discounts"].includes(view) &&
      !document.querySelector("dialog[open]")
    )
      render();
    else
      document
        .querySelector("#order-products")
        ?.dispatchEvent(new CustomEvent("stock-refresh", { detail: state }));
    const status = document.querySelector("#kitchen-sync");
    if (status)
      status.textContent =
        "Terhubung · diperbarui " + new Date().toLocaleTimeString("id-ID");
  } catch (err) {
    if (
      mode !== "live" ||
      revision !== stateRevision ||
      sessionId !== activeSessionId ||
      reportRevision !== reportRefreshRevision
    )
      return;
    if (view === "reports")
      document
        .querySelector("#report-result")
        ?.dispatchEvent(new CustomEvent("report-sync", { detail: { error: true } }));
    const status = document.querySelector("#kitchen-sync");
    if (status)
      status.textContent =
        "Koneksi terputus. Mencoba lagi otomatis; tekan Perbarui untuk mencoba sekarang.";
  } finally {
    polling = false;
  }
}, 5000);
