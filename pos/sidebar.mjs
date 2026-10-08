const key = 'maniac-pos-sidebar-v1';
export const sidebarIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>';
export function createSidebarController(root = document, viewport = window) {
  let storage;
  try { storage = viewport.localStorage; } catch {}
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(key) || '{}') || {}; } catch {}
  let collapsed = saved.collapsed === true, mobileOpen = false, scroll = 0;
  const closedGroups = {};
  for (const group of ['utama','inventory','produksi','laporan','manajemen','bantuan']) {
    if (saved.groups?.[group] === true) closedGroups[group] = true;
  }
  const media = viewport.matchMedia?.('(max-width: 900px)');
  const mobile = () => !!media?.matches;
  const write = () => { try { storage?.setItem(key, JSON.stringify({ collapsed, groups: closedGroups })); } catch {} };
  const attributes = () => `data-sidebar-collapsed="${collapsed}" data-mobile-open="${mobileOpen}"`;
  function sync() {
    const shell = root.querySelector('.shell'), panel = root.querySelector('#pos-sidebar'), main = root.querySelector('#pos-main');
    const shown = mobile() ? mobileOpen : !collapsed;
    if (shell) { shell.dataset.sidebarCollapsed = String(collapsed);shell.dataset.mobileOpen = String(mobileOpen); }
    if (panel) { panel.inert = !shown;panel.setAttribute('aria-hidden', String(!shown)); }
    if (main) main.inert = mobile() && mobileOpen;
    root.body?.classList.toggle('sidebar-mobile-open', !!shell && mobile() && mobileOpen);
    root.querySelectorAll('[data-sidebar-toggle]').forEach(button => {
      button.setAttribute('aria-expanded', String(shown));
      button.setAttribute('aria-label', shown ? 'Tutup sidebar' : 'Buka sidebar');
      button.title = shown ? 'Tutup sidebar' : 'Buka sidebar';
    });
  }
  function close(restoreFocus = true) {
    if (mobile()) mobileOpen = false; else { collapsed = true;write(); }
    sync();
    if (restoreFocus) root.querySelector('#sidebar-toggle')?.focus();
  }
  root.addEventListener('click', event => {
    if (event.target.closest('[data-sidebar-close]')) { close();return; }
    if (!event.target.closest('[data-sidebar-toggle]')) return;
    if (mobile()) mobileOpen = !mobileOpen;else { collapsed = !collapsed;write(); }
    sync();
    if ((mobile() && mobileOpen) || (!mobile() && !collapsed)) root.querySelector('#pos-sidebar [data-sidebar-toggle]')?.focus();
    else root.querySelector('#sidebar-toggle')?.focus();
  });
  root.addEventListener('keydown', event => {
    if (!mobile() || !mobileOpen || root.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') { event.preventDefault();close();return; }
    if (event.key !== 'Tab') return;
    const panel = root.querySelector('#pos-sidebar');
    if (!panel) return;
    const focusable = [...panel.querySelectorAll('button:not(:disabled),select,input,a[href],summary')].filter(node => !node.hidden && node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (!first) return;
    if (!panel.contains(root.activeElement)) { event.preventDefault();first.focus(); }
    else if (event.shiftKey && root.activeElement === first) { event.preventDefault();last.focus(); }
    else if (!event.shiftKey && root.activeElement === last) { event.preventDefault();first.focus(); }
  });
  media?.addEventListener('change', () => { mobileOpen = false;sync(); });
  return {
    attributes, closedGroups,
    capture() { const nav = root.querySelector('#pos-navigation');if (nav) scroll = nav.scrollTop; },
    mount() {
      sync();
      const nav = root.querySelector('#pos-navigation');if (nav) nav.scrollTop = scroll;
      root.querySelectorAll('[data-nav-group]').forEach(group => group.addEventListener('toggle', () => {
        if (!group.isConnected) return;
        closedGroups[group.dataset.navGroup] = !group.open;write();
      }));
    },
    navigate() { mobileOpen = false; },
    reset() { mobileOpen = false;scroll = 0;root.body?.classList.remove('sidebar-mobile-open'); },
  };
}
