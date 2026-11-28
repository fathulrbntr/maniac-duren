// On the exit warning the next Back is left to the browser or Android itself.
const exitDelay = 2500;
const entry = "maniacPosBack";

export function createBackNavigation({ atHome, returnHome, warnExit }, host = window) {
  const history = host.history;
  const standalone = host.matchMedia?.("(display-mode: standalone)")?.matches;
  const android = /Android/i.test(host.navigator?.userAgent || "");
  const nativeBack = typeof host.CloseWatcher === "function" && android && standalone;
  let enabled = false;
  let watcher = null;
  let timer = null;
  let dismissWarning;
  let forwardAvailable = false;
  let restoring = false;
  let navigating = false;

  function cancelWarning() {
    clearTimeout(timer);
    timer = null;
    dismissWarning?.();
    dismissWarning = undefined;
  }

  function listen() {
    if (!enabled || timer !== null) return;
    if (nativeBack) {
      if (!watcher) {
        watcher = new host.CloseWatcher();
        watcher.onclose = () => {
          watcher = null;
          back();
        };
      }
      return;
    }
    if (!history || history.state?.[entry] === "guard" || restoring) return;
    if (forwardAvailable && history.state?.[entry] === "base") {
      // Reuse the existing entry. Adding entries during Back breaks native gestures.
      restoring = true;
      history.forward();
    } else {
      if (!standalone && history.length === 1 && !history.state?.[entry]) {
        // A directly opened browser tab has no previous site to return to.
        history.replaceState({ ...history.state, [entry]: "exit" }, "");
        history.pushState({ ...history.state, [entry]: "base" }, "");
      } else {
        history.replaceState({ ...history.state, [entry]: "base" }, "");
      }
      history.pushState({ ...history.state, [entry]: "guard" }, "");
    }
  }

  async function goHome() {
    cancelWarning();
    listen();
    if (navigating || !enabled) return;
    navigating = true;
    try {
      await returnHome();
    } finally {
      navigating = false;
    }
  }

  function back() {
    if (!enabled) return;
    if (!atHome() || navigating) {
      void goHome();
      return;
    }
    dismissWarning = warnExit(exitDelay);
    timer = setTimeout(() => {
      cancelWarning();
      listen();
    }, exitDelay);
  }

  host.addEventListener("popstate", (event) => {
    if (nativeBack) return;
    restoring = false;
    forwardAvailable = event.state?.[entry] === "base";
    if (!enabled) return;
    if (event.state?.[entry] === "exit") host.location.replace("/");
    else if (forwardAvailable) back();
    else cancelWarning();
  });
  // Android can deliver Back directly to a native dialog instead of to history.
  if (android) {
    host.document.addEventListener(
      "cancel",
      (event) => {
        if (!enabled || !event.target.matches("dialog[open]:not(.brand-confirmation)"))
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void goHome();
      },
      true,
    );
  }

  host.document?.addEventListener(
    "click",
    () => {
      if (timer !== null) {
        cancelWarning();
        listen();
      }
    },
    true,
  );

  function reopen() {
    if (!enabled) return;
    forwardAvailable = false;
    restoring = false;
    void goHome();
  }
  host.addEventListener("pageshow", (event) => {
    if (event.persisted) reopen();
  });
  host.launchQueue?.setConsumer(reopen);
  host.addEventListener("pagehide", () => {
    cancelWarning();
    watcher?.destroy();
    watcher = null;
  });
  return {
    sync() {
      enabled = true;
      if (!atHome()) cancelWarning();
      listen();
    },
    stop() {
      enabled = false;
      cancelWarning();
      watcher?.destroy();
      watcher = null;
    },
  };
}
