import { escape as e } from "./core.mjs";

const stages = {
  pending: ["Belum diproses", "Buka"],
  active: ["Sedang diproses", "Diproses"],
  done: ["Selesai", "Selesai"],
  cancelled: ["Dibatalkan", "Buka"],
  attention: ["Perlu diperiksa", "Buka"],
};

export function progressBadge(stage, label = stages[stage][0]) {
  return `<span class="progress-badge" data-progress-tone="${stage}">${e(label)}</span>`;
}

export function progressButton(stage, action, id, subject) {
  return `<button type="button" class="progress-open" data-${action}="${e(id)}" title="Buka ${e(subject)}">${stages[stage][1]}</button>`;
}

export function paymentStage(status) {
  return {
    unpaid: "pending",
    unknown: "pending",
    partial: "active",
    paid: "done",
    none: "done",
    overpaid: "attention",
    cancelled: "cancelled",
  }[status];
}
