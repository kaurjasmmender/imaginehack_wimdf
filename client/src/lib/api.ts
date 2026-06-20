const BASE = "http://localhost:3001";

export interface ParsedItem {
  name: string; category: string; qtyKg: number; expiresInDays: number; costPerKg: number;
  storageZone?: string; storageNote?: string;
}
export interface ShelfLife {
  name: string; shelfLifeDays: number; category: string; costPerKg: number;
  storageZone?: string; storageNote?: string;
}

export async function fetchState() {
  const res = await fetch(`${BASE}/api/state`);
  if (!res.ok) throw new Error("state fetch failed");
  return res.json(); // { inventory, recipes }
}

export async function apiAddItems(items: any[]) {
  const res = await fetch(`${BASE}/api/inventory/add`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }),
  });
  return (await res.json()).inventory;
}
export async function apiDeleteItem(id: string) {
  const res = await fetch(`${BASE}/api/inventory/delete`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
  });
  return (await res.json()).inventory;
}
export async function apiDeduct(consumption: { itemId: string; kg: number }[]) {
  const res = await fetch(`${BASE}/api/inventory/deduct`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consumption }),
  });
  return (await res.json()).inventory;
}
export async function apiAddRecipe(recipe: any) {
  const res = await fetch(`${BASE}/api/recipes/add`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipe }),
  });
  return (await res.json()).recipes;
}
export async function apiUpdateRecipe(recipe: any) {
  const res = await fetch(`${BASE}/api/recipes/update`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipe }),
  });
  return (await res.json()).recipes;
}
export async function apiDeleteRecipe(id: string) {
  const res = await fetch(`${BASE}/api/recipes/delete`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
  });
  return (await res.json()).recipes;
}
export async function apiAddEvent(event: any) {
  const res = await fetch(`${BASE}/api/events/add`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event }),
  });
  return (await res.json()).events;
}
export async function apiDeleteEvent(id: string) {
  const res = await fetch(`${BASE}/api/events/delete`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
  });
  return (await res.json()).events;
}
export async function apiUpdateEvent(event: any) {
  const res = await fetch(`${BASE}/api/events/update`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event }),
  });
  return (await res.json()).events;
}

export async function apiLogWaste(log: any) {
  const res = await fetch(`${BASE}/api/waste/log`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ log }),
  });
  return (await res.json()).wasteLogs;
}
export async function apiDeleteWaste(id: string) {
  const res = await fetch(`${BASE}/api/waste/delete`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
  });
  return (await res.json()).wasteLogs;
}

export async function smartIntake(text: string): Promise<ParsedItem[]> {
  const res = await fetch(`${BASE}/api/intake`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Intake failed");
  return (await res.json()).items;
}
export async function estimateShelfLife(names: string[]): Promise<ShelfLife[]> {
  const res = await fetch(`${BASE}/api/shelflife`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ names }),
  });
  if (!res.ok) throw new Error("Shelf-life estimate failed");
  return (await res.json()).items;
}
export interface Nutrition {
  dish: string; calories: number; protein: number; carbs: number; fat: number; unit: string; diets: string[];
}
export async function getNutrition(dish: string): Promise<Nutrition> {
  const res = await fetch(`${BASE}/api/nutrition`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dish }),
  });
  if (!res.ok) throw new Error("Nutrition failed");
  return res.json();
}

export async function getInsight(expiring: any[], events: any[], availableDishes: string[] = []): Promise<string> {
  const res = await fetch(`${BASE}/api/insight`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiring, events, availableDishes }),
  });
  if (!res.ok) throw new Error("Insight failed");
  return (await res.json()).insight;
}
