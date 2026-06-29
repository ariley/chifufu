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
  const response = await fetch(`${API}/api/product/details?q=${encodeURIComponent(query)}`);
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
  const items = await postResults(searchQuery);
  if (!Array.isArray(items) || items.length < 3) {
    throw new Error(`${searchQuery}: expected at least 3 result rows`);
  }

  const names = uniqueCount(items, item => [item.brand, item.description].filter(Boolean).join(' '));
  const detailQueries = uniqueCount(items, item => item.detailQuery);
  const images = uniqueCount(items, item => item.imageUrl);

  if (names < 2) {
    throw new Error(`${searchQuery}: expected multiple product names, got ${names}`);
  }
  if (detailQueries < 2) {
    throw new Error(`${searchQuery}: expected multiple detail queries, got ${detailQueries}`);
  }
  if (images < 2) {
    throw new Error(`${searchQuery}: expected multiple product images, got ${images}`);
  }

  const firstDetails = await getDetails(items[0].detailQuery);
  if (!firstDetails.imageUrl || (!firstDetails.ingredients && !firstDetails.nutrition?.servingSize && !firstDetails.calories)) {
    throw new Error(`${searchQuery}: expected detail page image and label data for ${items[0].detailQuery}`);
  }

  for (const item of items) {
    const product = [item.brand, item.description].filter(Boolean).join(' ');
    if (!item.brand || !item.imageUrl) {
      throw new Error(`${searchQuery}: expected brand and image for every row, missing on ${product || item.description}`);
    }
    if (!item.calories && !item.ingredients && !item.nutrition?.servingSize) {
      throw new Error(`${searchQuery}: expected label data for ${product}`);
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
await assertDistinctProductRows('Eggs');
await assertDistinctProductRows('Orange juice with pulp');

const israeliFetaItems = await postResults('Israeli feta');
const israeliFeta = israeliFetaItems.find(item => item.detailQuery?.includes("Trader Joe's Israeli Feta"));
if (!israeliFeta) {
  throw new Error('Israeli feta: expected Trader Joe\'s Israeli Feta candidate');
}
if (!israeliFeta.imageUrl || !israeliFeta.ingredients || !israeliFeta.nutrition?.servingSize) {
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
