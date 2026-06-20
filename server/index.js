// ===== CaterToUs backend =====
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { seed } from "./seed.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_KEY = process.env.GROQ_API_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const USDA_KEY = process.env.USDA_API_KEY;
const MODEL = "llama-3.3-70b-versatile";

// ---------- In-memory shared store (single source of truth) ----------
let inventory = JSON.parse(JSON.stringify(seed.inventory));
let recipes = JSON.parse(JSON.stringify(seed.recipes));
let events = JSON.parse(JSON.stringify(seed.events || []));
let suppliers = JSON.parse(JSON.stringify(seed.suppliers || []));
let wasteLogs = [];

// ---------- Groq helper (OpenAI-compatible) ----------
async function askGemini(system, userContent, maxTokens = 800) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

// ---------- Inventory CRUD ----------
app.get("/api/state", (_req, res) => res.json({ inventory, recipes, events, suppliers, wasteLogs }));

app.post("/api/inventory/add", (req, res) => {
  const items = req.body.items || [];
  for (const it of items) {
    const idx = inventory.findIndex((p) => p.name.toLowerCase() === it.name.toLowerCase());
    if (idx >= 0) {
      inventory[idx].qtyKg = +(inventory[idx].qtyKg + it.qtyKg).toFixed(2);
      inventory[idx].expiresInDays = Math.min(inventory[idx].expiresInDays, it.expiresInDays);
    } else {
      inventory.unshift({ id: it.id || `srv-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, ...it });
    }
  }
  res.json({ inventory });
});

app.post("/api/inventory/delete", (req, res) => {
  inventory = inventory.filter((i) => i.id !== req.body.id);
  res.json({ inventory });
});

app.post("/api/inventory/deduct", (req, res) => {
  const consumption = req.body.consumption || [];
  for (const c of consumption) {
    const it = inventory.find((i) => i.id === c.itemId);
    if (it) it.qtyKg = +Math.max(0, it.qtyKg - c.kg).toFixed(2);
  }
  res.json({ inventory });
});

app.post("/api/recipes/add", (req, res) => { recipes.push(req.body.recipe); res.json({ recipes }); });
app.post("/api/recipes/update", (req, res) => {
  recipes = recipes.map((r) => (r.id === req.body.recipe.id ? req.body.recipe : r));
  res.json({ recipes });
});
app.post("/api/recipes/delete", (req, res) => {
  recipes = recipes.filter((r) => r.id !== req.body.id);
  res.json({ recipes });
});

app.post("/api/events/add", (req, res) => { events.unshift(req.body.event); res.json({ events }); });
app.post("/api/events/delete", (req, res) => {
  events = events.filter((e) => e.id !== req.body.id);
  res.json({ events });
});
app.post("/api/events/update", (req, res) => {
  events = events.map((e) => (e.id === req.body.event.id ? req.body.event : e));
  res.json({ events });
});

app.post("/api/waste/log", (req, res) => {
  const log = req.body.log;
  if (log) wasteLogs.unshift(log);
  res.json({ wasteLogs });
});
app.post("/api/waste/delete", (req, res) => {
  wasteLogs = wasteLogs.filter((w) => w.id !== req.body.id);
  res.json({ wasteLogs });
});

// ---------- AI routes (unchanged behaviour) ----------
app.post("/api/intake", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided." });
  const system = `You are a food-inventory assistant for a catering company in Malaysia.
The user describes ingredients they just received in plain language.
Convert their input into structured inventory items.
For EACH item estimate:
- name, category ("protein","grain","vegetable","dairy","sauce","other"),
- qtyKg (convert crates/sacks/trays to kg), expiresInDays (shelf life), costPerKg (RM),
- storageZone ("frozen","cold","chilled","cool","pantry"), storageNote (max 6 words).
Respond with ONLY a JSON array. Example:
[{"name":"Salmon fillet","category":"protein","qtyKg":20,"expiresInDays":2,"costPerKg":60,"storageZone":"cold","storageNote":"coldest shelf, on ice"}]`;
  try {
    const raw = await askGemini(system, text);
    let clean = raw.replace(/```json|```/g, "").trim();
    const a = clean.indexOf("["), b = clean.lastIndexOf("]");
    if (a !== -1 && b !== -1 && b > a) clean = clean.slice(a, b + 1);
    let items;
    try { items = JSON.parse(clean); }
    catch {
      items = (clean.match(/\{[^{}]*\}/g) || []).map((o) => { try { return JSON.parse(o); } catch { return null; } }).filter(Boolean);
    }
    if (!items || items.length === 0) { console.error("Intake raw reply:", raw); return res.status(500).json({ error: "Could not parse that. Try rephrasing." }); }
    res.json({ items });
  } catch (e) { console.error("Intake error:", e.message); res.status(500).json({ error: "Could not parse that." }); }
});

app.post("/api/shelflife", async (req, res) => {
  const { names } = req.body;
  if (!Array.isArray(names) || !names.length) return res.status(400).json({ error: "No names." });
  const system = `For each ingredient name, estimate shelfLifeDays (number), category
("protein","grain","vegetable","dairy","sauce","other"), costPerKg (RM, Malaysia),
storageZone ("frozen","cold","chilled","cool","pantry"), storageNote (max 6 words).
Respond ONLY a JSON array in the SAME ORDER. Example:
[{"name":"Salmon","shelfLifeDays":2,"category":"protein","costPerKg":60,"storageZone":"cold","storageNote":"coldest shelf, on ice"}]`;
  try {
    const raw = await askGemini(system, JSON.stringify(names), 2000);
    let clean = raw.replace(/```json|```/g, "").trim();
    const a = clean.indexOf("["), b = clean.lastIndexOf("]");
    if (a !== -1 && b !== -1) clean = clean.slice(a, b + 1);
    let items;
    try { items = JSON.parse(clean); }
    catch { items = (clean.match(/\{[^{}]*\}/g) || []).map((o) => { try { return JSON.parse(o); } catch { return null; } }).filter(Boolean); }
    res.json({ items });
  } catch (e) { console.error(e); res.status(500).json({ error: "Could not estimate." }); }
});

app.post("/api/insight", async (req, res) => {
  const { expiring, events, availableDishes } = req.body;
  const system = `You are a catering operations advisor focused on cutting food waste.
You will receive: ingredients expiring soon (with kg available), upcoming events with their
actual dish names, and a list of the caterer's available dishes.

Write a clear recommendation (3-4 sentences) that:
- Names exact, real dish names (never use codes or IDs) to cook or push to use up the expiring ingredients.
- Says roughly how many kg of each expiring ingredient to use.
- Ties it to a specific upcoming event by name when relevant.
- If none of the existing dishes use the expiring ingredients well, SUGGEST one simple new dish
  that would use them, describing it in a few words.

Plain prose. No quotation marks, no markdown, no bullet points.`;
  const userContent = `Expiring soon: ${JSON.stringify(expiring)}
Upcoming events (with dishes): ${JSON.stringify(events)}
Available dishes: ${JSON.stringify(availableDishes || [])}`;
  try {
    let insight = await askGemini(system, userContent, 600);
    res.json({ insight: insight.replace(/["“”]/g, "") });
  } catch (e) { console.error("Insight error:", e.message); res.status(500).json({ error: "Insight unavailable." }); }
});


// ---------- Nutrition (USDA FoodData Central) ----------
const nutritionCache = {};

// Pull a numeric nutrient value by name from a USDA food record
function findNutrient(food, names) {
  const list = food.foodNutrients || [];
  for (const n of list) {
    const nm = (n.nutrientName || n.nutrient?.name || "").toLowerCase();
    if (names.some((x) => nm.includes(x))) {
      return n.value ?? n.amount ?? 0;
    }
  }
  return 0;
}

app.post("/api/nutrition", async (req, res) => {
  const { dish } = req.body;
  if (!dish) return res.status(400).json({ error: "No dish provided." });
  if (!USDA_KEY) return res.status(500).json({ error: "No USDA key set." });

  const key = dish.toLowerCase().trim();
  if (nutritionCache[key]) return res.json(nutritionCache[key]);

  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(dish)}&pageSize=1&api_key=${USDA_KEY}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`USDA ${r.status}: ${await r.text()}`);
    const data = await r.json();
    const food = data.foods?.[0];

    let result;
    if (food) {
      result = {
        dish,
        calories: Math.round(findNutrient(food, ["energy"])),
        protein: Math.round(findNutrient(food, ["protein"])),
        carbs: Math.round(findNutrient(food, ["carbohydrate"])),
        fat: Math.round(findNutrient(food, ["total lipid", "fat"])),
        unit: "per 100g",
        diets: [],
      };
    } else {
      result = { dish, calories: 0, protein: 0, carbs: 0, fat: 0, unit: "per 100g", diets: [] };
    }
    nutritionCache[key] = result;
    res.json(result);
  } catch (e) {
    console.error("Nutrition error:", e.message);
    res.status(500).json({ error: "Nutrition lookup failed." });
  }
});

// ---------- Telegram bot (long polling) ----------
function findRecipe(q) {
  q = q.toLowerCase().trim();
  return recipes.find((r) => r.name.toLowerCase() === q) ||
         recipes.find((r) => r.name.toLowerCase().includes(q));
}

async function tgSend(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

function handleCommand(text) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(" ");

  if (cmd === "/start" || cmd === "/help") {
    return `*CaterToUs kitchen bot* 🍽️\n\n` +
      `/stock — current inventory & expiry\n` +
      `/recipe <dish> — ingredients & measurements\n` +
      `/cook <dish> <guests> — calc, check stock & deduct\n` +
      `/help — this message`;
  }

  if (cmd === "/stock") {
    if (!inventory.length) return "Inventory is empty.";
    const lines = [...inventory].sort((a,b)=>a.expiresInDays-b.expiresInDays).map((i) => {
      const flag = i.expiresInDays <= 2 ? "🔴" : i.expiresInDays <= 4 ? "🟠" : "🟢";
      return `${flag} *${i.name}* — ${i.qtyKg}kg · ${i.expiresInDays}d left`;
    });
    return `*Current stock*\n${lines.join("\n")}`;
  }

  if (cmd === "/recipe") {
    if (!arg) return "Usage: /recipe <dish name>";
    const r = findRecipe(arg);
    if (!r) return `No dish matching "${arg}". Try /stock or check the spelling.`;
    const lines = r.ingredients.map((ing) => {
      const item = inventory.find((i) => i.id === ing.itemId) ||
                   inventory.find((i) => i.name.toLowerCase() === (ing.name||"").toLowerCase());
      const name = item?.name || ing.name || "ingredient";
      const needsDefrost = item && (item.storageZone === "frozen" || item.storageZone === "cold");
      return `• ${name}${needsDefrost ? " — ❄️ defrost first" : ""}`;
    });
    return `*${r.name}* — ingredients\n${lines.join("\n")}`;
  }

  if (cmd === "/cook") {
    const m = arg.match(/^(.*?)(\d+)\s*$/);
    if (!m) return "Usage: /cook <dish> <guests>  e.g. /cook salmon 100";
    const dishName = m[1].trim();
    const guests = parseInt(m[2], 10);
    const r = findRecipe(dishName);
    if (!r) return `No dish matching "${dishName}".`;

    const needs = r.ingredients.map((ing) => {
      const item = inventory.find((i) => i.id === ing.itemId) ||
                   inventory.find((i) => i.name.toLowerCase() === (ing.name||"").toLowerCase());
      const needKg = +(ing.kgPerGuest * guests).toFixed(1);
      const haveKg = item?.qtyKg ?? 0;
      return { item, name: item?.name || ing.name, needKg, haveKg, shortKg: +Math.max(0, needKg-haveKg).toFixed(1) };
    });

    // deduct what we can
    for (const n of needs) if (n.item) n.item.qtyKg = +Math.max(0, n.item.qtyKg - Math.min(n.needKg, n.haveKg)).toFixed(2);

    const lines = needs.map((n) =>
      `• ${n.name}: need ${n.needKg}kg` + (n.shortKg > 0 ? ` ⚠️ *short ${n.shortKg}kg*` : ` ✅`));
    const shortages = needs.filter((n) => n.shortKg > 0);
    let msg = `*${r.name} for ${guests} guests*\n${lines.join("\n")}\n\n✓ Stock deducted — website updated live.`;
    if (shortages.length) msg += `\n\n*Restock:* ${shortages.map((s)=>`${s.shortKg}kg ${s.name}`).join(", ")}`;
    return msg;
  }

  return "Unknown command. Send /help for the list.";
}

let tgOffset = 0;
async function pollTelegram() {
  if (!TG_TOKEN) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates?timeout=30&offset=${tgOffset}`);
    const data = await res.json();
    for (const upd of data.result || []) {
      tgOffset = upd.update_id + 1;
      const msg = upd.message;
      if (msg?.text) {
        const reply = handleCommand(msg.text);
        await tgSend(msg.chat.id, reply);
      }
    }
  } catch (e) { /* network blip, ignore */ }
  setTimeout(pollTelegram, 500);
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CaterToUs API running on :${PORT}`);
  if (TG_TOKEN) { console.log("Telegram bot polling…"); pollTelegram(); }
  else console.log("No TELEGRAM_BOT_TOKEN set — bot disabled.");
});
