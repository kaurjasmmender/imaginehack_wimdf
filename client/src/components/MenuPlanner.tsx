import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Recipe, InventoryItem } from "../lib/types";
import { useStore } from "../lib/store";

export default function MenuPlanner() {
  const { inventory, recipes, deductForCook, addRecipe, updateRecipe, deleteRecipe } = useStore();
  const [selectedId, setSelectedId] = useState<string>(recipes[0]?.id ?? "");
  const [guests, setGuests] = useState<number>(100);
  const [cooked, setCooked] = useState<string>("");
  const [creating, setCreating] = useState(false);

  // add-ingredient-to-existing-recipe inline state
  const [newIngName, setNewIngName] = useState("");
  const [newIngKg, setNewIngKg] = useState("");

  const recipe = recipes.find((r) => r.id === selectedId);

  const requirements = recipe
    ? recipe.ingredients.map((ing) => {
        const item =
          inventory.find((i) => i.id === ing.itemId) ||
          inventory.find((i) => i.name.toLowerCase() === (ing as any).name?.toLowerCase());
        const needKg = +(ing.kgPerGuest * guests).toFixed(1);
        const haveKg = item?.qtyKg ?? 0;
        const shortKg = +Math.max(0, needKg - haveKg).toFixed(1);
        return { itemId: item?.id ?? ing.itemId, name: item?.name ?? (ing as any).name ?? ing.itemId,
          needKg, haveKg, shortKg, costPerKg: item?.costPerKg ?? 0, inStock: !!item };
      })
    : [];

  const inStock = requirements.filter((r) => r.inStock);
  const missing = requirements.filter((r) => !r.inStock);
  const shortages = requirements.filter((r) => r.shortKg > 0 || !r.inStock);
  const restockCost = shortages.reduce((s, r) => s + (r.shortKg || r.needKg) * (r.costPerKg || 0), 0);
  const readyPct = requirements.length ? Math.round((inStock.filter((r) => r.shortKg === 0).length / requirements.length) * 100) : 0;

  function handleCook() {
    if (!recipe) return;
    const consumption = inStock.map((r) => ({ itemId: r.itemId, kg: Math.min(r.needKg, r.haveKg) }));
    deductForCook(consumption);
    setCooked(`${recipe.name} for ${guests} guests — stock deducted.`);
    setTimeout(() => setCooked(""), 4000);
  }

  function addIngredientToRecipe() {
    if (!recipe || !newIngName.trim() || !(+newIngKg > 0)) return;
    const existing = inventory.find((i) => i.name.toLowerCase() === newIngName.trim().toLowerCase());
    const ing: any = existing
      ? { itemId: existing.id, kgPerGuest: +newIngKg, name: existing.name }
      : { itemId: `ref-${Date.now()}`, kgPerGuest: +newIngKg, name: newIngName.trim() };
    updateRecipe(recipe.id, { ...recipe, ingredients: [...recipe.ingredients, ing] });
    setNewIngName(""); setNewIngKg("");
  }

  return (
    <div className="px-8 py-8 max-w-5xl">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-[var(--muted)]">Pick a dish, set the headcount — we check stock and deduct what you use.</p>
        </div>
        <button onClick={() => setCreating((v) => !v)}
          className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm text-[var(--cream)] hover:bg-[var(--panel-2)] transition">
          {creating ? "Close" : "+ New dish"}
        </button>
      </div>

      {creating && <NewDishForm inventory={inventory} onAdd={(r) => { addRecipe(r); setSelectedId(r.id); setCreating(false); }} />}

      {/* Two-column: dish list (left) + planner (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        {/* Dish list */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 h-fit">
          <p className="px-2 py-2 text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Your dishes</p>
          <div className="space-y-1">
            {recipes.map((r) => (
              <div key={r.id}
                className={`group/dish w-full rounded-xl px-3 py-2.5 transition flex items-center gap-2 cursor-pointer ${selectedId === r.id ? "bg-[var(--herb)] text-[#14140f]" : "text-[var(--cream)] hover:bg-[var(--panel-2)]"}`}
                onClick={() => setSelectedId(r.id)}>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${selectedId === r.id ? "text-[#14140f]" : ""}`}>{r.name}</p>
                  <p className={`text-[11px] ${selectedId === r.id ? "text-[#14140f]/70" : "text-[var(--muted)]"}`}>{r.ingredients.length} ingredients</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRecipe(r.id);
                    if (selectedId === r.id) {
                      const remaining = recipes.filter((x) => x.id !== r.id);
                      setSelectedId(remaining[0]?.id ?? "");
                    }
                  }}
                  title="Delete dish"
                  className={`shrink-0 opacity-0 group-hover/dish:opacity-100 transition ${selectedId === r.id ? "text-[#14140f]/60 hover:text-red-700" : "text-[var(--muted)] hover:text-red-300"}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Planner card */}
        {recipe && (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
            {/* card head */}
            <div className="p-6 border-b border-[var(--line)] bg-gradient-to-br from-[var(--panel)] to-[var(--panel-2)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl text-[var(--cream)]">{recipe.name}</h3>
                  {recipe.historicalWastePct > 15 && (
                    <p className="text-[11px] text-amber-300 mt-1">⚠ historically over-prepped by {recipe.historicalWastePct}% — consider cooking lean</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Ready</p>
                  <p className={`font-display text-3xl ${readyPct === 100 ? "text-[var(--herb)]" : "text-amber-300"}`}>{readyPct}%</p>
                </div>
              </div>

              {/* guests stepper */}
              <div className="mt-5 flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">Guests</span>
                <div className="flex items-center rounded-xl border border-[var(--line)] overflow-hidden">
                  <button onClick={() => setGuests((g) => Math.max(1, g - 10))} className="px-3 py-2 text-[var(--cream)] hover:bg-[var(--panel-2)]">−</button>
                  <input type="number" min={1} value={guests} onChange={(e) => setGuests(Math.max(1, +e.target.value))}
                    className="w-20 text-center py-2 text-lg outline-none border-x border-[var(--line)]" />
                  <button onClick={() => setGuests((g) => g + 10)} className="px-3 py-2 text-[var(--cream)] hover:bg-[var(--panel-2)]">+</button>
                </div>
                <span className="text-xs text-[var(--muted)]">people to feed</span>
              </div>
            </div>

            {/* ingredient checklist */}
            <div className="p-2">
              {inStock.length > 0 && (
                <>
                  <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-[0.15em] text-[var(--herb-dim)]">In inventory</p>
                  {inStock.map((r) => {
                    const ok = r.shortKg === 0;
                    return (
                      <div key={r.itemId} className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-[var(--panel-2)]/50">
                        <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-[var(--herb)]" : "bg-amber-400"}`} />
                        <p className="flex-1 text-[var(--cream)]">{r.name}</p>
                        <p className="text-xs text-[var(--muted)]">{r.needKg} kg needed · {r.haveKg} kg in stock</p>
                        {ok ? <span className="text-xs text-[var(--herb)] w-16 text-right">ready</span>
                            : <span className="text-xs text-amber-300 w-16 text-right">short {r.shortKg}</span>}
                      </div>
                    );
                  })}
                </>
              )}

              {missing.length > 0 && (
                <>
                  <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-[0.15em] text-red-300/80">Not in inventory</p>
                  {missing.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-[var(--panel-2)]/50">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                      <p className="flex-1 text-[var(--cream)]">{r.name}</p>
                      <p className="text-xs text-[var(--muted)]">{r.needKg} kg needed</p>
                      <span className="text-xs text-red-300 w-16 text-right">missing</span>
                    </div>
                  ))}
                </>
              )}

              {/* add ingredient to THIS recipe */}
              <div className="mx-2 mt-3 mb-1 rounded-xl border border-[var(--line)] bg-[var(--bg)]/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)] mb-2">Add ingredient to this dish</p>
                <div className="flex gap-2">
                  <input list="known-ings" value={newIngName} onChange={(e) => setNewIngName(e.target.value)} placeholder="Ingredient name"
                    className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--herb-dim)]" />
                  <input type="number" step="0.01" value={newIngKg} onChange={(e) => setNewIngKg(e.target.value)} placeholder="kg/guest"
                    className="w-28 rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none" />
                  <button onClick={addIngredientToRecipe} className="rounded-lg bg-[var(--herb)] px-4 py-2 text-sm font-semibold text-[#14140f] hover:brightness-110">Add</button>
                </div>
                <datalist id="known-ings">{inventory.map((it) => <option key={it.id} value={it.name} />)}</datalist>
                {newIngName.trim() && (
                  <p className={`text-[11px] mt-1.5 ${inventory.some((i) => i.name.toLowerCase() === newIngName.trim().toLowerCase()) ? "text-[var(--herb)]" : "text-red-300"}`}>
                    {inventory.some((i) => i.name.toLowerCase() === newIngName.trim().toLowerCase()) ? "✓ this ingredient is in inventory" : "not stocked — will show as missing"}
                  </p>
                )}
              </div>
            </div>

            {/* footer: warning + cook */}
            <div className="p-5 border-t border-[var(--line)]">
              <AnimatePresence>
                {shortages.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                    <p className="text-sm font-medium text-red-200">Restock to fully prepare this dish</p>
                    <p className="text-xs text-red-300/80 mt-1">
                      {shortages.map((s) => `${(s.shortKg || s.needKg)} kg ${s.name}`).join(", ")}.
                      {restockCost > 0 && ` Est. RM ${restockCost.toFixed(0)}.`}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex items-center gap-3">
                <button onClick={handleCook}
                  className="rounded-xl bg-[var(--herb)] px-6 py-3 text-sm font-semibold text-[#14140f] hover:brightness-110 transition">
                  {shortages.length === 0 ? "Cook & deduct stock" : "Cook with available stock"}
                </button>
                {cooked && <span className="text-sm text-[var(--herb)]">✓ {cooked}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ----- New dish form -----
function NewDishForm({ inventory, onAdd }: { inventory: InventoryItem[]; onAdd: (r: Recipe) => void }) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<{ name: string; kgPerGuest: string }[]>([{ name: "", kgPerGuest: "" }]);
  const upd = (i: number, f: "name" | "kgPerGuest", v: string) => setRows((p) => p.map((r, x) => x === i ? { ...r, [f]: v } : r));

  function submit() {
    if (!name.trim()) return;
    const valid = rows.filter((r) => r.name.trim() && +r.kgPerGuest > 0);
    if (!valid.length) return;
    const ingredients = valid.map((r) => {
      const ex = inventory.find((i) => i.name.toLowerCase() === r.name.trim().toLowerCase());
      return ex ? { itemId: ex.id, kgPerGuest: +r.kgPerGuest, name: ex.name } as any
                : { itemId: `ref-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, kgPerGuest: +r.kgPerGuest, name: r.name.trim() } as any;
    });
    onAdd({ id: `r-${Date.now()}`, name: name.trim(), ingredients, historicalWastePct: 0 });
  }

  return (
    <div className="rounded-2xl border border-[var(--herb-dim)]/40 bg-[var(--herb)]/[0.05] p-5 mb-5">
      <p className="font-display text-lg text-[var(--cream)] mb-3">New dish</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dish name, e.g. Lamb biryani"
        className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--herb-dim)] mb-3" />
      <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)] mb-2">Ingredients (type any name · kg per guest)</p>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const known = inventory.some((it) => it.name.toLowerCase() === r.name.trim().toLowerCase());
          return (
            <div key={i} className="flex gap-2 items-center">
              <input list="nd-ings" value={r.name} onChange={(e) => upd(i, "name", e.target.value)} placeholder="Ingredient name"
                className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--herb-dim)]" />
              <input type="number" step="0.01" value={r.kgPerGuest} onChange={(e) => upd(i, "kgPerGuest", e.target.value)} placeholder="kg/guest"
                className="w-28 rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none" />
              {r.name.trim() && <span className={`text-[10px] w-12 ${known ? "text-[var(--herb)]" : "text-red-300"}`}>{known ? "in stock" : "new"}</span>}
            </div>
          );
        })}
      </div>
      <datalist id="nd-ings">{inventory.map((it) => <option key={it.id} value={it.name} />)}</datalist>
      <div className="flex gap-2 mt-3">
        <button onClick={() => setRows((p) => [...p, { name: "", kgPerGuest: "" }])} className="text-xs rounded-lg border border-[var(--line)] px-3 py-1.5 text-[var(--cream)] hover:bg-[var(--panel-2)]">+ ingredient</button>
        <button onClick={submit} className="text-xs rounded-lg bg-[var(--herb)] px-3 py-1.5 font-semibold text-[#14140f] hover:brightness-110">Save dish</button>
      </div>
    </div>
  );
}
