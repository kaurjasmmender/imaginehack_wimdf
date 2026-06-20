import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import { forecast } from "../lib/forecast";
import scenario from "../data/scenario.json";
import type { PastEvent, EventType } from "../lib/types";

export default function SupplierOrders() {
  const { inventory, recipes, events, suppliers } = useStore();
  const pastEvents = scenario.pastEvents as PastEvent[];
  const [lean, setLean] = useState(false);
  const coverage = lean ? 0.9 : 1.0;

  // 1) Sum forecasted ingredient needs across ALL upcoming events
  const needsByItem = useMemo(() => {
    const map: Record<string, { name: string; needKg: number }> = {};
    for (const ev of events) {
      const r = forecast(pastEvents, recipes, inventory, ev.menu, ev.eventType as EventType, ev.guestCount, coverage);
      for (const dish of r.dishes) {
        for (const ing of dish.ingredientNeeds) {
          if (!map[ing.itemId]) map[ing.itemId] = { name: ing.name, needKg: 0 };
          map[ing.itemId].needKg += ing.kg;
        }
      }
    }
    return map;
  }, [events, recipes, inventory, pastEvents, coverage]);

  // 2) Subtract current stock -> shortfall to order
  const orderLines = useMemo(() => {
    return Object.entries(needsByItem).map(([itemId, n]) => {
      const item = inventory.find((i) => i.id === itemId) ||
                   inventory.find((i) => i.name.toLowerCase() === n.name.toLowerCase());
      const haveKg = item?.qtyKg ?? 0;
      const orderKg = +Math.max(0, n.needKg - haveKg).toFixed(1);
      return { itemId, name: item?.name ?? n.name, needKg: +n.needKg.toFixed(1), haveKg, orderKg, costPerKg: item?.costPerKg ?? 0 };
    }).filter((l) => l.orderKg > 0);
  }, [needsByItem, inventory]);

  // 3) Group by supplier
  const grouped = useMemo(() => {
    const out: { supplier: any; lines: typeof orderLines; total: number }[] = [];
    const assigned = new Set<string>();
    for (const sup of suppliers) {
      const lines = orderLines.filter((l) => sup.itemsSupplied.includes(l.itemId));
      lines.forEach((l) => assigned.add(l.itemId));
      if (lines.length) out.push({ supplier: sup, lines, total: lines.reduce((s, l) => s + l.orderKg * l.costPerKg, 0) });
    }
    // anything not matched to a supplier
    const other = orderLines.filter((l) => !assigned.has(l.itemId));
    if (other.length) out.push({ supplier: { id: "other", name: "Unassigned / no supplier", leadTimeDays: null }, lines: other, total: other.reduce((s, l) => s + l.orderKg * l.costPerKg, 0) });
    return out;
  }, [orderLines, suppliers]);

  const grandTotal = grouped.reduce((s, g) => s + g.total, 0);
  const totalItems = orderLines.length;

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[var(--muted)] max-w-xl">
          We forecast every upcoming event, add up the ingredients, subtract what you already have, and tell you exactly what to order — grouped by supplier, so you never over-buy "just to be safe."
        </p>
        <label className="flex items-center gap-2 text-sm text-[var(--cream)] cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={lean} onChange={(e) => setLean(e.target.checked)} className="accent-[var(--herb)]" style={{ width: 16, height: 16 }} />
          Lean ordering
        </label>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Events covered</p>
          <p className="font-display text-3xl text-[var(--cream)] mt-1">{events.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Items to order</p>
          <p className="font-display text-3xl text-[var(--cream)] mt-1">{totalItems}</p>
        </div>
        <div className="rounded-2xl border border-[var(--herb-dim)]/40 bg-[var(--herb)]/[0.06] p-5">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--herb)]">Total order cost</p>
          <p className="font-display text-3xl text-[var(--cream)] mt-1">RM {grandTotal.toFixed(0)}</p>
        </div>
      </div>

      {/* Grouped orders */}
      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
          <p className="text-[var(--herb)] font-medium">You're fully stocked ✓</p>
          <p className="text-sm text-[var(--muted)] mt-1">Current inventory covers all upcoming events' forecasted needs.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <motion.div key={g.supplier.id} layout className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--line)] flex items-center justify-between">
                <div>
                  <p className="font-medium text-[var(--cream)]">🚚 {g.supplier.name}</p>
                  {g.supplier.leadTimeDays != null && (
                    <p className="text-[11px] text-[var(--muted)]">lead time {g.supplier.leadTimeDays} day{g.supplier.leadTimeDays === 1 ? "" : "s"}</p>
                  )}
                </div>
                <p className="text-sm text-[var(--herb)]">RM {g.total.toFixed(0)}</p>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {g.lines.map((l) => (
                  <div key={l.itemId} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1">
                      <p className="text-[var(--cream)]">{l.name}</p>
                      <p className="text-[11px] text-[var(--muted)]">need {l.needKg}kg · have {l.haveKg}kg</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[var(--cream)] font-semibold">order {l.orderKg}kg</p>
                      <p className="text-[11px] text-[var(--muted)]">RM {(l.orderKg * l.costPerKg).toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[var(--muted)] mt-4">
        Order quantities are the gap between forecasted need and current stock — the data-driven alternative to over-ordering.
      </p>
    </div>
  );
}
