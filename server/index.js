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
const RESULTS_CACHE_VERSION = 'products-v8-generic-catalog';
const RESULTS_CACHE_TTL_MS = 15 * 60 * 1000;
const PRODUCT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const resultsCache = new Map();
const productDetailsCache = new Map();
const productCandidatesCache = new Map();
const pendingResults = new Map();
const backgroundRefreshes = new Map();

function normalizeCachePart(value) {
  return normalizeForSearch(value);
}

function normalizeForSearch(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bcreme\b/gi, 'cream')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function coordinateCachePart(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(3) : '';
}

function getResultsCacheKey({ location, category, searchQuery, lat, lng }) {
  return [
    RESULTS_CACHE_VERSION,
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

function getCachedProductDetails(key) {
  const cached = productDetailsCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > PRODUCT_CACHE_TTL_MS) {
    productDetailsCache.delete(key);
    return null;
  }
  return cached.details;
}

function setCachedProductDetails(key, details) {
  productDetailsCache.set(key, { createdAt: Date.now(), details });
}

function getCachedProductCandidates(key) {
  const cached = productCandidatesCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > PRODUCT_CACHE_TTL_MS) {
    productCandidatesCache.delete(key);
    return null;
  }
  return cached.items;
}

function setCachedProductCandidates(key, items) {
  productCandidatesCache.set(key, { createdAt: Date.now(), items });
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
}

async function resolvePlaces({ location, category, lat, lng }) {
  const coords = (lat && lng) ? { lat, lng } : await geocodeLocation(location);
  if (coords) {
    return queryGooglePlaces(coords.lat, coords.lng, category);
  }
  return [];
}

async function generateResults({ location, category, searchQuery, places }) {
  const prompt = places.length >= 3
    ? buildPromptWithPlaces(location, category, places, searchQuery)
    : buildPromptFallback(location, category, searchQuery);

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

const DEFAULT_STORES = [
  { name: 'Nearby Grocery Store', address: '', distMi: '0.5', rating: undefined, priceLevel: 1 },
  { name: 'Local Market', address: '', distMi: '0.8', rating: undefined, priceLevel: 1 },
  { name: 'Neighborhood Supermarket', address: '', distMi: '1.1', rating: undefined, priceLevel: 2 },
];

function productDetailQuery(searchQuery) {
  const query = cleanSearchQuery(searchQuery);
  return query;
}

function cleanSearchQuery(searchQuery) {
  return normalizeForSearch(searchQuery).replace(/\s+/g, ' ').trim();
}

function nutrientValue(nutriments, key, unit = '') {
  const value = nutriments?.[key];
  if (!Number.isFinite(value)) return undefined;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${unit}`;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function withoutBrandPrefix(name, brand) {
  const cleanName = cleanText(name);
  const cleanBrand = cleanText(String(brand || '').split(',')[0]);
  if (!cleanName || !cleanBrand) return cleanName;
  return cleanName.toLowerCase().startsWith(`${cleanBrand.toLowerCase()} `)
    ? cleanName.slice(cleanBrand.length).trim()
    : cleanName;
}

function mapOpenFoodFactsProduct(product, query) {
  const nutriments = product?.nutriments ?? {};
  const calories = nutrientValue(nutriments, 'energy-kcal_serving', ' kcal')
    ?? nutrientValue(nutriments, 'energy-kcal_100g', ' kcal / 100g');
  const nutrition = {
    calories,
    fat: nutrientValue(nutriments, 'fat_serving', ' g') ?? nutrientValue(nutriments, 'fat_100g', ' g / 100g'),
    saturatedFat: nutrientValue(nutriments, 'saturated-fat_serving', ' g') ?? nutrientValue(nutriments, 'saturated-fat_100g', ' g / 100g'),
    transFat: nutrientValue(nutriments, 'trans-fat_serving', ' g') ?? nutrientValue(nutriments, 'trans-fat_100g', ' g / 100g'),
    cholesterol: nutrientValue(nutriments, 'cholesterol_serving', ' mg') ?? nutrientValue(nutriments, 'cholesterol_100g', ' mg / 100g'),
    carbs: nutrientValue(nutriments, 'carbohydrates_serving', ' g') ?? nutrientValue(nutriments, 'carbohydrates_100g', ' g / 100g'),
    sugars: nutrientValue(nutriments, 'sugars_serving', ' g') ?? nutrientValue(nutriments, 'sugars_100g', ' g / 100g'),
    fiber: nutrientValue(nutriments, 'fiber_serving', ' g') ?? nutrientValue(nutriments, 'fiber_100g', ' g / 100g'),
    protein: nutrientValue(nutriments, 'proteins_serving', ' g') ?? nutrientValue(nutriments, 'proteins_100g', ' g / 100g'),
    sodium: nutrientValue(nutriments, 'sodium_serving', ' mg') ?? nutrientValue(nutriments, 'sodium_100g', ' mg / 100g'),
    calcium: nutrientValue(nutriments, 'calcium_serving', ' mg') ?? nutrientValue(nutriments, 'calcium_100g', ' mg / 100g'),
    iron: nutrientValue(nutriments, 'iron_serving', ' mg') ?? nutrientValue(nutriments, 'iron_100g', ' mg / 100g'),
    potassium: nutrientValue(nutriments, 'potassium_serving', ' mg') ?? nutrientValue(nutriments, 'potassium_100g', ' mg / 100g'),
    servingSize: product?.serving_size || undefined,
    nutriScore: product?.nutriscore_grade ?? null,
  };

  return {
    query,
    name: withoutBrandPrefix(product?.product_name || product?.generic_name || query, product?.brands),
    brand: cleanText(product?.brands) || null,
    productSize: cleanText(product?.quantity) || cleanText(product?.serving_size) || null,
    imageUrl: product?.image_front_url || product?.image_url || null,
    ingredients: product?.ingredients_text_en || product?.ingredients_text || null,
    calories: calories || null,
    nutrition,
    allergens: normalizeTags(product?.allergens_tags),
    labels: normalizeTags(product?.labels_tags),
    source: 'Open Food Facts',
    categoryText: normalizeTags(product?.categories_tags).join(' '),
  };
}

function hasRealProductIdentity(product) {
  return Boolean(cleanText(product?.name) && cleanText(product?.brand));
}

function hasProductLabelData(product) {
  const nutrition = product?.nutrition ?? {};
  return Boolean(
    cleanText(product?.ingredients)
    || cleanText(product?.calories)
    || cleanText(nutrition.calories)
    || cleanText(nutrition.servingSize)
    || cleanText(nutrition.protein)
    || cleanText(nutrition.fat)
    || cleanText(nutrition.carbs)
  );
}

function hasUsableProductImage(product) {
  return /^https?:\/\//i.test(cleanText(product?.imageUrl));
}

function isUsableProductCandidate(product) {
  return Boolean(
    product
    && hasRealProductIdentity(product)
    && hasUsableProductImage(product)
    && hasProductLabelData(product)
    && product.source !== 'fallback'
  );
}

function productSearchText(product) {
  return normalizeCachePart([product?.brand, product?.name, product?.productSize, product?.categoryText].filter(Boolean).join(' '));
}

function productIdentityText(product) {
  return normalizeCachePart([product?.brand, product?.name, product?.productSize].filter(Boolean).join(' '));
}

function isRelevantProductCandidate(product, searchQuery, originalSearchQuery = searchQuery) {
  const query = normalizeSearchTokens(productDetailQuery(searchQuery)).join(' ');
  const originalQuery = normalizeSearchTokens(productDetailQuery(originalSearchQuery)).join(' ');
  const rawText = normalizeCachePart(productSearchText(product));
  const textTokens = normalizeSearchTokens(rawText);
  const text = textTokens.join(' ');
  const identityTokens = normalizeSearchTokens(productIdentityText(product));
  if (!query || !text) return false;
  if (originalQuery.includes('with pulp') && /\b(no pulp|pulp free|sans pulpe)\b/.test(rawText)) return false;
  if (isObviousCatalogMismatch(originalQuery, productIdentityText(product))) return false;

  if (query.includes('israeli') && query.includes('feta')) {
    return tokenMatches(identityTokens, 'israeli') && tokenMatches(identityTokens, 'feta');
  }

  const tokens = query
    .split(/\s+/)
    .filter(token => token.length > 2 && !['with', 'and', 'the', 'for'].includes(token));
  const originalCoreTokens = normalizeSearchTokens(originalQuery)
    .filter(token => token.length > 2 && !PRODUCT_SEARCH_MODIFIERS.has(token))
    .filter(token => !(originalQuery.includes('with pulp') && token === 'pulp'));
  if (originalCoreTokens.length > 0 && !originalCoreTokens.every(token => tokenMatches(identityTokens, token))) {
    return false;
  }
  if (text.includes(query) && query.includes(' ')) return true;
  if (tokens.length === 0) return true;
  return tokens.every(token => tokenMatches(textTokens, token));
}

function isObviousCatalogMismatch(originalQuery, identityText) {
  if (originalQuery === 'milk' && /\b(chocolate|candy|cookie|biscuit|snack|kinder|milky)\b/.test(identityText)) {
    return true;
  }
  if ((originalQuery === 'egg' || originalQuery === 'eggs') && /\b(candy|chocolate|cadbury|creme)\b/.test(identityText)) {
    return true;
  }
  if ((originalQuery === 'carrot' || originalQuery === 'carrots') && /\b(tuna|salad|soup|juice|pouch|smoothie)\b/.test(identityText)) {
    return true;
  }
  return false;
}

function tokenMatches(tokens, expected) {
  return tokens.some(token => (
    token === expected
    || (expected.length >= 5 && token.startsWith(expected))
    || (expected.length >= 5 && expected.startsWith(token))
  ));
}

function normalizeSearchTokens(value) {
  return normalizeForSearch(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularizeToken);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags
      .map(tag => String(tag).replace(/^en:/, '').replace(/-/g, ' '))
      .filter(Boolean)
      .slice(0, 8);
  }
  return String(tags || '')
    .split(',')
    .map(tag => tag.replace(/^en:/, '').replace(/-/g, ' '))
    .filter(Boolean)
    .slice(0, 8);
}

function buildOpenFoodFactsTerms(searchQuery) {
  const query = productDetailQuery(searchQuery);
  const normalized = normalizeForSearch(query);
  const terms = [];
  const tokens = normalized.split(/[^a-z0-9]+/).filter(token => token.length > 2);
  const coreTokens = tokens.filter(token => !PRODUCT_SEARCH_MODIFIERS.has(token));
  const tokenSets = [
    tokens,
    coreTokens,
    withoutTerminalPackaging(coreTokens),
  ].filter(set => set.length > 0);

  tokenSets.forEach(set => {
    terms.push(set.join(' '));
    contiguousPhrases(set).forEach(term => terms.push(term));
    set.forEach(token => terms.push(token, pluralizeToken(token), singularizeToken(token)));
  });

  if (coreTokens.includes('orange') && coreTokens.includes('juice')) {
    terms.unshift('orange juice');
  }

  return [...new Set(terms.map(cleanText).filter(Boolean))]
    .filter(term => term.length > 1)
    .slice(0, 16);
}

function contiguousPhrases(tokens) {
  const phrases = [];
  for (let size = Math.min(4, tokens.length); size >= 2; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      phrases.push(tokens.slice(index, index + size).join(' '));
    }
  }
  return phrases;
}

function withoutTerminalPackaging(tokens) {
  const next = [...tokens];
  while (next.length > 1 && PRODUCT_PACKAGING_WORDS.has(next[next.length - 1])) {
    next.pop();
  }
  return next;
}

function singularizeToken(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function pluralizeToken(token) {
  if (token.endsWith('y')) return `${token.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(token)) return `${token}es`;
  return `${token}s`;
}

const PRODUCT_SEARCH_MODIFIERS = new Set([
  'norwegian',
  'italian',
  'israeli',
  'style',
  'creme',
  'with',
  'without',
  'organic',
  'natural',
  'fresh',
  'large',
  'small',
  'low',
  'fat',
  'free',
  'sliced',
  'shredded',
]);

const PRODUCT_PACKAGING_WORDS = new Set([
  'bag',
  'box',
  'bottle',
  'can',
  'carton',
  'container',
  'cup',
  'cups',
  'dozen',
  'jar',
  'jug',
  'pack',
  'package',
  'pouch',
  'tin',
  'tub',
]);

async function searchOpenFoodFactsProducts(searchQuery, limit = 6, timeoutMs = 1200, allowCoreFallback = true, originalSearchQuery = searchQuery) {
  const cacheKey = `candidates:${normalizeCachePart(originalSearchQuery)}:${normalizeCachePart(searchQuery)}:${limit}`;
  const cached = getCachedProductCandidates(cacheKey);
  if (cached) return cached;

  const seen = new Set();
  const candidates = [];
  const terms = buildOpenFoodFactsTerms(searchQuery);
  const perTermLimit = Math.max(limit, 8);
  const deadline = Date.now() + timeoutMs;

  for (const term of terms) {
    if (Date.now() >= deadline || candidates.length >= limit) break;
    try {
      const remainingMs = Math.max(250, deadline - Date.now());
      const data = await fetchOpenFoodFactsSearch(term, perTermLimit, remainingMs);
      for (const product of data.products ?? []) {
        const details = mapOpenFoodFactsProduct(product, term);
        const key = normalizeCachePart(`${details.brand || ''}|${details.name}|${details.productSize || ''}`);
        if (!isUsableProductCandidate(details) || !isRelevantProductCandidate(details, term, originalSearchQuery) || seen.has(key)) continue;
        seen.add(key);
        candidates.push(details);
        setCachedProductDetails(normalizeCachePart([details.brand, details.name].filter(Boolean).join(' ')), details);
        setCachedProductDetails(normalizeCachePart(details.query), details);
        if (candidates.length >= limit) break;
      }
    } catch (err) {
      if (err.message !== 'timeout') {
        console.error('product candidates fetch error:', err.message);
      }
    }
  }

  if (candidates.length > 0) {
    setCachedProductCandidates(cacheKey, candidates);
  }
  if (candidates.length === 0 && allowCoreFallback) {
    const fallbackQuery = buildOpenFoodFactsTerms(searchQuery).find(term => normalizeCachePart(term) !== normalizeCachePart(searchQuery));
    if (fallbackQuery && normalizeCachePart(fallbackQuery) !== normalizeCachePart(searchQuery)) {
      return searchOpenFoodFactsProducts(fallbackQuery, limit, Math.max(600, timeoutMs), false, originalSearchQuery);
    }
  }
  return candidates;
}

async function fetchOpenFoodFactsSearch(term, limit, timeoutMs) {
  const cgiParams = new URLSearchParams({
    search_terms: term,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(limit),
    sort_by: 'unique_scans_n',
  });
  const apiParams = new URLSearchParams({
    search_terms: term,
    page_size: String(limit),
    sort_by: 'unique_scans_n',
    fields: [
      'product_name',
      'generic_name',
      'brands',
      'quantity',
      'serving_size',
      'image_front_url',
      'image_url',
      'ingredients_text_en',
      'ingredients_text',
      'nutriments',
      'allergens_tags',
      'labels_tags',
      'categories_tags',
      'url',
      'nutriscore_grade',
    ].join(','),
  });
  const urls = [
    `https://world.openfoodfacts.org/api/v2/search?${apiParams}`,
    `https://world.openfoodfacts.org/cgi/search.pl?${cgiParams}`,
    `https://us.openfoodfacts.org/api/v2/search?${apiParams}`,
    `https://us.openfoodfacts.org/cgi/search.pl?${cgiParams}`,
  ];
  let lastError = null;
  const seen = new Set();
  const products = [];

  for (const url of urls) {
    try {
      const resp = await withTimeout(fetch(url, {
        headers: { 'User-Agent': 'Chifufu/1.0 (contact@chifufu.com)' },
      }), timeoutMs);
      if (!resp.ok) {
        lastError = new Error(`Open Food Facts ${new URL(url).host} ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      for (const product of data.products ?? []) {
        const key = normalizeCachePart([product.code, product.brands, product.product_name, product.quantity].filter(Boolean).join('|'));
        if (!key || seen.has(key)) continue;
        seen.add(key);
        products.push(product);
        if (products.length >= limit) return { products };
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (products.length > 0) return { products };
  throw lastError ?? new Error('Open Food Facts search failed');
}

async function fetchProductDetails(searchQuery, timeoutMs = 1200) {
  const query = productDetailQuery(searchQuery);
  const cacheKey = normalizeCachePart(query);
  const cached = getCachedProductDetails(cacheKey);
  if (cached) return cached;

  try {
    const candidates = await searchOpenFoodFactsProducts(query, 3, timeoutMs);
    const details = candidates[0];
    if (isUsableProductCandidate(details)) {
      setCachedProductDetails(cacheKey, details);
      return details;
    }
    const relaxedDetails = await fetchRelaxedProductDetails(query, timeoutMs);
    if (relaxedDetails) {
      setCachedProductDetails(cacheKey, relaxedDetails);
      return relaxedDetails;
    }
    return null;
  } catch (err) {
    if (err.message !== 'timeout') {
      console.error('product details fetch error:', err.message);
    }
    return null;
  }
}

async function fetchRelaxedProductDetails(query, timeoutMs) {
  const terms = buildOpenFoodFactsTerms(query);
  const deadline = Date.now() + timeoutMs;

  for (const term of [...new Set(terms.map(cleanText).filter(Boolean))]) {
    if (Date.now() >= deadline) break;
    try {
      const data = await fetchOpenFoodFactsSearch(term, 8, Math.max(300, deadline - Date.now()));
      for (const product of data.products ?? []) {
        const details = mapOpenFoodFactsProduct(product, term);
        if (isUsableProductCandidate(details)) return details;
      }
    } catch (err) {
      if (err.message !== 'timeout') {
        console.error('relaxed product details fetch error:', err.message);
      }
    }
  }

  return null;
}

function buildCatalogResults({ searchQuery, productCandidates }) {
  return (productCandidates ?? [])
    .filter(isUsableProductCandidate)
    .map((product, index) => {
      const detailQuery = [product.brand, product.name].filter(Boolean).join(' ') || product.query || searchQuery;
      return {
        id: `catalog-${index}-${normalizeCachePart(detailQuery).replace(/[^a-z0-9]+/g, '-')}`,
        name: 'Product information',
        description: product.name,
        brand: product.brand || null,
        productSize: product.productSize || null,
        price: null,
        priceValue: null,
        distance: '',
        badges: ['product info'],
        address: '',
        imageUrl: product.imageUrl ?? null,
        ingredients: product.ingredients ?? null,
        calories: product.calories ?? null,
        nutrition: product.nutrition ?? null,
        detailQuery,
        source: product.source || 'Open Food Facts',
        isLivePrice: false,
      };
    });
}

async function searchKrogerPricedResults({ searchQuery, lat, lng, radiusMiles = 15, limit = 12 }) {
  if (!lat || !lng) return [];
  const stores = await findNearestStore(Number(lat), Number(lng), radiusMiles);
  if (!Array.isArray(stores) || stores.length === 0) return [];

  const rows = [];
  const storeSearches = stores.slice(0, 6).map(async (store) => {
    const products = await searchProducts(searchQuery, store.locationId, limit);
    return products.slice(0, 5).map(product => {
      const distance = (Number.isFinite(store.lat) && Number.isFinite(store.lng))
        ? `${(haversine(Number(lat), Number(lng), Number(store.lat), Number(store.lng)) * 0.621).toFixed(1)} mi`
        : '';
      return {
        id: `kroger-${store.locationId}-${product.id}`,
        name: store.name || store.chain || 'Kroger-family store',
        description: product.name,
        brand: product.brand || null,
        productSize: product.size || null,
        price: product.price,
        priceValue: product.priceValue,
        regularPrice: product.regularPrice,
        relevanceRank: product.relevanceRank ?? 100,
        distance,
        badges: product.badges ?? [],
        address: store.address || '',
        imageUrl: product.imageUrl ?? null,
        ingredients: null,
        calories: null,
        nutrition: null,
        detailQuery: [product.brand, product.name].filter(Boolean).join(' ') || product.name,
        lat: store.lat,
        lng: store.lng,
        source: 'Kroger',
        isLivePrice: true,
      };
    });
  });

  const settled = await Promise.allSettled(storeSearches);
  settled.forEach(result => {
    if (result.status === 'fulfilled') rows.push(...result.value);
  });

  return rows
    .filter(row => row.priceValue != null && hasRealProductIdentity(row) && hasUsableProductImage(row))
    .sort((a, b) => a.relevanceRank - b.relevanceRank || a.priceValue - b.priceValue)
    .slice(0, limit);
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
      total += (item.priceValue ?? 0) * (item.quantity ?? 1);
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

// ── Product details: image, ingredients, nutrition ─────────────
app.get('/api/product/details', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });

  const details = await fetchProductDetails(String(q), 3500);
  if (!details) {
    return res.status(404).json({ error: 'Product details not found' });
  }
  res.json(details);
});

app.get('/', (_req, res) => res.json({ name: 'Chifufu API', status: 'ok', version: '2.0' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Main results endpoint ──────────────────────────────────────
app.post('/api/results', async (req, res) => {
  const { location, category, searchQuery, lat, lng } = req.body ?? {};
  if (!location || !category) {
    return res.status(400).json({ error: 'location and category are required' });
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
  const generation = Promise.all([
    searchKrogerPricedResults({ searchQuery, lat, lng, limit: 10 }).catch(err => {
      console.error('priced provider error:', err.message);
      return [];
    }),
    searchOpenFoodFactsProducts(searchQuery, 12, 4500),
  ]).then(async ([pricedItems, productCandidates]) => {
    const pricedDetailQueries = new Set(pricedItems.map(item => normalizeCachePart(item.detailQuery)));
    const catalogItems = buildCatalogResults({ searchQuery, productCandidates })
      .filter(item => !pricedDetailQueries.has(normalizeCachePart(item.detailQuery)));
    let items = [...pricedItems, ...catalogItems].slice(0, 20);
    if (items.length === 0) {
      const details = await fetchProductDetails(searchQuery, 3500);
      const relevantDetails = details && isRelevantProductCandidate(details, searchQuery, searchQuery)
        ? [details]
        : [];
      items = buildCatalogResults({ searchQuery, productCandidates: relevantDetails });
    }
    if (items.length > 0) {
      setCachedResults(cacheKey, items);
    }
    return items;
  });
  pendingResults.set(cacheKey, generation);
  try {
    const items = await generation;
    res.set('X-Chifufu-Source', 'providers');
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
