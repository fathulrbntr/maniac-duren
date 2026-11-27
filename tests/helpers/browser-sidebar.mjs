// The outlet picker is intentionally hidden while the sidebar is collapsed.
// Use the actual toggle; do not force-click controls or change application CSS.
export async function openSidebar(page) {
  await page.locator("#pos-main").waitFor({ state: "visible" });
  // Wait for the controller to apply the current breakpoint. A frame count is
  // not a readiness signal, and visibility stays true during a closing animation.
  await page.waitForFunction((expectedWidth) => {
    if (expectedWidth && window.innerWidth !== expectedWidth) return false;
    const shell = document.querySelector(".shell"),
      panel = document.querySelector("#pos-sidebar"),
      toggle = document.querySelector("#sidebar-toggle");
    if (!shell || !panel || !toggle) return false;
    const mobile = window.matchMedia("(max-width: 900px)").matches,
      open = mobile
        ? shell.dataset.mobileOpen === "true"
        : shell.dataset.sidebarCollapsed === "false",
      hidden = mobile && !open;
    return (
      panel.inert === hidden &&
      panel.getAttribute("aria-hidden") === String(hidden) &&
      toggle.getAttribute("aria-expanded") === String(open)
    );
  }, page.viewportSize()?.width);
  const toggle = page.locator("#sidebar-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page
    .locator('#pos-sidebar[aria-hidden="false"]:not([inert])')
    .waitFor({ state: "visible" });
  await page.locator("#pos-navigation").waitFor({ state: "visible" });
}
