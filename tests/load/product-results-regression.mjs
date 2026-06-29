const API = process.env.API_URL ?? 'http://localhost:3000';

async function postResults(searchQuery) {
  const response = await fetch(`${API}/api/results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchQuery,
      category: 'grocery',
      location: 'Oakland, CA',
      lat: 37.8044,
      lng: -122.2712,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`results failed ${response.status}: ${body}`);
  }

  return response.json();
}

async function getDetails(query) {
  let response = await fetch(`${API}/api/product/details?q=${encodeURIComponent(query)}`);
  if (response.status === 404) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    response = await fetch(`${API}/api/product/details?q=${encodeURIComponent(query)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`details failed ${response.status}: ${body}`);
  }
  return response.json();
}

function uniqueCount(items, pick) {
  return new Set(items.map(pick).filter(Boolean)).size;
}

async function assertDistinctProductRows(searchQuery) {
  let items = await postResults(searchQuery);
  if ((!Array.isArray(items) || items.length === 0)) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    items = await postResults(searchQuery);
  }
  if (!Array.isArray(items) || items.length < 1) {
    throw new Error(`${searchQuery}: expected at least 1 result row`);
  }

  const names = uniqueCount(items, item => [item.brand, item.description].filter(Boolean).join(' '));
  const detailQueries = uniqueCount(items, item => item.detailQuery);
  const images = uniqueCount(items, item => item.imageUrl);

  if (names < 1 || detailQueries < 1 || images < 1) {
    throw new Error(`${searchQuery}: expected real product identity, detail query, and image`);
  }

  for (const item of items) {
    const product = [item.brand, item.description].filter(Boolean).join(' ');
    if (!item.brand || !item.imageUrl) {
      throw new Error(`${searchQuery}: expected brand and image for every row, missing on ${product || item.description}`);
    }
    if (!item.isLivePrice && !item.calories && !item.ingredients && !item.nutrition?.servingSize) {
      throw new Error(`${searchQuery}: expected label data for ${product}`);
    }
    if (item.price != null && item.isLivePrice !== true) {
      throw new Error(`${searchQuery}: priced row must be marked as live provider data`);
    }
    if (/typical package|eggs \(dozen\)|source['"]?:\s*['"]fallback/i.test(JSON.stringify(item))) {
      throw new Error(`${searchQuery}: generic fallback product leaked into results`);
    }
  }

  console.log(JSON.stringify({
    searchQuery,
    rows: items.length,
    names,
    detailQueries,
    images,
    sample: items.slice(0, 4).map(item => ({
      product: [item.brand, item.description].filter(Boolean).join(' '),
      detailQuery: item.detailQuery,
      hasImage: Boolean(item.imageUrl),
    })),
  }, null, 2));
}

await assertDistinctProductRows('Norwegian cream cheese');
await assertDistinctProductRows('Norwegian crème cheese');
await assertDistinctProductRows('Eggs');
await assertDistinctProductRows('Milk');
await assertDistinctProductRows('Carrots');
await assertDistinctProductRows('Orange juice with pulp');
const orangeJuiceItems = await postResults('Orange juice with pulp');
if (orangeJuiceItems.some(item => /\b(no pulp|pulp free|sans pulpe)\b/i.test([item.brand, item.description].filter(Boolean).join(' ')))) {
  throw new Error('Orange juice with pulp: no-pulp product leaked into results');
}
await assertDistinctProductRows('Greek yogurt');
await assertDistinctProductRows('Peanut butter');
await assertDistinctProductRows('Dark chocolate');

const israeliFetaItems = await postResults('Israeli feta');
if (israeliFetaItems.some(item => /couscous|salad/i.test([item.brand, item.description].filter(Boolean).join(' ')))) {
  throw new Error('Israeli feta: irrelevant couscous/salad product leaked into results');
}
const israeliFeta = israeliFetaItems.find(item => /feta/i.test(item.detailQuery ?? item.description));
if (!israeliFeta) {
  throw new Error('Israeli feta: expected a feta candidate');
}
if (!israeliFeta.imageUrl || !israeliFeta.ingredients || (!israeliFeta.nutrition?.servingSize && !israeliFeta.nutrition?.saturatedFat)) {
  throw new Error('Israeli feta: expected image, ingredients, and label nutrition on result row');
}

const israeliFetaDetails = await getDetails(israeliFeta.detailQuery);
if (!israeliFetaDetails.imageUrl || !israeliFetaDetails.ingredients || !israeliFetaDetails.nutrition?.saturatedFat) {
  throw new Error('Israeli feta: expected image, ingredients, and expanded label details');
}

console.log(JSON.stringify({
  searchQuery: 'Israeli feta',
  product: [israeliFeta.brand, israeliFeta.description].filter(Boolean).join(' '),
  hasImage: Boolean(israeliFeta.imageUrl),
  ingredients: israeliFetaDetails.ingredients,
  nutritionKeys: Object.keys(israeliFetaDetails.nutrition ?? {}),
}, null, 2));
