import { escape as e, id } from "./core.mjs";
import {
  loadWorkflowPending,
  clearWorkflowPending,
  saveWorkflow,
} from "./warehouse-workflow.mjs";
export const field = (label, html) => `<label class="field">${e(label)}${html}</label>`;
export const table = (heads, rows) =>
  `<div class="table-wrap"><table><thead><tr>${heads.map((x) => `<th>${e(x)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${heads.length}">Belum ada data.</td></tr>`}</tbody></table></div>`;
export const name = (s, key, v) => s[key]?.find((x) => x.id === v)?.name || "—";
export const options = (xs, value) =>
  xs
    .map(
      (x) =>
        `<option value="${e(x.id)}" ${x.id === value ? "selected" : ""}>${e(x.name)}</option>`,
    )
    .join("");
export function sessionDialog(ctx, title, body) {
  const d = ctx.modal(e(title), body, "Tutup");
  d.classList.add("supply-modal");
  d.querySelector("form").onsubmit = (ev) => {
    ev.preventDefault();
    d.close();
  };
  return d;
}
export function submitSession(d, ctx, key, action, payload, onDone, onFailure) {
  let working = false;
  const request = id();
  d.querySelector("form").onsubmit = async (ev) => {
    ev.preventDefault();
    if (working || !ev.currentTarget.reportValidity()) return;
    working = true;
    try {
      await saveWorkflow(ctx.getState(), key, ctx, action, {
        id: request,
        ...payload(ev.currentTarget),
      });
      d.dataset.dirty = "false";
      d.close();
      ctx.render();
      onDone?.();
    } catch (err) {
      d.querySelector("#form-error").textContent = err.message;
      onFailure?.();
    } finally {
      working = false;
    }
  };
}
export function bindRecovery(d, ctx, key, reopen) {
  const box = document.createElement("div");
  box.className = "notice";
  box.dataset.workflowRecovery = "";
  d.querySelector("form").prepend(box);
  const draw = () => {
    const s = ctx.getState(),
      pending = loadWorkflowPending(s, key);
    if (pending && s.supplyEvents?.some((x) => x.id === pending.payload.id))
      clearWorkflowPending(s, key);
    const saved = loadWorkflowPending(s, key);
    box.hidden = !saved;
    box.innerHTML = saved
      ? '<p>Penyimpanan sebelumnya belum dikonfirmasi. Data dan ID operasi tetap disimpan di perangkat ini.</p><button type="button" data-session-refresh>Perbarui status</button><button type="button" data-session-retry>Kirim ulang</button>'
      : "";
    box.querySelector("[data-session-refresh]")?.addEventListener("click", async () => {
      try {
        await ctx.refresh();
        d.dataset.dirty = "false";
        d.close();
        ctx.render();
        reopen();
      } catch (err) {
        d.querySelector("#form-error").textContent = err.message;
      }
    });
    box.querySelector("[data-session-retry]")?.addEventListener("click", async () => {
      try {
        await saveWorkflow(ctx.getState(), key, ctx, saved.action, saved.payload);
        d.dataset.dirty = "false";
        d.close();
        ctx.render();
        reopen();
      } catch (err) {
        d.querySelector("#form-error").textContent = err.message;
        draw();
      }
    });
  };
  draw();
  return draw;
}
