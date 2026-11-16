// The outlet picker is intentionally hidden while the sidebar is collapsed.
// Use the actual toggle; do not force-click controls or change application CSS.
export async function openSidebar(page) {
  await page.locator("#pos-main").waitFor({ state: "visible" });
  const picker = page.locator("#active-store");
  // CSS can already show the desktop picker while aria-expanded still reflects
  // the mobile layout until its queued matchMedia callback runs.
  if (!(await picker.isVisible())) await page.locator("#sidebar-toggle").click();
  await picker.waitFor({ state: "visible" });
}
