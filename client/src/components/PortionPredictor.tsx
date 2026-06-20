import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useStore } from "../lib/store.ts";
import { forecast } from "../lib/forecast.ts";
import { getNutrition, type Nutrition } from "../lib/api.ts";
import scenario from "../data/scenario.json";
import type { EventType, PastEvent, CateringEvent } from "../lib/types.ts";

const EVENT_TYPES: { id: EventType; label: string; icon: string }[] = [
  { id: "wedding", label: "Wedding", icon: "💍" },
  { id: "corporate", label: "Corporate", icon: "💼" },
  { id: "birthday", label: "Birthday", icon: "🎂" },
  { id: "conference", label: "Conference", icon: "🎤" },
  { id: "festival", label: "Festival", icon: "🎊" },
];
const TYPE_META = Object.fromEntries(EVENT_TYPES.map((e) => [e.id, e]));

export default function PortionPredictor() {
  const { recipes, inventory, events, addEvent, deleteEvent, updateEvent } = useStore();
  const pastEvents = scenario.pastEvents as PastEvent[];

  const [selectedId, setSelectedId] = useState<string>(events[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CateringEvent | null>(null);
  const [trim, setTrim] = useState(false);
  const coverage = trim ? 0.9 : 1.0;

  const [nutrition, setNutrition] = useState<Record<string, Nutrition>>({});
  const [nutLoading, setNutLoading] = useState(false);

  // keep a valid selection
  useEffect(() => {
    if (!events.find((e) => e.id === selectedId) && events[0]) setSelectedId(events[0].id);
  }, [events, selectedId]);

  const event = events.find((e) => e.id === selectedId);
  const menu = event?.menu ?? [];
  const guests = event?.guestCount ?? 0;
  const eventType = (event?.eventType ?? "wedding") as EventType;

  const result = useMemo(
    () => forecast(pastEvents, recipes, inventory, menu, eventType, guests, coverage),
    [pastEvents, recipes, inventory, menu, eventType, guests, coverage]
  );

  const ratePct = Math.round(result.rate * 100);
  const savedPct = result.totalNaiveKg ? Math.round((result.avoidedKg / result.totalNaiveKg) * 100) : 0;

  useEffect(() => {
    const chosen = recipes.filter((r) => menu.includes(r.id));
    const missing = chosen.filter((r) => !nutrition[r.name]);
    if (missing.length === 0) return;
    setNutLoading(true);
    Promise.all(missing.map((r) => getNutrition(r.name).then((n) => [r.name, n] as const).catch(() => null)))
      .then((pairs) => {
        const next = { ...nutrition };
        for (const p of pairs) if (p) next[p[0]] = p[1];
        setNutrition(next); setNutLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.join(","), recipes]);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[var(--muted)] max-w-xl">
          Create an event for a client, set its menu and headcount, and we use your past events of that type to recommend how much to cook — so you stop over-preparing.
        </p>
        <button onClick={() => setCreating((v) => !v)}
          className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm text-[var(--cream)] hover:bg-[var(--panel-2)] transition whitespace-nowrap">
          {creating ? "Close" : "+ New event"}
        </button>
      </div>

      {(creating || editing) && (
        <EventForm recipes={recipes} initial={editing}
          onSubmit={(e) => {
            if (editing) { updateEvent(e); }
            else { addEvent(e); setSelectedId(e.id); }
            setCreating(false); setEditing(null);
          }}
          onCancel={() => { setCreating(false); setEditing(null); }} />
      )}

      {/* Event cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {events.map((e) => {
          const tm = TYPE_META[e.eventType] || { icon: "📅", label: e.eventType };
          const active = e.id === selectedId;
          return (
            <button key={e.id} onClick={() => setSelectedId(e.id)}
              className={`group text-left rounded-2xl border p-4 transition ${active ? "border-[var(--herb)] bg-[var(--herb)]/[0.06]" : "border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--panel-2)]"}`}>
              <div className="flex items-start justify-between">
                <span className="text-2xl">{tm.icon}</span>
                <span onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }}
                  className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-300 text-sm">✕</span>
              </div>
              <p className="font-medium text-[var(--cream)] mt-2 truncate">{e.name}</p>
              <p className="text-xs text-[var(--muted)]">{e.client}</p>
              <p className="text-[11px] text-[var(--muted)] mt-1">{tm.label} · {e.guestCount} guests · {e.date}</p>
            </button>
          );
        })}
        {events.length === 0 && <p className="text-sm text-[var(--muted)] col-span-full">No events yet — create one to forecast.</p>}
      </div>

      {event && (
        <>
          {/* Recommendation explained */}
          <div className="rounded-2xl border border-[var(--herb-dim)]/40 bg-[var(--herb)]/[0.06] p-6 mb-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--herb)]">How much to cook · {event.name}</p>
              <button onClick={() => { setEditing(event); setCreating(false); }}
                className="text-xs rounded-lg border border-[var(--line)] px-3 py-1 text-[var(--cream)] hover:bg-[var(--panel-2)]">Edit event</button>
            </div>
            <p className="text-[var(--cream)] leading-relaxed mb-5">
              At your past <span className="text-[var(--herb)] font-semibold">{eventType}</span> events, guests ate about{" "}
              <span className="text-[var(--herb)] font-semibold">{ratePct}%</span> of the food prepared.
              So for <span className="font-semibold">{guests} guests</span>, instead of the usual{" "}
              <span className="text-red-300 font-semibold">{result.totalNaiveKg} kg</span>, you only need to cook about{" "}
              <span className="text-[var(--cream)] font-semibold">{result.totalRecommendedKg} kg</span>.
            </p>
            <div className="space-y-2 mb-5">
              <div>
                <div className="flex justify-between text-xs mb-1"><span className="text-[var(--muted)]">Usual amount</span><span className="text-red-300">{result.totalNaiveKg} kg</span></div>
                <div className="h-2 rounded-full bg-[var(--panel-2)] overflow-hidden"><div className="h-full bg-red-400/60" style={{ width: "100%" }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1"><span className="text-[var(--muted)]">Recommended</span><span className="text-[var(--herb)]">{result.totalRecommendedKg} kg</span></div>
                <div className="h-2 rounded-full bg-[var(--panel-2)] overflow-hidden">
                  <motion.div className="h-full bg-[var(--herb)]" initial={{ width: 0 }} animate={{ width: `${result.totalNaiveKg ? (result.totalRecommendedKg / result.totalNaiveKg) * 100 : 0}%` }} transition={{ duration: 0.5 }} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl text-[var(--herb)]">{result.avoidedKg} kg</span>
                <span className="text-sm text-[var(--muted)]">less food · ≈ RM {result.avoidedCost} saved · {savedPct}% less waste</span>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--cream)] cursor-pointer">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} className="accent-[var(--herb)]" style={{ width: 16, height: 16 }} />
                Cook lean (trim another 10%)
              </label>
            </div>
          </div>

          {/* Per-dish + nutrition */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--line)] flex items-center justify-between">
              <p className="font-display text-lg text-[var(--cream)]">Per-dish plan</p>
              {nutLoading && <span className="text-xs text-[var(--muted)]">loading nutrition…</span>}
            </div>
            <div className="divide-y divide-[var(--line)]">
              {result.dishes.map((d) => {
                const nut = nutrition[d.recipeName];
                return (
                  <div key={d.recipeId} className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[var(--cream)] font-medium">{d.recipeName}</p>
                      <div className="text-right">
                        <span className="text-[var(--muted)] text-sm line-through mr-2">{d.naiveKg}kg</span>
                        <span className="text-[var(--herb)] font-semibold">{d.recommendedKg}kg</span>
                      </div>
                    </div>
                    {nut && (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-[11px] rounded-full bg-[var(--panel-2)] px-2 py-0.5 text-[var(--cream)]">🔥 {nut.calories} kcal</span>
                        <span className="text-[11px] rounded-full bg-[var(--panel-2)] px-2 py-0.5 text-[var(--cream)]">💪 {nut.protein}g protein</span>
                        <span className="text-[11px] rounded-full bg-[var(--panel-2)] px-2 py-0.5 text-[var(--cream)]">🍞 {nut.carbs}g carbs</span>
                        <span className="text-[11px] rounded-full bg-[var(--panel-2)] px-2 py-0.5 text-[var(--cream)]">🧈 {nut.fat}g fat</span>
                        <span className="text-[10px] text-[var(--muted)]">{nut.unit}</span>
                        {nut.diets.map((diet) => (
                          <span key={diet} className="text-[11px] rounded-full border border-[var(--herb-dim)]/40 text-[var(--herb)] px-2 py-0.5">{diet}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {d.ingredientNeeds.map((ing) => (
                        <span key={ing.itemId} className={`text-[11px] rounded-full border px-2 py-0.5 ${ing.shortKg > 0 ? "border-red-500/30 text-red-300" : "border-[var(--line)] text-[var(--muted)]"}`}>
                          {ing.name}: {ing.kg}kg{ing.shortKg > 0 ? ` · short ${ing.shortKg}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {result.dishes.length === 0 && <p className="px-5 py-6 text-sm text-[var(--muted)]">This event has no dishes on its menu.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ----- Event form (create or edit) -----
function EventForm({ recipes, initial, onSubmit, onCancel }: {
  recipes: any[];
  initial: CateringEvent | null;
  onSubmit: (e: CateringEvent) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [client, setClient] = useState(initial?.client ?? "");
  const [eventType, setEventType] = useState<EventType>(initial?.eventType ?? "wedding");
  const [date, setDate] = useState(initial?.date && initial.date !== "TBD" ? initial.date : "");
  const [guestCount, setGuestCount] = useState(initial?.guestCount ?? 100);
  const [menu, setMenu] = useState<string[]>(initial?.menu ?? []);

  function toggle(id: string) { setMenu((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }
  function submit() {
    if (!name.trim() || menu.length === 0) return;
    onSubmit({
      id: initial?.id ?? `e-${Date.now()}`,
      name: name.trim(), client: client.trim() || "—",
      eventType, date: date || "TBD", guestCount, menu,
    } as any);
  }

  return (
    <div className="rounded-2xl border border-[var(--herb-dim)]/40 bg-[var(--herb)]/[0.05] p-5 mb-6">
      <p className="font-display text-lg text-[var(--cream)] mb-4">{initial ? "Edit event" : "New event"}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Event name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tan Wedding Reception"
            className="w-full mt-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--herb-dim)]" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Client</label>
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Mr. Tan"
            className="w-full mt-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--herb-dim)]" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full mt-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--herb-dim)]" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Guests</label>
          <input type="number" min={1} value={guestCount} onChange={(e) => setGuestCount(Math.max(1, +e.target.value))}
            className="w-full mt-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--herb-dim)]" />
        </div>
      </div>
      <label className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Event type</label>
      <div className="flex flex-wrap gap-2 mt-1 mb-3">
        {EVENT_TYPES.map((e) => (
          <button key={e.id} onClick={() => setEventType(e.id)}
            className={`rounded-lg px-3 py-1.5 text-sm border transition ${eventType === e.id ? "bg-[var(--herb)] text-[#14140f] border-[var(--herb)] font-semibold" : "border-[var(--line)] text-[var(--cream)] hover:bg-[var(--panel-2)]"}`}>
            {e.icon} {e.label}
          </button>
        ))}
      </div>
      <label className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Menu</label>
      <div className="flex flex-wrap gap-2 mt-1 mb-4">
        {recipes.map((r) => (
          <button key={r.id} onClick={() => toggle(r.id)}
            className={`rounded-lg px-3 py-1.5 text-sm border transition ${menu.includes(r.id) ? "bg-[var(--herb)]/20 border-[var(--herb-dim)] text-[var(--cream)]" : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--cream)]"}`}>
            {menu.includes(r.id) ? "✓ " : "+ "}{r.name}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={submit} className="rounded-lg bg-[var(--herb)] px-5 py-2 text-sm font-semibold text-[#14140f] hover:brightness-110">{initial ? "Save changes" : "Create event"}</button>
        <button onClick={onCancel} className="rounded-lg border border-[var(--line)] px-5 py-2 text-sm text-[var(--cream)] hover:bg-[var(--panel-2)]">Cancel</button>
      </div>
    </div>
  );
}
