import { escape as e } from "./core.mjs";
import { fruitStatus } from "./scale-label.mjs";
import { name, sessionDialog, table } from "./supply-session-ui.mjs";

export async function openFruitHistory(s, code, ctx) {
  const events = await ctx.rpc("pos_fruit_history", { code });
  const labels = {
    transfer_dispatch: "Transfer keluar",
    transfer_receive: "Transfer diterima",
    transfer_cancel: "Pengiriman dibatalkan",
    fruit_cut_check: "Pemeriksaan tukang potong",
    label_link: "Tautkan label ke stok batch",
    receipt: "Penerimaan",
    receipt_batch: "Penerimaan",
    order_create: "Penjualan",
    sale: "Penjualan",
    order_void: "Pembatalan penjualan",
    order_cancel: "Pembatalan pesanan",
    void: "Pembatalan penjualan",
    movement: "Transfer",
    reject_mark: "Catat reject",
    reject_process: "Olah reject",
    reject_loss: "Waste",
    reject_void: "Pembatalan reject / waste",
  };
  const h = sessionDialog(
    ctx,
    "Jejak buah",
    `<p><code>${e(code)}</code></p>${table(
      ["Waktu", "Kegiatan", "Status setelah proses", "Outlet", "Petugas"],
      events.map(
        (x) =>
          `<tr><td>${e(new Date(x.at).toLocaleString("id-ID"))}</td><td>${e(labels[x.action] || x.action)}</td><td>${e(fruitStatus[x.toStatus] || x.toStatus)}</td><td>${e(name(s, "stores", x.storeId))}</td><td>${e(x.actor || "—")}</td></tr>`,
      ),
    )}`,
  );
  h.querySelector(".modal-actions .close")?.remove();
}
