import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../lib/store";

// CO2: ~2.5 kg CO2e per kg of food wasted (rough FAO-based figure)
const CO2_PER_KG = 2.5;

export default function WasteImpact() {
  const { events, recipes, inventory, wasteLogs, logWaste, deleteWaste } = useStore();
  const [registering, setRegistering] = useState(false);

  // aggregate metrics from logged waste
  const metrics = useMemo(() => {
    const totalKg = wasteLogs.reduce((s, w) => s + w.totalWasteKg, 0);
    const totalRM = wasteLogs.reduce((s, w) => s + w.totalWasteCost, 0);
    const co2 = totalKg * CO2_PER_KG;
    const events = wasteLogs.length;
    const avgRate = wasteLogs.length
      ? Math.round(wasteLogs.reduce((s, w) => s + (w.consumptionRate || 0), 0) / wasteLogs.length * 100)
      : 0;
    return { totalKg: +totalKg.toFixed(1), totalRM: Math.round(totalRM), co2: Math.round(co2), events, avgRate };
  }, [wasteLogs]);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[var(--muted)] max-w-xl">
          After each event, weigh what came back and register it here. We turn that into your real waste figures — and the data sharpens future forecasts.
        </p>
        <button onClick={() => setRegistering((v) => !v)}
          className="rounded-xl bg-[var(--herb)] px-4 py-2 text-sm font-semibold text-[#14140f] hover:brightness-110 transition whitespace-nowrap">
          {registering ? "Close" : "+ Register waste"}
        </button>
      </div>

      {registering && (
        <RegisterWasteForm events={events} recipes={recipes} inventory={inventory}
          onSubmit={(log) => { logWaste(log); setRegistering(false); }} />
      )}

      {/* Impact metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Metric label="Food wasted" value={`${metrics.totalKg} kg`} sub={`across ${metrics.events} event${metrics.events === 1 ? "" : "s"}`} />
        <Metric label="Cost of waste" value={`RM ${metrics.totalRM}`} sub="logged so far" danger />
        <Metric label="CO₂e from waste" value={`${metrics.co2} kg`} sub="≈ carbon footprint" />
        <Metric label="Avg consumption" value={`${metrics.avgRate}%`} sub="of food eaten" herb />
      </div>

      {/* Waste log history */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--line)]">
          <p className="font-display text-lg text-[var(--cream)]">Waste log</p>
        </div>
        {wasteLogs.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--muted)] text-center">
            No waste registered yet. After an event, hit “Register waste” to log the weigh-back.
          </p>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            <AnimatePresence>
              {wasteLogs.map((w) => (
                <motion.div key={w.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="group flex items-start gap-4 px-5 py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[var(--cream)]">{w.eventName}</p>
                      <span className="text-[11px] text-[var(--muted)]">{w.date}</span>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {w.dishes.map((d: any) => `${d.name}: ${d.wasteKg}kg`).join(" · ")}
                    </p>
                    <p className="text-[11px] text-[var(--herb)] mt-1">
                      {Math.round((w.consumptionRate || 0) * 100)}% eaten — fed back into the forecast
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[var(--cream)] font-semibold">{w.totalWasteKg.toFixed(1)} kg</p>
                    <p className="text-[11px] text-red-300">RM {Math.round(w.totalWasteCost)}</p>
                  </div>
                  <button onClick={() => deleteWaste(w.id)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-300 transition">✕</button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <p className="text-[11px] text-[var(--muted)] mt-4">
        Waste is measured the way professional kitchens do it — a post-event weigh-back of returned food, logged per dish. Each entry also updates the consumption rate the Portion Predictor learns from.
      </p>
    </div>
  );
}

function Metric({ label, value, sub, danger, herb }: { label: string; value: string; sub: string; danger?: boolean; herb?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${danger ? "border-red-500/30 bg-red-500/5" : herb ? "border-[var(--herb-dim)]/40 bg-[var(--herb)]/[0.06]" : "border-[var(--line)] bg-[var(--panel)]"}`}>
      <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">{label}</p>
      <p className={`font-display text-3xl mt-1 ${danger ? "text-red-300" : herb ? "text-[var(--herb)]" : "text-[var(--cream)]"}`}>{value}</p>
      <p className="text-xs text-[var(--muted)] mt-1">{sub}</p>
    </div>
  );
}

// ----- Register waste form (weigh-back) -----
function RegisterWasteForm({ events, recipes, inventory, onSubmit }: {
  events: any[]; recipes: any[]; inventory: any[]; onSubmit: (log: any) => void;
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const event = events.find((e) => e.id === eventId);
  const dishes = (event?.menu || []).map((id: string) => recipes.find((r) => r.id === id)).filter(Boolean);
  const [leftover, setLeftover] = useState<Record<string, string>>({});

  function preparedKg(recipe: any) {
    const perGuest = recipe.ingredients.reduce((s: number, ing: any) => s + ing.kgPerGuest, 0);
    return +(perGuest * (event?.guestCount || 0)).toFixed(1);
  }
  function costPerKg(recipe: any) {
    // average ingredient cost weighted by share
    let totalKg = 0, totalCost = 0;
    for (const ing of recipe.ingredients) {
      const item = inventory.find((i) => i.id === ing.itemId) || inventory.find((i) => i.name.toLowerCase() === (ing.name||"").toLowerCase());
      totalKg += ing.kgPerGuest; totalCost += ing.kgPerGuest * (item?.costPerKg || 0);
    }
    return totalKg ? totalCost / totalKg : 0;
  }

  function submit() {
    if (!event) return;
    const dishResults = dishes.map((r: any) => {
      const prepared = preparedKg(r);
      const wasteKg = Math.min(prepared, Math.max(0, +(leftover[r.id] || 0)));
      return { name: r.name, preparedKg: prepared, wasteKg: +wasteKg.toFixed(1), costPerKg: costPerKg(r) };
    });
    const totalPrepared = dishResults.reduce((s: number, d: any) => s + d.preparedKg, 0);
    const totalWasteKg = dishResults.reduce((s: number, d: any) => s + d.wasteKg, 0);
    const totalWasteCost = dishResults.reduce((s: number, d: any) => s + d.wasteKg * d.costPerKg, 0);
    const consumptionRate = totalPrepared > 0 ? (totalPrepared - totalWasteKg) / totalPrepared : 0;

    onSubmit({
      id: `w-${Date.now()}`,
      eventName: event.name, date: new Date().toISOString().slice(0, 10),
      eventType: event.eventType, guestCount: event.guestCount,
      dishes: dishResults, totalWasteKg: +totalWasteKg.toFixed(1),
      totalWasteCost, consumptionRate,
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--herb-dim)]/40 bg-[var(--herb)]/[0.05] p-5 mb-6">
      <p className="font-display text-lg text-[var(--cream)] mb-1">Register waste (weigh-back)</p>
      <p className="text-xs text-[var(--muted)] mb-4">Pick the event, then enter how many kg of each dish came back uneaten.</p>

      <label className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Event</label>
      <div className="flex flex-wrap gap-2 mt-1 mb-4">
        {events.map((e) => (
          <button key={e.id} onClick={() => setEventId(e.id)}
            className={`rounded-lg px-3 py-1.5 text-sm border transition ${eventId === e.id ? "bg-[var(--herb)] text-[#14140f] border-[var(--herb)] font-semibold" : "border-[var(--line)] text-[var(--cream)] hover:bg-[var(--panel-2)]"}`}>
            {e.name}
          </button>
        ))}
      </div>

      {dishes.length > 0 ? (
        <div className="space-y-2 mb-4">
          {dishes.map((r: any) => (
            <div key={r.id} className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm text-[var(--cream)]">{r.name}</p>
                <p className="text-[11px] text-[var(--muted)]">prepared ~{preparedKg(r)}kg for {event?.guestCount} guests</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min={0} step="0.5" value={leftover[r.id] ?? ""}
                  onChange={(e) => setLeftover((p) => ({ ...p, [r.id]: e.target.value }))}
                  placeholder="0"
                  className="w-24 rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--herb-dim)]" />
                <span className="text-xs text-[var(--muted)]">kg left</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)] mb-4">This event has no dishes on its menu.</p>
      )}

      <button onClick={submit} disabled={!event || dishes.length === 0}
        className="rounded-lg bg-[var(--herb)] px-5 py-2 text-sm font-semibold text-[#14140f] hover:brightness-110 disabled:opacity-50">
        Save waste log
      </button>
    </div>
  );
}
