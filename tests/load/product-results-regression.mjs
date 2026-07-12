const API = process.env.API_URL ?? 'http://localhost:3000';
const LOCAL_WITHOUT_LIVE_PROVIDER = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(API)
  && !process.env.KROGER_CLIENT_ID;

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

async function getSuggestions(query) {
  const response = await fetch(`${API}/api/product/suggestions?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`suggestions failed ${response.status}: ${body}`);
  }
  return response.json();
}

async function getBarcodeProduct(code) {
  const response = await fetch(`${API}/api/product/barcode/${encodeURIComponent(code)}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`barcode failed ${response.status}: ${body}`);
  }
  return response.json();
}

function uniqueCount(items, pick) {
  return new Set(items.map(pick).filter(Boolean)).size;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function assertSuggestions(query, expectedLabels) {
  const suggestions = await getSuggestions(query);
  const labels = suggestions.map(item => item.label.toLowerCase());
  expectedLabels.forEach((expected) => {
    if (!labels.includes(expected.toLowerCase())) {
      throw new Error(`${query}: expected suggestion "${expected}", got ${labels.join(', ')}`);
    }
  });
  console.log(JSON.stringify({ query, suggestions: suggestions.slice(0, 6) }, null, 2));
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

async function assertNoGenericNorwegianCreamCheeseRows(searchQuery) {
  const items = await postResults(searchQuery);
  const genericRows = items.filter(item => {
    const product = normalize([item.brand, item.description, item.detailQuery].filter(Boolean).join(' '));
    return /\b(kroger|philadelphia)\b/.test(product)
      || (/\bcream cheese\b/.test(product) && !/\b(norwegian|snofrisk|sno frisk|tine|brunost)\b/.test(product));
  });

  if (genericRows.length > 0) {
    throw new Error(`${searchQuery}: generic cream cheese leaked into results: ${
      genericRows.map(item => [item.brand, item.description].filter(Boolean).join(' ')).join(', ')
    }`);
  }
  console.log(JSON.stringify({
    searchQuery,
    rows: items.length,
    sample: items.slice(0, 4).map(item => ({
      product: [item.brand, item.description].filter(Boolean).join(' '),
      detailQuery: item.detailQuery,
      source: item.source,
    })),
  }, null, 2));
}

await assertSuggestions('cre', ['cream cheese', 'sour cream']);
await assertSuggestions('creem', ['cream cheese']);
await assertSuggestions('yogh', ['yogurt', 'greek yogurt']);
const barcodeProduct = await getBarcodeProduct('737628064502');
if (!barcodeProduct.code || !barcodeProduct.name || !barcodeProduct.brand || !barcodeProduct.imageUrl || !barcodeProduct.ingredients) {
  throw new Error('Barcode lookup: expected code, product identity, image, and ingredients');
}
console.log(JSON.stringify({
  barcode: barcodeProduct.code,
  product: [barcodeProduct.brand, barcodeProduct.name].filter(Boolean).join(' '),
  hasImage: Boolean(barcodeProduct.imageUrl),
  hasIngredients: Boolean(barcodeProduct.ingredients),
}, null, 2));
await assertNoGenericNorwegianCreamCheeseRows('Norwegian cream cheese');
await assertNoGenericNorwegianCreamCheeseRows('Norwegian crème cheese');
await assertDistinctProductRows('Rye bread');
if (LOCAL_WITHOUT_LIVE_PROVIDER) {
  console.log('Skipping live-provider product cases: local API has no Kroger credentials.');
} else {
  await assertDistinctProductRows('Organic eggs');
  await assertDistinctProductRows('Grocery Outlet eggs');
  await assertDistinctProductRows('Eggs');
  await assertDistinctProductRows('Milk');
  await assertDistinctProductRows('Carrots');
  await assertDistinctProductRows('Orange juice with pulp');
  const orangeJuiceItems = await postResults('Orange juice with pulp');
  if (orangeJuiceItems.some(item => /\b(no pulp|pulp free|sans pulpe)\b/i.test([item.brand, item.description].filter(Boolean).join(' ')))) {
    throw new Error('Orange juice with pulp: no-pulp product leaked into results');
  }
  if (orangeJuiceItems.some(item => !/orange/i.test([item.brand, item.description].filter(Boolean).join(' ')))) {
    throw new Error('Orange juice with pulp: non-orange product leaked into results');
  }
  if (orangeJuiceItems.some(item => !/juice|pulp|pulpy/i.test([item.brand, item.description].filter(Boolean).join(' ')))) {
    throw new Error('Orange juice with pulp: non-juice product leaked into results');
  }
  await assertDistinctProductRows('Greek yogurt');
  await assertDistinctProductRows('Peanut butter');
  await assertDistinctProductRows('Dark chocolate');
}

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
