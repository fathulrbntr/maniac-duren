import assert from "node:assert/strict";
import { createSidebarController } from "../pos/sidebar.mjs";
import { navigation, sections, visibleSections } from "../pos/navigation.mjs";
import { openSidebar } from "./helpers/browser-sidebar.mjs";

const pages = sections.flatMap((x) => x.pages);
assert.equal(new Set(pages).size, pages.length, "Each menu must appear only once");
assert.deepEqual(
  visibleSections({}).flatMap((x) => x.pages),
  ["guide"],
);
assert.deepEqual(
  visibleSections({ sell: true, attendance: true }).flatMap((x) => x.pages),
  ["shifts", "orders", "kitchen", "devices", "attendance", "guide"],
);
assert(
  !visibleSections({ master: true })
    .flatMap((x) => x.pages)
    .includes("employees"),
);
assert(!pages.includes("losses"), "One shared reject/waste menu");
assert(
  pages.includes("waste") && pages.includes("reports") && pages.includes("documents"),
);
assert(
  !pages.includes("batches") &&
    !pages.includes("finance") &&
    !pages.includes("salesreport") &&
    !pages.includes("trace"),
);
assert(
  visibleSections({ trace: true })
    .flatMap((x) => x.pages)
    .includes("reports"),
);
assert(
  visibleSections({ waste: true })
    .flatMap((x) => x.pages)
    .includes("reports"),
);
const labels = Object.fromEntries(pages.map((x) => [x, x]));
const markup = navigation(labels, "orders", () => "<svg></svg>", null, {
  pelayanan: true,
  inventory: true,
});
assert.match(markup, /data-nav-group="pelayanan" open/);
assert.match(markup, /data-nav-group="inventory" >/);
assert.equal((markup.match(/aria-current="page"/g) || []).length, 1);

function fixture({ mobile = false, saved = "{}", blocked = false } = {}) {
  const listeners = {},
    values = new Map([["maniac-pos-sidebar-v1", saved]]),
    flags = new Set();
  const root = {
    activeElement: null,
    body: {
      classList: {
        toggle(k, v) {
          v ? flags.add(k) : flags.delete(k);
        },
        remove(k) {
          flags.delete(k);
        },
      },
    },
    addEventListener(k, fn) {
      listeners[k] = fn;
    },
  };
  const node = () => ({
    dataset: {},
    attrs: {},
    inert: false,
    focus() {
      root.activeElement = this;
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getAttribute(k) {
      return this.attrs[k] ?? null;
    },
    getClientRects() {
      return [1];
    },
  });
  const shell = node(),
    panel = node(),
    main = node(),
    outside = node(),
    inside = node(),
    last = node(),
    nav = { scrollTop: 0 };
  panel.querySelectorAll = (k) => (k === "[data-nav-group]" ? [group] : [inside, last]);
  panel.contains = (x) => [inside, last].includes(x);
  const group = {
    querySelector: () => null,
    open: true,
    isConnected: true,
    dataset: { navGroup: "inventory" },
    addEventListener(_, fn) {
      this.onToggle = fn;
    },
  };
  const lookup = {
    ".shell": shell,
    "#pos-sidebar": panel,
    "#pos-main": main,
    "#sidebar-toggle": outside,
    "#pos-sidebar [data-sidebar-toggle]": inside,
    "#pos-navigation": nav,
  };
  root.querySelector = (k) => lookup[k] || null;
  root.querySelectorAll = (k) =>
    k === "[data-sidebar-toggle]"
      ? [outside, inside]
      : k === "[data-nav-group]"
        ? [group]
        : [];
  const media = {
    matches: mobile,
    addEventListener(_, fn) {
      this.change = fn;
    },
  };
  const viewport = {
    innerWidth: mobile ? 900 : 1600,
    matchMedia: () => media,
    get localStorage() {
      if (blocked) throw Error("Blocked storage");
      return { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
    },
  };
  const ctrl = createSidebarController(root, viewport);
  ctrl.mount();
  const click = (k) =>
    listeners.click({
      target: { closest: (selector) => (selector === k ? inside : null) },
    });
  const key = (k, shift = false) => {
    let prevented = false;
    listeners.keydown({
      key: k,
      shiftKey: shift,
      preventDefault() {
        prevented = true;
      },
    });
    return prevented;
  };
  return {
    ctrl,
    root,
    shell,
    panel,
    main,
    outside,
    inside,
    last,
    nav,
    group,
    values,
    flags,
    media,
    viewport,
    click,
    key,
  };
}
let f = fixture();
assert.equal(
  f.shell.dataset.sidebarCollapsed,
  "true",
  "New sessions start in compact navigation",
);
assert.equal(f.panel.inert, false, "Compact navigation remains keyboard accessible");
assert.equal(f.group.open, true, "All compact groups expose their icons");
// Browser setup must open the real sidebar before waiting for its outlet picker.
for (const config of [
  {},
  { saved: '{"collapsed":false}' },
  { mobile: true },
  { mobile: true, saved: '{"collapsed":false}', resizedToDesktop: true },
  { saved: '{"collapsed":false}', resizedToMobile: true },
  { resizedToMobile: true },
  { saved: '{"collapsed":false}', resizedToMobile: true, layoutPending: true },
  { saved: '{"collapsed":false}', resizedToMobile: true, closingTransition: true },
]) {
  const current = fixture(config);
  // Layout and CSS visibility can lead or lag the controller during resize.
  // In particular, a closed/inert mobile panel remains visible while animating out.
  let resizePending = !!(config.resizedToDesktop || config.resizedToMobile);
  if (config.resizedToDesktop) current.media.matches = false;
  if (config.resizedToMobile) current.media.matches = true;
  const expectedWidth = current.media.matches ? 900 : 1600;
  if (!config.layoutPending) current.viewport.innerWidth = expectedWidth;
  else current.media.matches = !!config.mobile;
  const pickerVisible = () =>
    config.closingTransition ||
    (current.media.matches
      ? current.shell.dataset.mobileOpen === "true"
      : current.shell.dataset.sidebarCollapsed === "false");
  const settleResize = () => {
    if (resizePending) {
      resizePending = false;
      current.viewport.innerWidth = expectedWidth;
      current.media.matches = expectedWidth <= 900;
      current.media.change();
    }
  };
  let clicks = 0;
  const page = {
    viewportSize: () => ({ width: expectedWidth, height: 1000 }),
    async waitForFunction(predicate, arg) {
      const previousDocument = globalThis.document,
        previousWindow = globalThis.window;
      try {
        globalThis.document = current.root;
        globalThis.window = current.viewport;
        if (resizePending)
          assert.equal(predicate(arg), false, "wait for viewport and controller");
        settleResize();
        assert.equal(predicate(arg), true, "controller now agrees with the viewport");
      } finally {
        globalThis.document = previousDocument;
        globalThis.window = previousWindow;
      }
    },
    locator(selector) {
      if (selector === "#pos-main") return { waitFor: async () => {} };
      if (selector === "#pos-sidebar") return { evaluate: async () => settleResize() };
      if (selector === '#pos-sidebar[aria-hidden="false"]:not([inert])')
        return {
          waitFor: async () => {
            assert.equal(current.panel.inert, false);
            assert.equal(current.panel.attrs["aria-hidden"], "false");
          },
        };
      if (selector === "#sidebar-toggle")
        return {
          getAttribute: async (name) => {
            const value = current.outside.attrs[name];
            settleResize();
            return value;
          },
          click: async () => {
            assert(
              current.media.matches || current.shell.dataset.sidebarCollapsed === "true",
              "desktop header toggle is hidden while the sidebar is expanded",
            );
            clicks++;
            current.click("[data-sidebar-toggle]");
          },
        };
      assert.equal(selector, "#pos-navigation");
      return {
        isVisible: async () => {
          const visible = pickerVisible();
          settleResize();
          return visible;
        },
        waitFor: async ({ state }) => {
          assert.equal(state, "visible");
          assert.equal(
            current.outside.attrs["aria-expanded"],
            "true",
            "navigation must be expanded before interacting with sidebar controls",
          );
          assert.equal(current.panel.inert, false);
        },
      };
    },
  };
  await openSidebar(page);
  await openSidebar(page);
  assert.equal(
    clicks,
    config.resizedToMobile || !config.saved ? 1 : 0,
    "opening an already-open sidebar must not close it",
  );
}
f = fixture({ saved: '{"collapsed":false}' });
assert.equal(f.panel.inert, false);
assert.equal(f.main.inert, false);
f.click("[data-sidebar-toggle]");
assert.equal(f.shell.dataset.sidebarCollapsed, "true");
assert.equal(f.panel.inert, false);
assert.equal(f.outside.attrs["aria-expanded"], "false");
assert.equal(f.root.activeElement, f.outside);
assert.equal(JSON.parse(f.values.get("maniac-pos-sidebar-v1")).collapsed, true);
f.click("[data-sidebar-toggle]");
assert.equal(f.panel.inert, false);
assert.equal(f.root.activeElement, f.inside);
f.nav.scrollTop = 200;
f.ctrl.capture();
f.nav.scrollTop = 0;
f.ctrl.mount();
assert.equal(f.nav.scrollTop, 200);
f.group.open = false;
f.group.onToggle();
assert.equal(f.ctrl.closedGroups.inventory, true);
assert.equal(JSON.parse(f.values.get("maniac-pos-sidebar-v1")).groups.inventory, true);
f = fixture({ saved: '{"collapsed":true,"groups":{"laporan":true}}' });
assert.equal(f.panel.inert, false);
assert.equal(f.ctrl.closedGroups.laporan, true);
for (const config of [{ saved: "invalid json" }, { blocked: true }]) {
  f = fixture(config);
  f.click("[data-sidebar-toggle]");
  assert.equal(f.panel.inert, false);
}
f = fixture({ mobile: true });
assert.equal(f.panel.inert, true);
assert.equal(f.main.inert, false);
f.click("[data-sidebar-toggle]");
assert.equal(f.panel.inert, false);
assert.equal(f.main.inert, true);
assert(f.flags.has("sidebar-mobile-open"));
assert.equal(f.root.activeElement, f.inside);
f.root.activeElement = f.last;
assert(f.key("Tab"));
assert.equal(f.root.activeElement, f.inside);
f.root.activeElement = f.inside;
assert(f.key("Tab", true));
assert.equal(f.root.activeElement, f.last);
assert(f.key("Escape"));
assert.equal(f.panel.inert, true);
assert.equal(f.main.inert, false);
assert.equal(f.root.activeElement, f.outside);
f.click("[data-sidebar-toggle]");
f.ctrl.navigate();
f.ctrl.mount();
assert.equal(f.panel.inert, true);
assert(!f.flags.has("sidebar-mobile-open"));
f.click("[data-sidebar-toggle]");
f.click("[data-sidebar-close]");
assert.equal(f.main.inert, false);
f.click("[data-sidebar-toggle]");
f.media.matches = false;
f.media.change();
assert.equal(f.main.inert, false);
assert(!f.flags.has("sidebar-mobile-open"));
f.ctrl.reset();
assert(!f.flags.has("sidebar-mobile-open"));
// A click may run after the CSS breakpoint changes but before its media event.
// The queued event must not undo an explicit open in the new viewport.
for (const collapsed of [true, false]) {
  f = fixture({ saved: JSON.stringify({ collapsed }) });
  f.media.matches = true;
  f.click("[data-sidebar-toggle]");
  assert.equal(f.panel.inert, false);
  assert.equal(f.main.inert, true);
  f.media.change();
  assert.equal(f.panel.inert, false, "delayed resize must keep the new menu open");
  assert.equal(f.shell.dataset.mobileOpen, "true");
  assert.equal(f.main.inert, true);
  f.ctrl.navigate();
  f.ctrl.mount();
  assert.equal(f.panel.inert, true, "navigation still closes the mobile menu");
  f.media.matches = false;
  f.ctrl.mount();
  f.media.change();
  assert.equal(f.panel.inert, false, "desktop rail remains accessible after resize");
  assert.equal(f.main.inert, false);
}
console.log(
  "PASS: menu permissions, unique groups, desktop toggle/persistence, scroll retention, blocked storage, mobile overlay, Escape, focus trap, navigation, resize and delayed desktop media synchronization.",
);
