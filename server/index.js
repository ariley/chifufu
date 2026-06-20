const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const CATEGORY_PROMPTS = {
  'go-out': 'cheapest dine-in restaurants and fast food spots to eat at in person',
  'order-in': 'cheapest food delivery deals available for delivery',
  'grocery': 'cheapest grocery items and deals at nearby supermarkets and stores',
  'under5': 'cheapest food options under $5 total — include dine-in, delivery, and grocery',
  'under10': 'cheapest food options under $10 total — include dine-in, delivery, and grocery',
};

function buildPrompt(location, category) {
  const desc = CATEGORY_PROMPTS[category] ?? CATEGORY_PROMPTS['go-out'];
  const priceFilter =
    category === 'under5' ? ' Every result must be under $5.' :
    category === 'under10' ? ' Every result must be under $10.' : '';

  return `You are a local cheap food expert. Find the ${desc} near ${location}.${priceFilter}

Return a JSON array of 5–8 options sorted by priceValue ascending. Each object must have exactly these fields:
{
  "id": "unique-string",
  "name": "Business name",
  "description": "Specific cheap item or deal",
  "price": "$X.XX",
  "priceValue": 1.99,
  "distance": "0.4 mi" or "DoorDash" (use platform name for delivery),
  "badges": ["deal"|"fast"|"close"],
  "address": "123 Main St, City, State",   // full street address for dine-in/grocery; omit for delivery
  "platform": "DoorDash"                    // delivery platform only; omit otherwise
}

Use real businesses with accurate addresses for ${location}. Return ONLY valid JSON with no markdown or explanation.`;
}

async function geocode(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'CheapEats/1.0 (contact@cheapeats.app)' },
    });
    const data = await resp.json();
    if (data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (_) {
    // geocoding is best-effort
  }
  return {};
}

app.get('/', (_req, res) => res.json({ name: 'Cheap Eats API', status: 'ok', endpoints: ['POST /api/results', 'GET /health'] }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/results', async (req, res) => {
  const { location, category } = req.body ?? {};
  if (!location || !category) {
    return res.status(400).json({ error: 'location and category are required' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

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
        messages: [{ role: 'user', content: buildPrompt(location, category) }],
      }),
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Anthropic API' });
  }

  if (!anthropicResp.ok) {
    const body = await anthropicResp.text().catch(() => '');
    return res.status(502).json({ error: `Anthropic error ${anthropicResp.status}`, detail: body });
  }

  const anthropicData = await anthropicResp.json();
  const rawText = anthropicData?.content?.[0]?.text ?? '';
  const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let items;
  try {
    items = JSON.parse(cleaned);
  } catch (_) {
    return res.status(502).json({ error: 'Failed to parse results from AI', raw: cleaned });
  }

  // Geocode addresses in parallel (best-effort)
  items = await Promise.all(
    items.map(async (item) => {
      if (item.address) {
        const coords = await geocode(item.address);
        return { ...item, ...coords };
      }
      return item;
    }),
  );

  items.sort((a, b) => a.priceValue - b.priceValue);
  res.json(items);
});

app.listen(PORT, () => {
  console.log(`Cheap Eats server running on port ${PORT}`);
});
