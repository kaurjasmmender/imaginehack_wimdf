import { createContext, useContext } from "react";
import type { InventoryItem, Recipe, CateringEvent, Supplier } from "./types";

export interface Store {
  inventory: InventoryItem[];
  recipes: Recipe[];
  events: CateringEvent[];
  suppliers: Supplier[];
  addItems: (items: InventoryItem[]) => void;
  deleteItem: (id: string) => void;
  deductForCook: (consumption: { itemId: string; kg: number }[]) => void;
  addRecipe: (r: Recipe) => void;
  updateRecipe: (id: string, r: Recipe) => void;
  deleteRecipe: (id: string) => void;
  wasteLogs: any[];
  logWaste: (log: any) => void;
  deleteWaste: (id: string) => void;
  addEvent: (e: CateringEvent) => void;
  deleteEvent: (id: string) => void;
  updateEvent: (e: CateringEvent) => void;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
