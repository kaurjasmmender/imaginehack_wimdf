import { useState, useEffect, useRef } from "react";
import scenario from "./data/scenario.json";
import type { InventoryItem, Recipe } from "./lib/types";
import { StoreContext } from "./lib/store.ts";
import {
  fetchState, apiAddItems, apiDeleteItem, apiDeduct, apiAddRecipe, apiUpdateRecipe,
  apiAddEvent, apiDeleteEvent, apiUpdateEvent, apiDeleteRecipe,
  apiLogWaste, apiDeleteWaste,
} from "./lib/api.ts";
import InventoryTracker from "./components/InventoryTracker.tsx";
import MenuPlanner from "./components/MenuPlanner.tsx";
import PortionPredictor from "./components/PortionPredictor.tsx";
import SupplierOrders from "./components/SupplierOrders.tsx";
import WasteImpact from "./components/WasteImpact.tsx";

const NAV = [
  { id: "inventory", label: "Inventory & Expiry", icon: "📦", active: true },
  { id: "menu", label: "Cook a dish", icon: "🍽️", active: true },
  { id: "forecast", label: "Portion Predictor", icon: "📊", active: true },
  { id: "suppliers", label: "Supplier Orders", icon: "🚚", active: true },
  { id: "waste", label: "Waste & Impact", icon: "🌱", active: true },
];

export default function App() {
  const [active, setActive] = useState("inventory");
  const [inventory, setInventory] = useState<InventoryItem[]>(scenario.inventory as InventoryItem[]);
  const [recipes, setRecipes] = useState<Recipe[]>(scenario.recipes as Recipe[]);
  const [events, setEvents] = useState<any[]>((scenario as any).events || []);
  const [suppliers, setSuppliers] = useState<any[]>((scenario as any).suppliers || []);
  const [wasteLogs, setWasteLogs] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const lastInvJson = useRef("");

  // initial load + live polling from backend
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const s = await fetchState();
        if (!alive) return;
        const j = JSON.stringify(s.inventory);
        if (j !== lastInvJson.current) { lastInvJson.current = j; setInventory(s.inventory); }
        setRecipes(s.recipes);
        if (s.events) setEvents(s.events);
        if (s.suppliers) setSuppliers(s.suppliers);
        if (s.wasteLogs) setWasteLogs(s.wasteLogs);
        setConnected(true);
      } catch { setConnected(false); }
    }
    load();
    const t = setInterval(load, 1500); // poll so Telegram bot actions appear live
    return () => { alive = false; clearInterval(t); };
  }, []);

  const store = {
    inventory, recipes, events, suppliers,
    addItems: async (items: InventoryItem[]) => {
      const inv = await apiAddItems(items); setInventory(inv); lastInvJson.current = JSON.stringify(inv);
    },
    deleteItem: async (id: string) => {
      const inv = await apiDeleteItem(id); setInventory(inv); lastInvJson.current = JSON.stringify(inv);
    },
    deductForCook: async (consumption: { itemId: string; kg: number }[]) => {
      const inv = await apiDeduct(consumption); setInventory(inv); lastInvJson.current = JSON.stringify(inv);
    },
    addRecipe: async (r: Recipe) => { const rs = await apiAddRecipe(r); setRecipes(rs); },
    updateRecipe: async (_id: string, r: Recipe) => { const rs = await apiUpdateRecipe(r); setRecipes(rs); },
    deleteRecipe: async (id: string) => { const rs = await apiDeleteRecipe(id); setRecipes(rs); },
    wasteLogs,
    logWaste: async (log: any) => { const w = await apiLogWaste(log); setWasteLogs(w); },
    deleteWaste: async (id: string) => { const w = await apiDeleteWaste(id); setWasteLogs(w); },
    addEvent: async (e: any) => { const ev = await apiAddEvent(e); setEvents(ev); },
    deleteEvent: async (id: string) => { const ev = await apiDeleteEvent(id); setEvents(ev); },
    updateEvent: async (e: any) => { const ev = await apiUpdateEvent(e); setEvents(ev); },
  };

  const headers: Record<string, { eyebrow: string; title: string }> = {
    inventory: { eyebrow: "Dashboard", title: "Inventory & Expiry" },
    menu: { eyebrow: "Production", title: "Cook a dish" },
    forecast: { eyebrow: "Planning", title: "Portion Predictor" },
    suppliers: { eyebrow: "Procurement", title: "Supplier Orders" },
    waste: { eyebrow: "Sustainability", title: "Waste & Impact" },
  };
  const h = headers[active] ?? headers.inventory;

  return (
    <StoreContext.Provider value={store as any}>
      <div className="app-bg min-h-screen flex text-[15px]">
        <aside className="w-64 shrink-0 border-r border-[var(--line)] bg-[var(--panel)] flex flex-col">
          <div className="px-6 py-6 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[var(--herb)] grid place-items-center text-[#14140f] font-bold">◆</div>
              <div>
                <p className="font-display text-lg leading-none text-[var(--cream)]">CaterToUs</p>
                <p className="text-[11px] text-[var(--muted)] tracking-wide">catering ops</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV.map((item) => {
              const isActive = active === item.id;
              return (
                <button key={item.id} onClick={() => item.active && setActive(item.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition
                    ${isActive ? "bg-[var(--panel-2)] text-[var(--cream)]" : "text-[var(--muted)] hover:text-[var(--cream)] hover:bg-[var(--panel-2)]/50"}
                    ${!item.active && "opacity-40 cursor-not-allowed"}`}>
                  <span className="text-base">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                  {!item.active && <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--muted)]">soon</span>}
                </button>
              );
            })}
          </nav>
          <div className="px-6 py-4 border-t border-[var(--line)] flex items-center gap-2 text-[11px] text-[var(--muted)]">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-[var(--herb)]" : "bg-red-400"}`} />
            {connected ? "Live · synced with bot" : "Offline"}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b border-[var(--line)] flex items-center justify-between px-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--herb-dim)]">{h.eyebrow}</p>
              <h2 className="font-display text-xl text-[var(--cream)] leading-none mt-0.5">{h.title}</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-[var(--cream)]">Aisha's Catering Co.</p>
                <p className="text-[11px] text-[var(--muted)]">3 events this week</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-[var(--herb-dim)] grid place-items-center text-[#14140f] font-semibold">A</div>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {active === "inventory" && <InventoryTracker />}
            {active === "menu" && <MenuPlanner />}
            {active === "forecast" && <PortionPredictor />}
            {active === "suppliers" && <SupplierOrders />}
            {active === "waste" && <WasteImpact />}
          </main>
        </div>
      </div>
    </StoreContext.Provider>
  );
}
