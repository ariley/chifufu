const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const { findNearestStore, searchProducts } = require('./lib/kroger');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESULTS_CACHE_TTL_MS = 15 * 60 * 1000;
const resultsCache = new Map();
const pendingResults = new Map();

function normalizeCachePart(value) {
  return String(value ?? '').trim().toLowerCase();
}

function coordinateCachePart(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(3) : '';
}

function getResultsCacheKey({ location, category, searchQuery, lat, lng }) {
  return [
    normalizeCachePart(location),
    normalizeCachePart(category),
    normalizeCachePart(searchQuery),
    coordinateCachePart(lat),
    coordinateCachePart(lng),
  ].join('|');
}

function getCachedResults(key) {
  const cached = resultsCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > RESULTS_CACHE_TTL_MS) {
    resultsCache.delete(key);
    return null;
  }
  return cached.items;
}

function setCachedResults(key, items) {
  resultsCache.set(key, { createdAt: Date.now(), items });
}

async function generateResults({ location, category, searchQuery, lat, lng }) {
  // 1. Resolve coordinates — use GPS if provided, else geocode the string
  let coords = (lat && lng) ? { lat, lng } : await geocodeLocation(location);

  // 2. Fetch real nearby places from Google Places
  let places = [];
  if (coords) {
    places = await queryGooglePlaces(coords.lat, coords.lng, category);
  }

  // 3. Build prompt — real places if we have enough, else fall back
  const prompt = places.length >= 3
    ? buildPromptWithPlaces(location, category, places, searchQuery)
    : buildPromptFallback(location, category, searchQuery);

  // 4. Call Claude
  let anthropicResp;
  try {
    anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (_) {
    throw new Error('Failed to reach Anthropic API');
  }

  if (!anthropicResp.ok) {
    const body = await anthropicResp.text().catch(() => '');
    throw new Error(`Anthropic error ${anthropicResp.status}: ${body}`);
  }

  const anthropicData = await anthropicResp.json();
  const rawText = anthropicData?.content?.[0]?.text ?? '';
  const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let items;
  try {
    items = JSON.parse(cleaned);
  } catch (_) {
    const error = new Error('Failed to parse results from AI');
    error.raw = cleaned;
    throw error;
  }

  // 5. Attach real coordinates from Google Places results by matching store name
  const placeMap = new Map(places.map(p => [p.name.toLowerCase(), p]));
  items = items.map(item => {
    const match = placeMap.get(item.name?.toLowerCase());
    if (match) {
      return {
        ...item,
        lat: match.lat,
        lng: match.lng,
        rating: match.rating,
        address: item.address || match.address || undefined,
        distance: item.distance || `${match.distMi} mi`,
      };
    }
    return item;
  });

  items.sort((a, b) => a.priceValue - b.priceValue);
  return items;
}

// ── Haversine distance in km ───────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Geocode a location string → { lat, lng } via Nominatim ────
async function geocodeLocation(location) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'Chifufu/1.0 (contact@chifufu.com)' } });
    const data = await resp.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (_) {}
  return null;
}

// ── Google Places API — real nearby places ─────────────────────
const GOOGLE_PLACE_TYPES = {
  'grocery':    'supermarket',
  'go-out':     'restaurant',
  'order-in':   'restaurant',
  'under5':     'meal_takeaway',
  'under10':    'restaurant',
  'pet-stores': 'pet_store',
};

async function queryGooglePlaces(lat, lng, category) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const type = GOOGLE_PLACE_TYPES[category] ?? 'restaurant';
  const radius = category === 'pet-stores' || category === 'grocery' ? 8000 : 3000;
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places error:', data.status, data.error_message ?? '');
      return [];
    }

    return (data.results ?? [])
      .slice(0, 15)
      .map(place => {
        const placeLat = place.geometry.location.lat;
        const placeLng = place.geometry.location.lng;
        const distMi = (haversine(lat, lng, placeLat, placeLng) * 0.621).toFixed(1);
        return {
          name: place.name,
          type: place.types?.[0] ?? type,
          address: place.vicinity ?? '',
          lat: placeLat,
          lng: placeLng,
          distMi,
          rating: place.rating,
          priceLevel: place.price_level, // 0-4 scale
        };
      })
      .sort((a, b) => parseFloat(a.distMi) - parseFloat(b.distMi))
      .slice(0, 12);
  } catch (err) {
    console.error('Google Places fetch error:', err.message);
    return [];
  }
}

function filterPlacesForLocation(places, locationLabel) {
  const city = locationLabel?.split(',')[0]?.trim().toLowerCase();
  if (!city) return places;

  const cityPlaces = places.filter(place => {
    const text = `${place.name} ${place.address}`.toLowerCase();
    return text.includes(city);
  });

  return cityPlaces.length > 0 ? cityPlaces : places;
}

// ── Prompt builders ────────────────────────────────────────────
const CATEGORY_CONTEXT = {
  'grocery':    'cheapest grocery items and deals at nearby supermarkets and stores',
  'go-out':     'cheapest dine-in meals at nearby restaurants and fast food spots',
  'order-in':   'cheapest delivery meals from nearby restaurants',
  'under5':     'cheapest food options under $5',
  'under10':    'cheapest food options under $10',
  'pet-stores': 'cheapest pet food, treats, and supplies',
};

function buildPromptWithPlaces(location, category, places, searchQuery) {
  const placeList = places
    .map((p, i) => `${i + 1}. ${p.name}${p.type ? ` (${p.type})` : ''} — ${p.distMi} mi away${p.address ? ', ' + p.address : ''}`)
    .join('\n');

  const context = CATEGORY_CONTEXT[category] ?? CATEGORY_CONTEXT['go-out'];
  const priceFilter = category === 'under5' ? ' Every result must be under $5.' :
                      category === 'under10' ? ' Every result must be under $10.' : '';

  const task = searchQuery
    ? `The user is looking for: "${searchQuery}". Find which of the stores above sell it for the least.`
    : `Find the ${context} from the stores listed above.${priceFilter}`;

  return `You are a local cheap food expert. Here are real stores currently near ${location}:

${placeList}

${task}

IMPORTANT: Only use stores from the list above — do not invent or add any stores not listed. Use the exact names and addresses provided.

Return a JSON array of 5–8 options sorted by priceValue ascending. Each object must have exactly these fields:
{
  "id": "unique-string",
  "name": "Exact store name from the list above",
  "description": "Specific cheap item or deal (e.g. 'Store brand pasta 1lb', 'Value meal #3')",
  "price": "$X.XX",
  "priceValue": 1.99,
  "distance": "${places[0]?.distMi ?? '0.5'} mi",
  "badges": ["deal"|"fast"|"close"],
  "address": "Use the address from the list above",
  "platform": "DoorDash"  // delivery only; omit otherwise
}

Return ONLY valid JSON with no markdown or explanation.`;
}

function buildPromptFallback(location, category, searchQuery) {
  const context = CATEGORY_CONTEXT[category] ?? CATEGORY_CONTEXT['go-out'];
  const priceFilter = category === 'under5' ? ' Every result must be under $5.' :
                      category === 'under10' ? ' Every result must be under $10.' : '';
  const intro = searchQuery
    ? `Find the cheapest places to buy "${searchQuery}" near ${location}. Include grocery stores, supermarkets, and any relevant shops.`
    : `Find the ${context} near ${location}.${priceFilter}`;

  return `You are a local cheap food expert. ${intro}

Return a JSON array of 5–8 options sorted by priceValue ascending. Each object must have exactly these fields:
{
  "id": "unique-string",
  "name": "Business name",
  "description": "Specific cheap item or deal",
  "price": "$X.XX",
  "priceValue": 1.99,
  "distance": "0.4 mi",
  "badges": ["deal"|"fast"|"close"],
  "address": "123 Main St, City, State",
  "platform": "DoorDash"  // delivery only; omit otherwise
}

Use real businesses with accurate addresses for ${location}. Return ONLY valid JSON with no markdown or explanation.`;
}

// ── In-memory shared cart store (TTL 24h) ──────────────────────
const cartStore = new Map();
const CART_TTL = 86_400_000;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of cartStore) {
    if (now - v.createdAt > CART_TTL) cartStore.delete(k);
  }
}

app.post('/api/cart/share', (req, res) => {
  const { items } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array required' });
  }
  purgeExpired();
  let code;
  do { code = generateCode(); } while (cartStore.has(code));
  cartStore.set(code, { items, createdAt: Date.now() });
  const base = process.env.PUBLIC_URL ?? `https://cheap-food-production.up.railway.app`;
  res.json({ code, webUrl: `${base}/cart/${code}`, deepLink: `chifufu://cart?code=${code}` });
});

app.get('/api/cart/:code', (req, res) => {
  purgeExpired();
  const entry = cartStore.get(req.params.code.toUpperCase());
  if (!entry) return res.status(404).json({ error: 'Cart not found or expired' });
  res.json({ items: entry.items });
});

app.get('/cart/:code', (req, res) => {
  purgeExpired();
  const code = req.params.code.toUpperCase();
  const entry = cartStore.get(code);
  if (!entry) {
    return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cart not found</title><style>body{font-family:-apple-system,sans-serif;text-align:center;padding:60px 24px;color:#444}</style></head><body><h2>Cart not found</h2><p>This shared cart may have expired. Carts are available for 24 hours.</p></body></html>`);
  }
  const items = entry.items;
  const stores = {};
  for (const item of items) {
    if (!stores[item.name]) stores[item.name] = [];
    stores[item.name].push(item);
  }
  let total = 0;
  let storeHtml = '';
  for (const [storeName, storeItems] of Object.entries(stores)) {
    storeHtml += `<div class="store"><div class="sname">🏪 ${storeName}</div>`;
    for (const item of storeItems) {
      total += item.priceValue * (item.quantity ?? 1);
      storeHtml += `<div class="row"><span>${item.description} ×${item.quantity ?? 1}</span><span class="price">${item.price}</span></div>`;
    }
    storeHtml += '</div>';
  }
  res.send(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shared Cart — Chifufu</title>
<style>
  body{font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#f5f5f7}
  h1{color:#1D9E75;margin:0 0 4px}p.sub{color:#888;font-size:13px;margin:0 0 20px}
  .store{background:#fff;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .sname{font-weight:600;font-size:15px;margin-bottom:10px}
  .row{display:flex;justify-content:space-between;font-size:14px;color:#444;padding:3px 0}
  .price{color:#1D9E75;font-weight:500}
  .total{font-size:16px;font-weight:600;display:flex;justify-content:space-between;padding:12px 0 0}
  .btn{display:block;background:#1D9E75;color:#fff;text-decoration:none;border-radius:12px;padding:14px;text-align:center;font-weight:500;font-size:16px;margin-top:24px}
  .btn-outline{display:block;border:1.5px solid #1D9E75;color:#1D9E75;text-decoration:none;border-radius:12px;padding:13px;text-align:center;font-weight:500;font-size:15px;margin-top:10px}
</style></head><body>
<h1>🛒 Shared Cart</h1>
<p class="sub">Your friend shared this shopping list with you.</p>
${storeHtml}
<div class="store"><div class="total"><span>Estimated total</span><span class="price">$${total.toFixed(2)}</span></div></div>
<a href="chifufu://cart?code=${code}" class="btn">Open in Chifufu app</a>
<a href="https://apps.apple.com/app/expo-go/id982107779" class="btn-outline">Get the app</a>
</body></html>`);
});

// ── Kroger: nearby stores ──────────────────────────────────────
app.get('/api/kroger/stores', async (req, res) => {
  const { lat, lng, radius } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  try {
    const stores = await findNearestStore(parseFloat(lat), parseFloat(lng), parseFloat(radius ?? 10));
    if (!stores) return res.json([]);
    res.json(stores);
  } catch (err) {
    console.error('kroger/stores error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Grocery: real nearby grocery stores via Google Places ──────
app.get('/api/grocery/stores', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  try {
    const places = await queryGooglePlaces(parseFloat(lat), parseFloat(lng), 'grocery');
    res.json(places);
  } catch (err) {
    console.error('grocery/stores error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Kroger: product search ─────────────────────────────────────
app.get('/api/kroger/search', async (req, res) => {
  const { q, locationId, limit } = req.query;
  if (!q) return res.status(400).json({ error: 'q (search query) required' });
  if (!locationId) return res.status(400).json({ error: 'locationId required' });
  try {
    const products = await searchProducts(q, locationId, parseInt(limit ?? 20));
    res.json(products);
  } catch (err) {
    console.error('kroger/search error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

app.get('/', (_req, res) => res.json({ name: 'Chifufu API', status: 'ok', version: '2.0' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Main results endpoint ──────────────────────────────────────
app.post('/api/results', async (req, res) => {
  const { location, category, searchQuery, lat, lng } = req.body ?? {};
  if (!location || !category) {
    return res.status(400).json({ error: 'location and category are required' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  const cacheKey = getResultsCacheKey({ location, category, searchQuery, lat, lng });
  const cached = getCachedResults(cacheKey);
  if (cached) {
    res.set('X-Chifufu-Cache', 'HIT');
    return res.json(cached);
  }

  const pending = pendingResults.get(cacheKey);
  if (pending) {
    res.set('X-Chifufu-Cache', 'WAIT');
    try {
      return res.json(await pending);
    } catch (err) {
      console.error('results pending error:', err.message);
      return res.status(502).json({ error: err.message });
    }
  }

  res.set('X-Chifufu-Cache', 'MISS');
  const generation = generateResults({ location, category, searchQuery, lat, lng });
  pendingResults.set(cacheKey, generation);
  try {
    const items = await generation;
    setCachedResults(cacheKey, items);
    res.json(items);
  } catch (err) {
    console.error('results error:', err.message);
    res.status(502).json({ error: err.message, raw: err.raw });
  } finally {
    pendingResults.delete(cacheKey);
  }
});

app.listen(PORT, () => {
  console.log(`Chifufu server running on port ${PORT}`);
});
