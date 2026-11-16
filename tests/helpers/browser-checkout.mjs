// Optional checkout fields live inside a native <details> panel.
// Reopen it after navigation or a completed order rebuilds the checkout.
export async function openCheckoutOptions(page) {
  const options = page.locator(".order-options");
  await options.waitFor({ state: "visible" });
  if ((await options.getAttribute("open")) === null)
    await options.locator("summary").click();
  await options.locator("#order-table").waitFor({ state: "visible" });
}
