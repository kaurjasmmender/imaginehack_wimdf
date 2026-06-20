// ===== Portion forecasting engine =====
// Pure statistical tools — no AI needed for the numbers.

import type { PastEvent, Recipe, InventoryItem, EventType } from "./types";

// 1) Learn the real consumption rate per event type from history.
// rate = consumed / prepared, averaged across past events of that type.
export function consumptionRate(pastEvents: PastEvent[], eventType: EventType): {
  rate: number;
  sampleSize: number;
} {
  const matches = pastEvents.filter((e) => e.eventType === eventType && e.totalFoodPreparedKg > 0);
  if (matches.length === 0) {
    // fall back to overall average if no same-type history
    const all = pastEvents.filter((e) => e.totalFoodPreparedKg > 0);
    const r = all.length
      ? all.reduce((s, e) => s + e.totalFoodConsumedKg / e.totalFoodPreparedKg, 0) / all.length
      : 0.8;
    return { rate: r, sampleSize: 0 };
  }
  const rate =
    matches.reduce((s, e) => s + e.totalFoodConsumedKg / e.totalFoodPreparedKg, 0) / matches.length;
  return { rate, sampleSize: matches.length };
}

// 2) Average actual food eaten per guest (kg/guest) for an event type, from history.
export function consumedPerGuest(pastEvents: PastEvent[], eventType: EventType): number {
  const matches = pastEvents.filter((e) => e.eventType === eventType && e.guestCount > 0);
  const pool = matches.length ? matches : pastEvents.filter((e) => e.guestCount > 0);
  if (pool.length === 0) return 0.55; // sensible default kg/guest
  return pool.reduce((s, e) => s + e.totalFoodConsumedKg / e.guestCount, 0) / pool.length;
}

// 3) Dish dilution: with more dishes on the menu, guests eat less of EACH dish.
// 1 dish = full portion; each extra dish reduces per-dish share (diminishing).
export function dishShare(numDishes: number): number {
  if (numDishes <= 1) return 1;
  // share per dish, normalised so total slightly exceeds 1 (people sample variety)
  return (1 / numDishes) * (1 + (numDishes - 1) * 0.12);
}

export interface DishForecast {
  recipeId: string;
  recipeName: string;
  naiveKg: number;       // what a per-head guess would cook
  recommendedKg: number; // data-driven recommendation
  perGuestKg: number;
  ingredientNeeds: { itemId: string; name: string; kg: number; haveKg: number; shortKg: number }[];
}

export interface ForecastResult {
  eventType: EventType;
  guests: number;
  coverage: number;        // 0–1 safety buffer (e.g. 0.95)
  rate: number;            // learned consumption rate
  sampleSize: number;
  dishes: DishForecast[];
  totalNaiveKg: number;
  totalRecommendedKg: number;
  avoidedKg: number;
  avoidedCost: number;
}

// 4) Main forecast: combines history + portion model + coverage buffer.
export function forecast(
  pastEvents: PastEvent[],
  recipes: Recipe[],
  inventory: InventoryItem[],
  menu: string[],          // recipe ids
  eventType: EventType,
  guests: number,
  coverage: number         // 0.80–1.10 safety multiplier
): ForecastResult {
  const { rate, sampleSize } = consumptionRate(pastEvents, eventType);
  const chosen = recipes.filter((r) => menu.includes(r.id));

  let totalNaive = 0;
  let totalRec = 0;
  let avoidedCost = 0;

  const dishes: DishForecast[] = chosen.map((r) => {
    // naive: sum of recipe per-guest * guests (what they'd normally cook, no waste correction)
    const recipePerGuest = r.ingredients.reduce((s, ing) => s + ing.kgPerGuest, 0);
    const naiveKg = +(recipePerGuest * guests).toFixed(1);

    // recommended: cook close to what guests actually eat (consumption rate),
    // adjusted only by the coverage choice (1.0 normal, 0.9 lean).
    const perGuestKg = recipePerGuest * rate * coverage;
    const recommendedKg = +(perGuestKg * guests).toFixed(1);

    totalNaive += naiveKg;
    totalRec += recommendedKg;

    // ingredient breakdown scaled to recommended
    const scale = recipePerGuest > 0 ? perGuestKg / recipePerGuest : 0;
    const ingredientNeeds = r.ingredients.map((ing) => {
      const item =
        inventory.find((i) => i.id === ing.itemId) ||
        inventory.find((i) => i.name.toLowerCase() === (ing as any).name?.toLowerCase());
      const kg = +(ing.kgPerGuest * scale * guests).toFixed(1);
      const haveKg = item?.qtyKg ?? 0;
      avoidedCost += Math.max(0, (ing.kgPerGuest * guests) - kg) * (item?.costPerKg ?? 0);
      return { itemId: item?.id ?? ing.itemId, name: item?.name ?? (ing as any).name ?? "Ingredient",
        kg, haveKg, shortKg: +Math.max(0, kg - haveKg).toFixed(1) };
    });

    return { recipeId: r.id, recipeName: r.name, naiveKg, recommendedKg, perGuestKg: +perGuestKg.toFixed(3), ingredientNeeds };
  });

  return {
    eventType, guests, coverage, rate, sampleSize, dishes,
    totalNaiveKg: +totalNaive.toFixed(1),
    totalRecommendedKg: +totalRec.toFixed(1),
    avoidedKg: +(totalNaive - totalRec).toFixed(1),
    avoidedCost: +avoidedCost.toFixed(0),
  };
}
