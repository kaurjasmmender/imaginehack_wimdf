import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Papa from "papaparse";
import scenario from "../data/scenario.json";
import type { InventoryItem } from "../lib/types";
import { smartIntake, getInsight, estimateShelfLife } from "../lib/api";
import { useStore } from "../lib/store";

type Urgency = "critical" | "warning" | "ok";
function urgency(d: number): Urgency { return d <= 2 ? "critical" : d <= 4 ? "warning" : "ok"; }
function freshness(d: number): number { return Math.max(6, Math.min(100, (d / 14) * 100)); }
function daysBetween(from: Date, to: Date) { return Math.round((to.getTime() - from.getTime()) / 86400000); }

const META: Record<Urgency, { label: string; dot: string; bar: string; text: string }> = {
  critical: { label: "Use now", dot: "bg-red-400", bar: "bg-gradient-to-r from-red-500 to-red-400", text: "text-red-300" },
  warning: { label: "Use soon", dot: "bg-amber-400", bar: "bg-gradient-to-r from-amber-500 to-amber-300", text: "text-amber-300" },
  ok: { label: "Fresh", dot: "bg-[var(--herb)]", bar: "bg-gradient-to-r from-[var(--herb-dim)] to-[var(--herb)]", text: "text-[var(--muted)]" },
};
const CATEGORY_ICON: Record<string, string> = { protein: "🍗", grain: "🌾", vegetable: "🥬", dairy: "🧀", sauce: "🥫", other: "🧂" };

const ZONE: Record<string, { label: string; icon: string; chip: string; temp: string }> = {
  frozen:  { label: "Frozen",  icon: "❄️", chip: "bg-sky-500/15 text-sky-300 border-sky-500/30",       temp: "-18°C" },
  cold:    { label: "Cold",    icon: "🧊", chip: "bg-blue-500/15 text-blue-300 border-blue-500/30",     temp: "0–2°C" },
  chilled: { label: "Chilled", icon: "🌡️", chip: "bg-teal-500/15 text-teal-300 border-teal-500/30",    temp: "3–5°C" },
  cool:    { label: "Cool",    icon: "🍃", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", temp: "8–12°C" },
  pantry:  { label: "Pantry",  icon: "🫙", chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",  temp: "room" },
};

function Counter({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [d, setD] = useState(0);
  useEffect(() => {
    let raf: number; const start = performance.now(); const dur = 700;
    const tick = (now: number) => { const p = Math.min(1, (now - start) / dur); setD(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{prefix}{d.toLocaleString()}</span>;
}

export default function InventoryTracker() {
  const { inventory, recipes, addItems, deleteItem } = useStore();
  const [intakeText, setIntakeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [csvStatus, setCsvStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = [...inventory].sort((a, b) => a.expiresInDays - b.expiresInDays);
  const atRisk = sorted.filter((i) => i.expiresInDays <= 2);
  const valueAtRisk = atRisk.reduce((s, i) => s + i.qtyKg * i.costPerKg, 0);
  const totalValue = sorted.reduce((s, i) => s + i.qtyKg * i.costPerKg, 0);
  const totalKg = sorted.reduce((s, i) => s + i.qtyKg, 0);

  async function handleIntake() {
    if (!intakeText.trim()) return;
    setLoading(true); setError("");
    try {
      const parsed = await smartIntake(intakeText);
      const newItems: InventoryItem[] = parsed.map((p, idx) => ({
        id: `ai-${Date.now()}-${idx}`, name: p.name, category: p.category as InventoryItem["category"],
        qtyKg: p.qtyKg, expiresInDays: p.expiresInDays, costPerKg: p.costPerKg, storageZone: p.storageZone as any, storageNote: p.storageNote,
      }));
      addItems(newItems); setJustAdded(newItems.map((i) => i.name)); setIntakeText("");
      setTimeout(() => setJustAdded([]), 2500);
    } catch (e: any) { setError(e.message || "Something went wrong."); }
    finally { setLoading(false); }
  }

  async function handleInsight() {
    setInsightLoading(true); setInsight("");
    try {
      const expiring = atRisk.map((i) => ({ name: i.name, expiresInDays: i.expiresInDays, qtyKg: i.qtyKg }));
      // resolve recipe IDs to real dish names
      const recipeName = (id: string) => recipes.find((r) => r.id === id)?.name || id;
      const events = (scenario.events as any[]).map((e) => ({
        name: e.name,
        dishes: (e.menu || []).map(recipeName),
      }));
      const allDishes = recipes.map((r) => r.name);
      setInsight(await getInsight(expiring, events, allDishes));
    } catch { setInsight("Insight unavailable right now."); }
    finally { setInsightLoading(false); }
  }

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvStatus("Reading file…");
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (result) => {
        try {
          const rows = result.data as any[];
          // Expect columns: name/item, quantity/qty (kg), purchase_date/date
          const parsed = rows.map((r) => {
            const name = (r.name || r.item || r.ingredient || "").toString().trim();
            const qty = parseFloat(r.quantity || r.qty || r.kg || r.amount || "0");
            const dateStr = (r.purchase_date || r.date || r.bought || "").toString().trim();
            return { name, qtyKg: isNaN(qty) ? 0 : qty, dateStr };
          }).filter((r) => r.name);

          if (parsed.length === 0) { setCsvStatus("No valid rows found. Check your columns."); return; }

          setCsvStatus(`Estimating shelf life for ${parsed.length} items…`);
          const estimates = await estimateShelfLife(parsed.map((p) => p.name));

          const today = new Date();
          const newItems: InventoryItem[] = parsed.map((p, idx) => {
            const est = estimates[idx] || estimates.find((e) => e.name.toLowerCase() === p.name.toLowerCase());
            const shelf = est?.shelfLifeDays ?? 7;
            // expiry = purchase_date + shelf life, then days from today
            let expiresInDays = shelf;
            if (p.dateStr) {
              const purchase = new Date(p.dateStr);
              if (!isNaN(purchase.getTime())) {
                const expiryDate = new Date(purchase); expiryDate.setDate(expiryDate.getDate() + shelf);
                expiresInDays = Math.max(0, daysBetween(today, expiryDate));
              }
            }
            return {
              id: `csv-${Date.now()}-${idx}`, name: p.name,
              category: (est?.category as InventoryItem["category"]) || "other",
              qtyKg: p.qtyKg, expiresInDays, costPerKg: est?.costPerKg ?? 0, storageZone: est?.storageZone as any, storageNote: est?.storageNote,
            };
          });

          addItems(newItems);
          setJustAdded(newItems.map((i) => i.name));
          setTimeout(() => setJustAdded([]), 2500);
          setCsvStatus(`✓ Imported ${newItems.length} items with AI-estimated expiry.`);
          setTimeout(() => setCsvStatus(""), 4000);
        } catch (err) {
          console.error(err);
          setCsvStatus("Import failed — check the file and try again.");
        }
        if (fileRef.current) fileRef.current.value = "";
      },
      error: () => setCsvStatus("Could not read that file."),
    });
  }

  const stats = [
    { label: "Stock value", value: totalValue, prefix: "RM ", sub: `${totalKg.toFixed(0)} kg · ${sorted.length} items` },
    { label: "At risk", value: valueAtRisk, prefix: "RM ", sub: `${atRisk.length} expiring ≤ 2 days`, danger: true },
    { label: "Items tracked", value: sorted.length, prefix: "", sub: "first-expiry-first-out" },
  ];

  return (
    <div className="px-8 py-8 max-w-5xl">
      {/* HERO */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-br from-[var(--panel)] to-[var(--panel-2)] p-7 mb-8">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[var(--herb)] opacity-[0.07] blur-3xl" />
        <div className="relative">
          <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--herb)]">✦ AI Smart Intake</span>
          <h2 className="font-display text-2xl text-[var(--cream)] leading-snug mb-1 mt-1">Just tell us what came in.</h2>
          <p className="text-sm text-[var(--muted)] mb-5 max-w-lg">
            Type a delivery in plain words, or upload a purchase list. We identify each item, estimate its shelf life, and add it to inventory.
          </p>
          <div className="flex gap-2">
            <input value={intakeText} onChange={(e) => setIntakeText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleIntake()}
              placeholder="e.g. 20kg salmon and two crates of strawberries delivered today"
              className="flex-1 rounded-xl border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--herb-dim)] transition" />
            <button onClick={handleIntake} disabled={loading}
              className="rounded-xl bg-[var(--herb)] px-5 py-3 text-sm font-semibold text-[#14140f] hover:brightness-110 disabled:opacity-60 transition whitespace-nowrap">
              {loading ? "Reading…" : "Add to inventory"}
            </button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={() => fileRef.current?.click()}
              className="text-xs rounded-lg border border-[var(--line)] px-3 py-1.5 text-[var(--cream)] hover:bg-[var(--panel-2)] transition">
              ⬆ Import purchase list (CSV)
            </button>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCsv} className="hidden" />
            {csvStatus && <span className="text-xs text-[var(--herb)]">{csvStatus}</span>}
          </div>
          {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
          <p className="text-[11px] text-[var(--muted)] mt-3">CSV columns: name, quantity (kg), purchase_date — shelf life is estimated automatically.</p>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-5 ${s.danger ? "border-red-500/30 bg-red-500/5" : "border-[var(--line)] bg-[var(--panel)]"}`}>
            <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">{s.label}</p>
            <p className={`font-display text-3xl mt-1 ${s.danger ? "text-red-300" : "text-[var(--cream)]"}`}><Counter value={s.value} prefix={s.prefix} /></p>
            <p className="text-xs text-[var(--muted)] mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Insight */}
      <div className="mb-8 rounded-xl border border-[var(--herb-dim)]/40 bg-[var(--herb)]/[0.06] p-5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--herb)]">✦ Today's move</span>
          <button onClick={handleInsight} disabled={insightLoading}
            className="text-xs rounded-lg border border-[var(--herb-dim)]/50 px-3 py-1.5 text-[var(--herb)] hover:bg-[var(--herb)]/10 disabled:opacity-60 transition">
            {insightLoading ? "Thinking…" : insight ? "Refresh" : "What should we cook?"}
          </button>
        </div>
        <AnimatePresence mode="wait">
          {insight
            ? <motion.p key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[var(--cream)] mt-3 leading-relaxed">{insight}</motion.p>
            : <p className="text-sm text-[var(--muted)] mt-3">Ask the AI which dishes to push so the expiring stock gets used before it spoils.</p>}
        </AnimatePresence>
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display text-lg text-[var(--cream)]">Stock by expiry</h3>
        <p className="text-xs text-[var(--muted)]">soonest first</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {Object.entries(ZONE).map(([k, z]) => (
          <span key={k} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${z.chip}`}>
            {z.icon} {z.label} · {z.temp}
          </span>
        ))}
      </div>

      {/* Rows with delete */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] divide-y divide-[var(--line)] overflow-hidden">
        <AnimatePresence>
          {sorted.map((item) => {
            const m = META[urgency(item.expiresInDays)];
            const value = item.qtyKg * item.costPerKg;
            const isNew = justAdded.includes(item.name);
            return (
              <motion.div key={item.id} layout
                initial={isNew ? { opacity: 0, backgroundColor: "rgba(155,191,92,0.15)" } : false}
                animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5 }}
                className="group flex items-center gap-4 px-5 py-4 hover:bg-[var(--panel-2)]/50">
                <div className="h-10 w-10 rounded-lg bg-[var(--panel-2)] grid place-items-center text-lg shrink-0">{CATEGORY_ICON[item.category] ?? "🧂"}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--cream)] truncate">{item.name}</p>
                    <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                    <span className={`text-[11px] font-medium ${m.text}`}>{m.label}</span>
                    {isNew && <span className="text-[10px] uppercase tracking-wider text-[var(--herb)]">new</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {item.storageZone && ZONE[item.storageZone] && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${ZONE[item.storageZone].chip}`}>
                        {ZONE[item.storageZone].icon} {ZONE[item.storageZone].label} · {ZONE[item.storageZone].temp}
                      </span>
                    )}
                    <span className="text-xs text-[var(--muted)] capitalize">{item.category} · {item.qtyKg} kg · RM{item.costPerKg}/kg</span>
                  </div>
                  {item.storageNote && <p className="text-[11px] text-[var(--muted)]/70 mt-0.5">{item.storageNote}</p>}
                  <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-[var(--panel-2)] overflow-hidden">
                    <motion.div className={`h-full rounded-full ${m.bar}`} initial={{ width: 0 }} animate={{ width: `${freshness(item.expiresInDays)}%` }} transition={{ duration: 0.6 }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-[var(--cream)]">RM {value.toFixed(0)}</p>
                  <p className={`text-xs ${m.text}`}>{item.expiresInDays}d left</p>
                </div>
                <button onClick={() => deleteItem(item.id)} title="Remove item"
                  className="ml-2 h-8 w-8 shrink-0 rounded-lg grid place-items-center text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-300 transition">
                  ✕
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <p className="text-[11px] text-[var(--muted)] mt-4">First-expiry-first-out keeps the kitchen pulling from soonest-to-spoil stock first — the simplest lever against food waste.</p>
    </div>
  );
}
