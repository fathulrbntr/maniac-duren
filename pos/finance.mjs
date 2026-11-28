// Pure report calculations; immutable transaction costs stay authoritative.
export function sources(state, lotId, qty, seen = new Set()) {
  if (seen.has(lotId)) return [{ supplierId: null, cost: null, recovered: false }];
  const next = new Set(seen).add(lotId),
    lot = [...state.lots, ...state.unitLots].find((x) => x.id === lotId);
  if (!lot) return [{ supplierId: null, cost: null, recovered: false }];
  const origin = state.origins?.find((x) => x.lot_id === lotId);
  if (origin) {
    const denominator = lot.receivedQty ?? lot.receivedKg;
    return origin.inputs
      .flatMap((x) => sources(state, x.lotId, (qty * x.qty) / denominator, next))
      .map((x) => ({ ...x, recovered: x.recovered || lot.kind === "waste" }));
  }
  if (lot.sourceLotId) return sources(state, lot.sourceLotId, qty, next);
  return [
    {
      supplierId: lot.supplierId || null,
      cost: lot.unitCost == null ? null : qty * lot.unitCost,
      recovered: lot.kind === "waste",
    },
  ];
}
export function orderMargins(state, orders) {
  return orders.flatMap((order) =>
    order.lines.map((line) => {
      const consumption = (order.consumption || []).filter(
        (x) => x.lineId === line.lineId,
      );
      const ancestry = consumption.flatMap((c) => sources(state, c.lotId, c.qty));
      const known =
        consumption.length > 0 && consumption.every((c) => c.unitCost != null);
      const cost = known ? consumption.reduce((n, c) => n + c.qty * c.unitCost, 0) : null;
      const gross =
        order.subtotal ?? order.lines.reduce((n, l) => n + l.qty * l.price, 0);
      const revenue = gross > 0 ? (line.qty * line.price * order.total) / gross : 0;
      const recovered = ancestry.some((x) => x.recovered);
      return {
        orderId: order.id,
        line,
        name: line.name,
        revenue,
        cost,
        profit: cost == null ? null : revenue - cost,
        recovered,
        sources: ancestry,
      };
    }),
  );
}

export const finite = (v) =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
export const amount = (v) => (finite(v) ? Number(v) : null);
export const cost = (v) => (finite(v) && Number(v) >= 0 ? Number(v) : null);
export const sum = (rows) => rows.reduce((a, v) => a + (v ?? 0), 0);
export const complete = (values) =>
  values.every((v) => v !== null) ? sum(values) : null;
function lineCost(s, t, line) {
  if (t.kind === "sale") {
    const lot = (s.lots || []).find((l) => l.id === line.lotId),
      unitCost = cost(lot?.unitCost),
      kg = cost(line.kg);
    return unitCost === null || kg === null ? null : unitCost * kg;
  }
  // Never value historical consumption at today's master price.
  if (!line.lineId) return null;
  const used = (t.order.consumption || []).filter((c) => c.lineId === line.lineId);
  if (!used.length) return null;
  return complete(
    used.map((c) =>
      cost(c.qty) === null || cost(c.unitCost) === null
        ? null
        : Number(c.qty) * Number(c.unitCost),
    ),
  );
}
export function financialSummary(s, f, tx) {
  const places = new Set((s.stores || []).map((row) => row.id));
  const scope = (store) => places.has(store) && (!f.store || store === f.store);
  const inRange = (date) => date && date >= f.from && date <= f.to;
  const events = new Map((s.events || []).map((event) => [event.id, event]));
  const total = sum(tx.map((t) => t.total));
  const lines = tx.flatMap((t) =>
    t.lines.length
      ? t.lines.map((line) => ({ transaction: t, line, cost: lineCost(s, t, line) }))
      : [{ transaction: t, line: null, cost: null }],
  );
  const costs = lines.map((entry) => entry.cost);
  const lossRows = (s.money || []).filter(
    (x) => x.category === "loss" && scope(x.store_id),
  );
  const undatedLoss = lossRows.filter(
    (x) => !events.get(x.event_id)?.business_date,
  ).length;
  const losses = lossRows.filter((x) => inRange(events.get(x.event_id)?.business_date));
  const expenses = (s.expenses || []).filter(
    (x) => !x.voided && scope(x.store_id) && inRange(x.date),
  );
  const cogs = complete(costs),
    loss = undatedLoss ? null : complete(losses.map((x) => amount(x.cost))),
    operating = complete(expenses.map((x) => cost(x.amount)));
  const gross = cogs === null ? null : total - cogs,
    result = [cogs, loss, operating].some((x) => x === null)
      ? null
      : total - cogs - loss - operating;
  return {
    lines,
    totals: {
      cogs,
      knownCogs: sum(costs),
      unknownCogs: costs.filter((x) => x === null).length,
      loss,
      knownLoss: sum(losses.map((x) => amount(x.cost))),
      unknownLoss: undatedLoss + losses.filter((x) => !finite(x.cost)).length,
      losses,
      operating,
      expenses,
      gross,
      result,
      unknownOperating: expenses.filter((x) => cost(x.amount) === null).length,
    },
  };
}
