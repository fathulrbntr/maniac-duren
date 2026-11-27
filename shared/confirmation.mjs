let activeDialog = null;

function ask(message, needsReason) {
  if (activeDialog) return Promise.resolve(null);

  const owner = document.activeElement?.closest("dialog");
  const dialog = document.createElement("dialog");
  dialog.className = "brand-confirmation";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-label", "Konfirmasi tindakan");
  dialog.setAttribute("aria-describedby", "confirmation-message");
  dialog.innerHTML = `<form><img src="/assets/logo.png" alt="Maniac Duren" width="128" height="70"><p id="confirmation-message"></p>${needsReason ? '<textarea aria-labelledby="confirmation-message" rows="3" required></textarea>' : ""}<div class="confirmation-actions"><button type="button" data-cancel>Batal</button><button type="submit" data-accept>Konfirmasi</button></div></form>`;
  dialog.querySelector("p").textContent = message;
  const cancel = dialog.querySelector("[data-cancel]");
  const input = dialog.querySelector("textarea");

  return new Promise((resolve) => {
    let result = null;
    const dismiss = () => dialog.close();
    dialog.onclose = () => {
      owner?.removeEventListener("close", dismiss);
      activeDialog = null;
      dialog.remove();
      resolve(result);
    };
    cancel.onclick = dismiss;
    dialog.oncancel = (event) => {
      event.preventDefault();
      dialog.close();
    };
    dialog.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      if (!dialog.hasAttribute("open") || (owner && !owner.open)) return dismiss();
      if (input && !input.value.trim()) {
        input.focus();
        return;
      }
      result = input ? input.value.trim() : true;
      dialog.close();
    };
    document.body.append(dialog);
    activeDialog = dialog;
    try {
      dialog.showModal();
    } catch {
      dialog.remove();
      activeDialog = null;
      resolve(null);
      return;
    }
    owner?.addEventListener("close", dismiss);
    (input || cancel).focus();
  });
}

export async function confirmAction(message) {
  return (await ask(message, false)) === true;
}

export function requestReason(message) {
  return ask(message, true);
}
