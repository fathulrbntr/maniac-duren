import { escape as e, num } from "./core.mjs";
import { field, options, sessionDialog, table } from "./supply-session-ui.mjs";
import {
  balanceAt,
  inventoryHistory,
  inventorySnapshot,
  inventoryTotals,
} from "./office-inventory.mjs";
import { inTransitLots } from "./warehouse-flow.mjs";
import { openFruitHistory } from "./fruit-history-ui.mjs";

const allowed = (s, workspace) =>
  s.access?.backoffice && workspace === "backoffice" && !s.stockDemo;
const columns = ["Di lokasi", "Dalam perjalanan", "Total stok"];
const qty = (value, unit, pieces) =>
  unit === "kg_butir"
    ? num(value) + " kg · " + num(pieces) + " butir"
    : num(value) + " " + e(unit);
function balances(b, unit) {
  return `<td>${qty(b.onHand, unit, b.pieces)}</td><td>${qty(b.transit, unit, b.transitPieces)}</td><td><b>${qty(b.onHand + b.transit, unit, b.pieces + b.transitPieces)}</b></td>`;
}
const signed = (v) => (Number(v) > 0 ? "+" : "") + num(v);
function ledger(dialog, entries) {
  const list = dialog.querySelector("[data-ledger]"),
    search = dialog.querySelector("[data-ledger-search]");
  let page = 0;
  function draw() {
    const q = search.value.trim().toLowerCase();
    const matches = entries.filter(
      (j) =>
        !q ||
        [j.reference, j.lot_id, j.label, j.route, j.store, j.supplier, j.date]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
    if (!matches.length) {
      list.innerHTML = `<p class="muted">${q ? "Riwayat yang dicari tidak ditemukan." : "Belum ada mutasi stok tercatat untuk pilihan ini."}</p>`;
      return;
    }
    const size = 30,
      start = page * size;
    list.innerHTML = table(
      ["Tanggal", "Kegiatan / lokasi", "Perubahan", "Dokumen / batch"],
      matches.slice(start, start + size).map(
        (j) => `<tr><td>${e(j.date)}</td>
      <td>${e(j.label)}<small>${e(j.store)}</small>${j.route ? "<small>" + e(j.route) + "</small>" : ""}</td>
      <td>${signed(j.qty)} ${e(j.unit)}${Number(j.pieces) ? "<small>" + signed(j.pieces) + " butir</small>" : ""}</td>
      <td>${e(j.reference || "—")}<small>Batch ${e(j.lot_id)}</small>${j.supplier_id ? "<small>" + e(j.supplier) + "</small>" : ""}${j.event_id ? "" : "<small>Berdasarkan catatan batch</small>"}</td></tr>`,
      ),
    );
    if (matches.length > size)
      list.innerHTML += `<div class="shift-pager"><button type="button" data-prev ${page ? "" : "disabled"}>Sebelumnya</button><span>${start + 1}–${Math.min(start + size, matches.length)} dari ${num(matches.length)} mutasi</span><button type="button" data-next ${start + size >= matches.length ? "disabled" : ""}>Berikutnya</button></div>`;
  }
  search.oninput = () => {
    page = 0;
    draw();
  };
  list.onclick = (ev) => {
    const b = ev.target.closest("[data-prev],[data-next]");
    if (b && !b.disabled) {
      page += b.hasAttribute("data-next") ? 1 : -1;
      draw();
    }
  };
  draw();
}

function showTrace(s, rows, storeId, ctx) {
  const p = rows[0].product,
    places = new Map((s.locations || s.stores || []).map((st) => [st.id, st.name]));
  const positions = rows
    .flatMap((row) =>
      [...row.places]
        .filter(([id]) => !storeId || id === storeId)
        .map(([id, b]) => ({ name: places.get(id) || id, unit: row.unit, b })),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  const shipments = inTransitLots(s).filter(
    (l) => l.productId === p.id && (!storeId || l.targetStoreId === storeId),
  );
  const inTransit = shipments.length
    ? "<h3>Surat jalan dalam perjalanan</h3>" +
      table(
        ["Surat jalan", "Asal → tujuan", "Jumlah"],
        shipments.map(
          (l) =>
            `<tr><td>${e(l.deliveryNo)}<small>Batch ${e(l.sourceLotId)}</small></td><td>${e(places.get(l.storeId) || l.storeId)} → ${e(places.get(l.targetStoreId) || l.targetStoreId)}</td><td>${qty(l.kg ?? l.qty, l.kg != null ? "kg_butir" : l.unit, l.pieces)}</td></tr>`,
        ),
      )
    : "";
  const dialog = sessionDialog(
    ctx,
    "Jejak stok · " + p.name,
    `<p>${e(p.sku || "—")} · ${e(places.get(storeId) || "Semua lokasi")}</p><h3>Posisi stok</h3>${table(
      ["Lokasi", ...columns],
      positions.map((r) => `<tr><td>${e(r.name)}</td>${balances(r.b, r.unit)}</tr>`),
    )}
  ${inTransit}<h3>Riwayat mutasi</h3>${field("Cari mutasi", '<input type="search" data-ledger-search placeholder="Kegiatan, lokasi, nota, surat jalan, atau batch">')}<div data-ledger></div>`,
  );
  dialog.querySelector(".modal-actions .close")?.remove();
  for (const event of ["input", "change"])
    dialog.addEventListener(event, () => delete dialog.dataset.dirty);
  ledger(dialog, inventoryHistory(s, p.id, storeId));
}

export function officeInventoryPage(s, workspace) {
  if (!allowed(s, workspace)) return "";
  return `<section class="supply-workspace" data-office-inventory>
    <section class="panel"><div class="toolbar"><h2>Ringkasan stok</h2><button type="button" data-inv-refresh>Perbarui stok</button></div>
    ${field("Lokasi stok", "<select data-inv-place></select>")}
    <p class="muted">Kiriman dalam perjalanan dikelompokkan menurut lokasi tujuan sampai penerimaan dikonfirmasi.</p>
    <div data-inv-totals></div></section>
    <section class="panel"><h2>Stok per SKU</h2><div class="form-grid">
    ${field("Cari barang", '<input type="search" placeholder="Nama barang atau SKU" data-inv-search>')}
    <form data-inv-barcode-form role="search" aria-label="Jejak per buah">${field("Jejak per buah", '<input type="text" data-inv-barcode autocomplete="off" placeholder="Scan atau ketik barcode buah" required>')}<button type="submit">Telusuri barcode</button></form></div>
    <div data-inv-rows></div></section></section>`;
}

export function bindOfficeInventory(s, ctx, initialPlace = "") {
  const root = document.querySelector("[data-office-inventory]");
  if (!root || !allowed(s, ctx.workspace)) return;
  const place = root.querySelector("[data-inv-place]"),
    search = root.querySelector("[data-inv-search]"),
    summary = root.querySelector("[data-inv-totals]"),
    list = root.querySelector("[data-inv-rows]"),
    refresh = root.querySelector("[data-inv-refresh]");
  let rows;
  function drawList() {
    const q = search.value.trim().toLowerCase();
    const matches = rows.filter(
      ({ product: p }) =>
        !q || [p.name, p.sku, p.variant].join(" ").toLowerCase().includes(q),
    );
    list.innerHTML = matches.length
      ? table(
          ["Barang / SKU", ...columns, "Jejak stok"],
          matches.map(
            (row) =>
              `<tr data-inv-id="${e(row.product.id)}"><td><b>${e(row.product.name)}</b><small>${e(row.product.sku || "—")}</small></td>${balances(balanceAt(row, place.value), row.unit)}<td><button type="button" data-inv-trace="${e(row.product.id)}">Lihat jejak</button></td></tr>`,
          ),
        )
      : '<p class="muted">Barang tidak ditemukan.</p>';
  }
  function draw() {
    const totals = [...inventoryTotals(rows, place.value)].filter(
      ([, b]) => b.onHand || b.transit || b.pieces || b.transitPieces,
    );
    summary.innerHTML = totals.length
      ? table(
          ["Satuan", ...columns],
          totals.map(
            ([unit, b]) =>
              `<tr><td>${e(unit === "kg_butir" ? "Buah timbang" : unit)}</td>${balances(b, unit)}</tr>`,
          ),
        )
      : '<p class="muted">Belum ada stok di lokasi atau dalam perjalanan.</p>';
    drawList();
  }
  function load(state, selected = place.value) {
    if (!allowed(state, ctx.workspace)) {
      root.replaceChildren();
      return;
    }
    s = state;
    rows = inventorySnapshot(s);
    place.innerHTML =
      '<option value="">Semua lokasi</option>' +
      options(s.locations || s.stores || [], selected);
    draw();
  }
  load(s, initialPlace);
  place.onchange = draw;
  search.oninput = drawList;
  list.onclick = (ev) => {
    const id = ev.target.closest("[data-inv-trace]")?.dataset.invTrace;
    if (id && allowed(ctx.getState(), ctx.workspace))
      showTrace(
        s,
        rows.filter((r) => r.product.id === id),
        place.value,
        ctx,
      );
  };
  refresh.onclick = async () => {
    refresh.disabled = true;
    try {
      await ctx.refresh();
      if (root.isConnected) load(ctx.getState());
    } catch (err) {
      ctx.toast(err.message);
    } finally {
      refresh.disabled = false;
    }
  };
  root.querySelector("[data-inv-barcode-form]").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget,
      button = form.querySelector("button"),
      code = form.querySelector("input").value.trim();
    if (!code || button.disabled || !allowed(ctx.getState(), ctx.workspace)) return;
    button.disabled = true;
    try {
      await openFruitHistory(s, code, ctx);
    } catch (err) {
      ctx.toast(err.message);
    } finally {
      button.disabled = false;
    }
  };
}
