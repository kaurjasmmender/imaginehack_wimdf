// ===== Catering data model =====

export interface InventoryItem {
  id: string;
  name: string;
  category: IngredientCategory;
  qtyKg: number;
  expiresInDays: number;
  costPerKg: number;
  storageZone?: StorageZone;   // how cold it must be kept
  storageNote?: string;        // short specific tip
}

export type IngredientCategory = "protein" | "grain" | "vegetable" | "dairy" | "sauce" | "other";

export type StorageZone = "frozen" | "cold" | "chilled" | "cool" | "pantry";

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  historicalWastePct: number;
}

export interface RecipeIngredient {
  itemId: string;
  kgPerGuest: number;
  name?: string;   // fallback display name so it never shows "Unknown"
}

export interface CateringEvent {
  id: string;
  name: string;
  client?: string;
  eventType: EventType;
  guestCount: number;
  date: string;
  menu: string[];
}

export type EventType = "wedding" | "corporate" | "birthday" | "conference" | "festival";

export interface PastEvent {
  id: string;
  eventType: EventType;
  guestCount: number;
  cuisine: string;
  totalFoodPreparedKg: number;
  totalFoodConsumedKg: number;
}

export interface Supplier {
  id: string;
  name: string;
  itemsSupplied: string[];
  leadTimeDays: number;
}

export interface CateringState {
  inventory: InventoryItem[];
  recipes: Recipe[];
  events: CateringEvent[];
  pastEvents: PastEvent[];
  suppliers: Supplier[];
}
