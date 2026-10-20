// Installation only: no service worker registration, offline queue or asset cache.
// The existing retirement worker remains available to retire older installations.
let deferredPrompt = null;
let started = false;
let installed = false;
let prompting = false;
let errorMessage = '';
let standalone;

function isInstalled() {
  return installed || standalone?.matches || globalThis.navigator?.standalone === true;
}

export function installButton() {
  return `<div class="pos-install" data-pos-install-control hidden><button type="button" class="pos-install-button" data-pos-install aria-label="Install aplikasi Maniac Duren POS" title="Install aplikasi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/></svg><span>Install aplikasi</span></button><span class="pos-install-status" data-pos-install-status role="status" hidden></span></div>`;
}

export function bindInstall() {
  if (typeof document === 'undefined') return;
  const ready = !!deferredPrompt && !isInstalled();
  document.querySelectorAll('[data-pos-install-control]').forEach(control => {
    control.hidden = isInstalled() || (!ready && !errorMessage);
    const button = control.querySelector('[data-pos-install]');
    button.hidden = !ready;
    button.disabled = prompting;
    const status = control.querySelector('[data-pos-install-status]');
    status.textContent = errorMessage;
    status.hidden = !errorMessage;
  });
}

async function promptInstall(event) {
  if (!event.target.closest?.('[data-pos-install]')) return;
  if (!deferredPrompt || prompting || isInstalled()) return;
  const prompt = deferredPrompt;
  prompting = true;
  errorMessage = '';
  bindInstall();
  try {
    // Invoke during the user's click, before yielding, to preserve user activation.
    await prompt.prompt();
    await prompt.userChoice;
  } catch {
    if (!isInstalled()) errorMessage = 'Belum berhasil dipasang. Coba melalui menu browser → Install.';
  } finally {
    // Each event can be used once; wait for a fresh event after dismissal.
    if (deferredPrompt === prompt) deferredPrompt = null;
    prompting = false;
    bindInstall();
  }
}

export function startPWA() {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return false;
  started = true;
  standalone = window.matchMedia?.('(display-mode: standalone)');
  standalone?.addEventListener?.('change', bindInstall);
  window.addEventListener('beforeinstallprompt', event => {
    if (isInstalled()) return;
    event.preventDefault();
    deferredPrompt = event;
    errorMessage = '';
    bindInstall();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    errorMessage = '';
    bindInstall();
  });
  document.addEventListener('click', promptInstall);
  bindInstall();
  return true;
}
