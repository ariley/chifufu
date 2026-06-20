import { ResultItem, CategoryKey } from '../types';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

const CATEGORY_PROMPTS: Record<CategoryKey, string> = {
  'go-out': 'cheapest dine-in restaurants and fast food spots to eat at in person',
  'order-in': 'cheapest food delivery deals available for delivery',
  'grocery': 'cheapest grocery items and deals at nearby supermarkets and stores',
  'under5': 'cheapest food options under $5 total — include dine-in, delivery, and grocery',
  'under10': 'cheapest food options under $10 total — include dine-in, delivery, and grocery',
};

function buildPrompt(location: string, category: CategoryKey): string {
  const desc = CATEGORY_PROMPTS[category];
  const priceFilter =
    category === 'under5' ? ' Every result must be under $5.' :
    category === 'under10' ? ' Every result must be under $10.' : '';

  return `You are a local cheap food expert. Find the ${desc} near ${location}.${priceFilter}

Return a JSON array of 5–8 options sorted by priceValue ascending. Each object must have exactly these fields:
{
  "id": "unique-string",
  "name": "Business name",
  "description": "Specific cheap item or deal (e.g. Bean burrito, Hot-N-Ready pizza)",
  "price": "$X.XX",
  "priceValue": 1.99,
  "distance": "0.4 mi" or "DoorDash" (use platform name for delivery),
  "badges": ["deal" | "fast" | "close"],  // deal=best value, fast=quick, close=very nearby; use [] if none apply
  "address": "123 Main St",               // include for dine-in and grocery, omit for delivery
  "platform": "DoorDash"                  // include for delivery only, omit otherwise
}

Use realistic local businesses and current prices for ${location}. Return ONLY valid JSON with no markdown fences or explanation.`;
}

export async function fetchCheapFoodOptions(
  location: string,
  category: CategoryKey,
): Promise<ResultItem[]> {
  if (!API_KEY) {
    throw new Error(
      'Anthropic API key not set. Add EXPO_PUBLIC_ANTHROPIC_API_KEY to your .env file.',
    );
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildPrompt(location, category) }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}${body ? ': ' + body : ''}`);
  }

  const data = await response.json();
  const rawText: string = data?.content?.[0]?.text ?? '';

  // Strip markdown code fences if the model adds them
  const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  const items = JSON.parse(cleaned) as ResultItem[];
  return items.sort((a, b) => a.priceValue - b.priceValue);
}
