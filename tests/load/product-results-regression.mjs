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
