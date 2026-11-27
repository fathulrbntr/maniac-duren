// These suites exercise the workflow after confirmation. The warehouse browser suite
// exercises the prompt itself, including dismissal, focus, layout and acceptance.
export async function acceptConfirmations(page) {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      document.querySelector("dialog.brand-confirmation[open] [data-accept]")?.click();
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
  });
}
