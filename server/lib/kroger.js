// Use certification environment until production access is granted
const KROGER_BASE = process.env.KROGER_ENV === 'production'
  ? 'https://api.kroger.com/v1'
  : 'https://api-ce.kroger.com/v1';

// Token cache — Kroger tokens last 30 minutes
let _token = null;
let _tokenExpiresAt = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiresAt - 60_000) return _token;

  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('KROGER_CLIENT_ID / KROGER_CLIENT_SECRET not set');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${KROGER_BASE}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kroger auth failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  _token = data.access_token;
  _tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return _token;
}

// Find the nearest Kroger-family store — returns { locationId, name, address, distMi }
async function findNearestStore(lat, lng, radiusMiles = 10) {
  const token = await getToken();
  const params = new URLSearchParams({
    'filter.latLong.near': `${lat},${lng}`,
    'filter.radiusInMiles': String(radiusMiles),
    'filter.limit': '5',
  });

  const res = await fetch(`${KROGER_BASE}/locations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const stores = data.data ?? [];
  if (stores.length === 0) return null;

  return stores.map(s => ({
    locationId: s.locationId,
    name: s.name,
    chain: s.chain,
    address: [s.address?.addressLine1, s.address?.city, s.address?.state].filter(Boolean).join(', '),
    lat: s.geolocation?.latitude,
    lng: s.geolocation?.longitude,
  }));
}

// Search products at a specific store — returns array of product results
async function searchProducts(query, locationId, limit = 20) {
  const token = await getToken();
  const searchLimit = Math.max(limit, 50);

  for (const term of buildSearchTerms(query)) {
    const products = await fetchProductsForTerm(token, term, locationId, searchLimit);
    if (products.length > 0) return products;
  }

  return [];
}

async function fetchProductsForTerm(token, term, locationId, limit) {
  const params = new URLSearchParams({
    'filter.term': term,
    'filter.limit': String(limit),
  });
  if (locationId) {
    params.set('filter.locationId', locationId);
  }

  const res = await fetch(`${KROGER_BASE}/products?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kroger product search failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  const pricedProducts = (data.data ?? []).map(p => {
    const item = p.items?.[0] ?? {};
    const regularPrice = item.price?.regular;
    const promoPrice = item.price?.promo;
    const price = promoPrice && promoPrice < regularPrice ? promoPrice : regularPrice;
    const onSale = promoPrice && promoPrice < regularPrice;
    const size = item.size ?? '';

    return {
      id: p.productId,
      upc: p.upc,
      name: p.description,
      brand: p.brand ?? '',
      size,
      price: price != null ? `$${price.toFixed(2)}` : null,
      priceValue: price ?? null,
      regularPrice: regularPrice != null ? `$${regularPrice.toFixed(2)}` : null,
      onSale,
      savings: onSale ? `$${(regularPrice - promoPrice).toFixed(2)} off` : null,
      imageUrl: p.images?.find(i => i.perspective === 'front')?.sizes?.find(s => s.size === 'medium')?.url ?? null,
      relevanceRank: productRelevanceRank(term, p.description, p.brand, size),
      badges: [
        onSale && 'sale',
        p.brand?.toLowerCase().includes('kroger') && 'store brand',
      ].filter(Boolean),
    };
  })
  .filter(p => p.priceValue != null)
  .sort((a, b) => a.relevanceRank - b.relevanceRank || a.priceValue - b.priceValue);

  return pricedProducts.filter(productMatchesQuery(term));
}

module.exports = { findNearestStore, searchProducts };

function productMatchesQuery(query) {
  const rawTokens = normalizeForSearch(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const tokens = rawTokens.map(token => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token);

  return product => {
    const productText = [product.name, product.brand, product.size]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\bcreme\b/g, 'cream');
    const normalizedQuery = normalizeForSearch(query);
    if (/\bwith pulp\b/.test(String(query).toLowerCase()) && /\b(no pulp|pulp free|sans pulpe)\b/.test(productText)) {
      return false;
    }
    if (normalizedQuery === 'milk' && /\b(milk-bone|milk dud|candy|chocolate|cookie|biscuit|dog|snack|bone)\b/.test(productText)) {
      return false;
    }
    const rawHaystackTokens = new Set(productText
      .split(/[^a-z0-9]+/)
      .filter(Boolean));
    const haystackTokens = new Set([...rawHaystackTokens]
      .map(token => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));

    return tokens.every((token, index) => {
      const rawToken = rawTokens[index];
      if (rawToken.length > 3 && rawToken.endsWith('s')) {
        return rawHaystackTokens.has(rawToken);
      }
      return haystackTokens.has(token);
    });
  };
}

function buildSearchTerms(query) {
  const normalizedQuery = normalizeForSearch(query);
  const tokens = normalizedQuery
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2);
  const terms = [normalizedQuery];
  const coreTokens = tokens.filter(token => !GENERIC_PRODUCT_MODIFIERS.has(token));

  if (tokens.length >= 2) {
    const phrase = tokens.slice(-2).join(' ');
    terms.push(phrase);
  }

  if (coreTokens.length >= 2) {
    terms.push(coreTokens.join(' '));
  } else if (coreTokens.length === 1) {
    terms.push(coreTokens[0]);
  }

  return [...new Set(terms.filter(Boolean))];
}

function productRelevanceRank(query, name, brand, size) {
  const queryTokens = normalizeForSearch(query).split(/[^a-z0-9]+/).filter(token => token.length > 2);
  const productTokens = normalizeForSearch([name, brand, size].filter(Boolean).join(' ')).split(/[^a-z0-9]+/).filter(Boolean);
  const productText = productTokens.join(' ');
  const queryText = queryTokens.join(' ');
  const extraTokens = Math.max(0, productTokens.length - queryTokens.length);
  if (queryText && productText === queryText) return extraTokens;
  if (queryText && productText.startsWith(`${queryText} `)) return 10 + extraTokens;
  if (queryText && productText.includes(` ${queryText} `)) return 20 + extraTokens;
  return 100 + extraTokens;
}

const GENERIC_PRODUCT_MODIFIERS = new Set([
  'italian',
  'norwegian',
  'style',
  'kroger',
  'private',
  'selection',
  'simple',
  'truth',
  'fresh',
  'organic',
  'natural',
  'large',
  'small',
  'sliced',
  'shredded',
  'cream',
  'cheese',
  'whole',
  'low',
  'fat',
  'free',
]);

function normalizeForSearch(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bcreme\b/gi, 'cream')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
