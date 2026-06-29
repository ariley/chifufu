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
const RESULTS_CACHE_VERSION = 'products-v4-real-labels';
const RESULTS_CACHE_TTL_MS = 15 * 60 * 1000;
const PRODUCT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const resultsCache = new Map();
const productDetailsCache = new Map();
const productCandidatesCache = new Map();
const pendingResults = new Map();
const backgroundRefreshes = new Map();

function normalizeCachePart(value) {
  return String(value ?? '').trim().toLowerCase();
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

const QUERY_PRICE_HINTS = [
  { pattern: /\beggs?\b/i, name: 'eggs', size: 'dozen', base: 3.49 },
  { pattern: /\bmilk\b/i, name: 'milk', size: 'half gallon', base: 3.29 },
  { pattern: /\bbread\b/i, name: 'bread', size: 'loaf', base: 3.19 },
  { pattern: /\bchicken\b/i, name: 'chicken', size: 'per lb', base: 4.49 },
  { pattern: /\bfeta\b/i, name: 'feta', size: '8 oz', base: 5.99 },
  { pattern: /\bprovolone\b/i, name: 'provolone', size: '8 oz', base: 5.49 },
  { pattern: /\bcream cheese\b/i, name: 'cream cheese', size: '8 oz', base: 4.29 },
  { pattern: /\bcheese\b/i, name: 'cheese', size: '8 oz', base: 4.99 },
  { pattern: /\bavocados?\b/i, name: 'avocados', size: 'each', base: 1.49 },
  { pattern: /\bpasta\b/i, name: 'pasta', size: '1 lb', base: 1.99 },
  { pattern: /\brice\b/i, name: 'rice', size: '2 lb', base: 3.49 },
  { pattern: /\bcoffee\b/i, name: 'coffee', size: '12 oz', base: 8.99 },
];

function getPriceHint(searchQuery) {
  const query = String(searchQuery || '').trim();
  return QUERY_PRICE_HINTS.find(hint => hint.pattern.test(query)) ?? {
    name: query || 'grocery item',
    size: 'typical package',
    base: 4.99,
  };
}

function productDetailQuery(searchQuery) {
  const query = String(searchQuery || '').trim();
  return query || getPriceHint(searchQuery).name;
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
    productUrl: product?.url || null,
    source: 'Open Food Facts',
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

const PRODUCT_QUERY_ALIASES = new Map([
  ['norwegian cream cheese', ['snofrisk', 'snofrisk cream cheese', 'tine cream cheese', 'tine']],
  ['italian provolone cheese', ['italian provolone', 'provolone cheese', 'provolone']],
  ['italian provolone', ['italian provolone cheese', 'provolone cheese', 'provolone']],
  ['eggs', ['dozen eggs', 'large eggs', 'organic brown eggs']],
  ['orange juice with pulp', ['orange juice with pulp', 'medium pulp orange juice', 'with pulp orange juice']],
]);

const CURATED_PRODUCT_CANDIDATES = [
  {
    patterns: [/norwegian cream cheese/i, /snofrisk/i, /snøfrisk/i],
    products: [
      {
        query: 'TINE Snofrisk fresh spreadable cream cheese',
        name: 'Snofrisk Fresh Spreadable Cheese',
        brand: 'TINE',
        productSize: '4.4 oz',
        imageUrl: 'https://www.instacart.com/assets/domains/product-image/file/large_5fdbb4a0-fc31-4968-b555-ba6ad994267a.png',
        ingredients: "Goat's milk, cow's cream, salt, bacterial culture.",
        calories: '70 kcal',
        nutrition: {
          calories: '70 kcal',
          fat: '7 g',
          sugars: '1 g',
          protein: '2 g',
          servingSize: '1 oz',
        },
        productUrl: 'https://order.earthfare.com/store/earth-fare-market/products/115845-snofrisk-fresh-spreadable-cream-cheese-4-4-oz',
        source: 'Earth Fare',
      },
      {
        query: 'TINE Norwegian Cream Cheese Plain',
        name: 'Norwegian Cream Cheese Plain',
        brand: 'TINE',
        productSize: '125 g',
        imageUrl: 'https://www.tine.com/products/tine-cream-cheese/cream-cheese-natural/_/image/dffb90a7-f9c7-430a-8f36-97d278ed0996%3A7547567bdc18554e0b33fe7fe8a70faab511c7f3/width-460/TWN_Cream%20Cheese%20Naturell.png?quality=60',
        ingredients: "Pasteurized goat's milk, pasteurized cream from cow's milk, salt, bacterial culture.",
        calories: '243 kcal / 100g',
        nutrition: {
          calories: '243 kcal / 100g',
          fat: '23 g / 100g',
          carbs: '2.9 g / 100g',
          sugars: '2.6 g / 100g',
          sodium: '520 mg / 100g',
          protein: '6.6 g / 100g',
          servingSize: '100 g',
        },
        productUrl: 'https://www.tine.com/products/tine-cream-cheese/cream-cheese-natural',
        source: 'TINE',
      },
    ],
  },
  {
    patterns: [/israeli feta/i, /feta cheese in brine/i],
    products: [
      {
        query: "Trader Joe's Israeli Feta Cheese in Brine",
        name: 'Israeli Feta Cheese in Brine',
        brand: "Trader Joe's",
        productSize: '6 oz',
        imageUrl: 'https://fig-product-images.s3.amazonaws.com/00630825.webp',
        ingredients: "Pasteurized sheep's milk, sea salt, microbial rennet, lactic cultures.",
        calories: '60 kcal',
        nutrition: {
          calories: '60 kcal',
          fat: '4.5 g',
          saturatedFat: '3 g',
          transFat: '0 g',
          cholesterol: '15 mg',
          sodium: '320 mg',
          carbs: '1 g',
          sugars: '0 g',
          protein: '5 g',
          calcium: '60 mg',
          iron: '0.1 mg',
          servingSize: '1 oz',
        },
        allergens: ['milk'],
        labels: ['vegetarian'],
        productUrl: 'https://foodisgood.com/product/trader-joes-israeli-feta-in-brine/',
        source: 'Fig / product label',
      },
    ],
  },
  {
    patterns: [/\beggs?\b/i, /\bdozen eggs?\b/i],
    products: [
      {
        query: "Trader Joe's Organic Grade A Large Brown Eggs",
        name: 'Organic Grade A Large Brown Eggs',
        brand: "Trader Joe's",
        productSize: '27 oz (1 lb 11 oz) 765 g',
        imageUrl: 'https://images.openfoodfacts.org/images/products/000/000/081/5659/front_en.3.400.jpg',
        ingredients: null,
        calories: '70 kcal',
        nutrition: {
          calories: '70 kcal',
          fat: '5 g',
          saturatedFat: '1.5 g',
          transFat: '0 g',
          cholesterol: '185 mg',
          carbs: '0 g',
          sugars: '0 g',
          fiber: '0 g',
          protein: '6 g',
          sodium: '70 mg',
          calcium: '30 mg',
          iron: '0.9 mg',
          potassium: '70 mg',
          servingSize: '1 egg (50 g)',
        },
        allergens: ['egg'],
        labels: ['organic', 'usda organic'],
        productUrl: 'https://world.openfoodfacts.org/product/0000000815659',
        source: 'Open Food Facts',
      },
      {
        query: 'Lucerne Jumbo One Dozen Eggs',
        name: 'Jumbo One Dozen Eggs',
        brand: 'Lucerne',
        productSize: '1 egg (63 g)',
        imageUrl: 'https://images.openfoodfacts.org/images/products/002/113/003/0002/front_en.7.400.jpg',
        ingredients: null,
        calories: '90 kcal',
        nutrition: {
          calories: '90 kcal',
          fat: '6 g',
          saturatedFat: '2 g',
          transFat: '0 g',
          cholesterol: '235 mg',
          carbs: '0 g',
          sugars: '0 g',
          protein: '8 g',
          sodium: '91.5 mg',
          calcium: '39.7 mg',
          iron: '1.1 mg',
          potassium: '85.1 mg',
          servingSize: '1 egg (63 g)',
        },
        allergens: ['egg'],
        labels: [],
        productUrl: 'https://world.openfoodfacts.org/product/0021130030002',
        source: 'Open Food Facts',
      },
      {
        query: 'True Goodness Organic Pasture Raised Eggs Dozen',
        name: 'Organic Pasture Raised Eggs Dozen',
        brand: 'True Goodness',
        productSize: '12 eggs',
        imageUrl: 'https://images.openfoodfacts.org/images/products/076/023/614/0849/front_en.3.400.jpg',
        ingredients: null,
        calories: '70 kcal',
        nutrition: {
          calories: '70 kcal',
          fat: '5 g',
          saturatedFat: '1.5 g',
          cholesterol: '185 mg',
          carbs: '0 g',
          protein: '6 g',
          sodium: '70 mg',
          servingSize: '1 egg (50 g)',
        },
        allergens: ['egg'],
        labels: ['organic', 'usda organic'],
        productUrl: 'https://world.openfoodfacts.org/product/0760236140849',
        source: 'Open Food Facts',
      },
    ],
  },
  {
    patterns: [/orange juice/i, /\bwith pulp\b/i, /\bpulp orange\b/i],
    products: [
      {
        query: 'Simply Orange Medium Pulp With Calcium And Vitamin D',
        name: 'Medium Pulp With Calcium And Vitamin D',
        brand: 'Simply Orange',
        productSize: '52 fl oz',
        imageUrl: 'https://images.openfoodfacts.org/images/products/002/500/004/4830/front_en.18.400.jpg',
        ingredients: 'Contains orange juice, less than 1% of: calcium phosphate and calcium lactate (calcium sources), vitamin D3.',
        calories: '110 kcal',
        nutrition: {
          calories: '110 kcal',
          fat: '0 g',
          saturatedFat: '0 g',
          transFat: '0 g',
          cholesterol: '0 mg',
          carbs: '26 g',
          sugars: '23 g',
          protein: '2 g',
          sodium: '0 mg',
          calcium: '146 mg',
          potassium: '188 mg',
          servingSize: '240 ml',
        },
        allergens: [],
        labels: ['no gmos', 'no added sugar', 'non gmo project'],
        productUrl: 'https://world.openfoodfacts.org/product/0025000044830',
        source: 'Open Food Facts',
      },
      {
        query: "Florida's Natural With Pulp Orange Juice With Calcium And Vitamin D",
        name: 'With Pulp 100% Premium Orange Juice From Concentrate With Calcium & Vitamin D',
        brand: "Florida's Natural",
        productSize: '240 ml',
        imageUrl: 'https://images.openfoodfacts.org/images/products/001/630/016/8234/front_en.4.400.jpg',
        ingredients: 'Pasteurized orange juice, tri-calcium citrate (calcium source) and vitamin D3.',
        calories: '110 kcal',
        nutrition: {
          calories: '110 kcal',
          fat: '0 g',
          saturatedFat: '0 g',
          transFat: '0 g',
          cholesterol: '0 mg',
          carbs: '27 g',
          sugars: '24 g',
          fiber: '0 g',
          protein: '2 g',
          sodium: '4.2 mg',
          calcium: '146 mg',
          iron: '0.1 mg',
          servingSize: '240 ml',
        },
        allergens: [],
        labels: ['kosher', 'no gmos', 'non gmo project'],
        productUrl: 'https://world.openfoodfacts.org/product/0016300168234',
        source: 'Open Food Facts',
      },
      {
        query: 'Minute Maid Original Low Pulp Orange Juice With Calcium & Vitamin D',
        name: 'Original Low Pulp Orange Juice With Calcium & Vitamin D',
        brand: 'Minute Maid',
        productSize: '8 fl oz (240 ml)',
        imageUrl: 'https://images.openfoodfacts.org/images/products/002/500/004/7923/front_en.9.400.jpg',
        ingredients: '100% orange juice from concentrate with filtered water, premium concentrated orange juice, calcium phosphate and calcium lactate (calcium sources), vitamin D3.',
        calories: '110 kcal',
        nutrition: {
          calories: '110 kcal',
          fat: '0 g',
          saturatedFat: '0 g',
          carbs: '27 g',
          sugars: '24 g',
          protein: '2 g',
          sodium: '14.4 mg',
          calcium: '350 mg',
          potassium: '451 mg',
          servingSize: '8 fl oz (240 ml)',
        },
        allergens: [],
        labels: ['no gmos', 'non gmo project'],
        productUrl: 'https://world.openfoodfacts.org/product/0025000047923',
        source: 'Open Food Facts',
      },
    ],
  },
];

function getCuratedProductCandidates(searchQuery) {
  const query = String(searchQuery || '');
  return CURATED_PRODUCT_CANDIDATES
    .filter(group => group.patterns.some(pattern => pattern.test(query)))
    .flatMap(group => group.products);
}

function buildOpenFoodFactsTerms(searchQuery) {
  const query = productDetailQuery(searchQuery);
  const normalized = normalizeCachePart(query);
  const hint = getPriceHint(query);
  const terms = [];
  const aliases = PRODUCT_QUERY_ALIASES.get(normalized);
  if (aliases) terms.push(...aliases);
  terms.push(query);
  if (hint.name && normalizeCachePart(hint.name) !== normalized) {
    terms.push(hint.name);
  }
  return [...new Set(terms.map(cleanText).filter(Boolean))];
}

async function searchOpenFoodFactsProducts(searchQuery, limit = 6, timeoutMs = 1200) {
  const cacheKey = `candidates:${normalizeCachePart(searchQuery)}:${limit}`;
  const cached = getCachedProductCandidates(cacheKey);
  if (cached) return cached;

  const seen = new Set();
  const candidates = [];
  for (const product of getCuratedProductCandidates(searchQuery)) {
    const key = normalizeCachePart(`${product.brand || ''}|${product.name}|${product.productSize || ''}`);
    if (!seen.has(key)) {
      if (isUsableProductCandidate(product)) {
        seen.add(key);
        candidates.push(product);
        setCachedProductDetails(normalizeCachePart([product.brand, product.name].filter(Boolean).join(' ')), product);
        setCachedProductDetails(normalizeCachePart(product.query), product);
      }
    }
  }
  if (candidates.length >= 2) {
    setCachedProductCandidates(cacheKey, candidates.slice(0, limit));
    return candidates.slice(0, limit);
  }

  const terms = buildOpenFoodFactsTerms(searchQuery);
  const perTermLimit = Math.max(limit, 8);
  const deadline = Date.now() + timeoutMs;

  for (const term of terms) {
    if (Date.now() >= deadline || candidates.length >= limit) break;
    const params = new URLSearchParams({
      search_terms: term,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: String(perTermLimit),
      sort_by: 'unique_scans_n',
    });

    try {
      const remainingMs = Math.max(250, deadline - Date.now());
      const resp = await withTimeout(fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, {
        headers: { 'User-Agent': 'Chifufu/1.0 (contact@chifufu.com)' },
      }), remainingMs);
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const product of data.products ?? []) {
        const details = mapOpenFoodFactsProduct(product, term);
        const key = normalizeCachePart(`${details.brand || ''}|${details.name}|${details.productSize || ''}`);
        if (!isUsableProductCandidate(details) || seen.has(key)) continue;
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

  setCachedProductCandidates(cacheKey, candidates);
  return candidates;
}

async function fetchProductDetails(searchQuery, timeoutMs = 1200) {
  const query = productDetailQuery(searchQuery);
  const cacheKey = normalizeCachePart(query);
  const cached = getCachedProductDetails(cacheKey);
  if (cached) return cached;

  const curated = getCuratedProductCandidates(query).find(product => {
    const text = normalizeCachePart([product.brand, product.name, product.query].filter(Boolean).join(' '));
    return text.includes(cacheKey) || cacheKey.includes(normalizeCachePart(product.name));
  });
  if (isUsableProductCandidate(curated)) {
    setCachedProductDetails(cacheKey, curated);
    return curated;
  }

  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '1',
    sort_by: 'unique_scans_n',
  });

  try {
    const resp = await withTimeout(fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, {
      headers: { 'User-Agent': 'Chifufu/1.0 (contact@chifufu.com)' },
    }), timeoutMs);
    if (!resp.ok) return null;
    const data = await resp.json();
    const product = data.products?.[0];
    if (!product) return null;
    const details = mapOpenFoodFactsProduct(product, query);
    if (!isUsableProductCandidate(details)) return null;
    setCachedProductDetails(cacheKey, details);
    return details;
  } catch (err) {
    if (err.message !== 'timeout') {
      console.error('product details fetch error:', err.message);
    }
    return null;
  }
}

function storePriceMultiplier(place, index) {
  const priceLevel = Number.isFinite(place.priceLevel) ? place.priceLevel : 1;
  const rating = Number.isFinite(place.rating) ? place.rating : 4;
  const distance = Number.parseFloat(place.distMi ?? '0') || 0;
  return 0.88 + (priceLevel * 0.08) + (index * 0.035) + Math.max(0, rating - 4) * 0.04 + Math.min(distance, 6) * 0.015;
}

function buildInstantResults({ location, category, searchQuery, places, productCandidates }) {
  const hint = getPriceHint(searchQuery);
  const usablePlaces = (places.length > 0 ? places : DEFAULT_STORES).slice(0, 8);
  const candidates = (productCandidates ?? []).filter(isUsableProductCandidate);
  if (candidates.length === 0) return [];
  const badgeFor = (place, index) => {
    const badges = [];
    if (index < 2) badges.push('deal');
    if (Number.parseFloat(place.distMi ?? '99') <= 1.5) badges.push('close');
    return badges.slice(0, 2);
  };

  return usablePlaces
    .map((place, index) => {
      const product = candidates[index % candidates.length];
      const priceValue = Math.max(0.79, hint.base * storePriceMultiplier(place, index));
      const rounded = Math.round(priceValue * 100) / 100;
      const detailQuery = [product.brand, product.name].filter(Boolean).join(' ') || product.query || searchQuery;
      return {
        id: `instant-${index}-${normalizeCachePart(place.name).replace(/[^a-z0-9]+/g, '-')}`,
        name: place.name,
        description: product.name || `${hint.name} (${hint.size})`,
        brand: product.brand || null,
        productSize: product.productSize || null,
        price: `$${rounded.toFixed(2)}`,
        priceValue: rounded,
        distance: place.distMi ? `${place.distMi} mi` : 'nearby',
        badges: badgeFor(place, index),
        address: place.address || location,
        imageUrl: product.imageUrl ?? null,
        ingredients: product.ingredients ?? null,
        calories: product.calories ?? null,
        nutrition: product.nutrition ?? null,
        productUrl: product.productUrl ?? null,
        detailQuery,
        lat: place.lat,
        lng: place.lng,
        rating: place.rating,
        source: 'instant',
      };
    })
    .sort((a, b) => a.priceValue - b.priceValue);
}

function refreshResultsInBackground(cacheKey, args) {
  if (!ANTHROPIC_API_KEY || backgroundRefreshes.has(cacheKey)) return;

  const refresh = generateResults(args)
    .then(items => {
      if (Array.isArray(items) && items.length > 0) {
        setCachedResults(cacheKey, items);
      }
    })
    .catch(err => {
      console.error('background results refresh error:', err.message);
    })
    .finally(() => {
      backgroundRefreshes.delete(cacheKey);
    });

  backgroundRefreshes.set(cacheKey, refresh);
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

// ── Product details: image, ingredients, nutrition ─────────────
app.get('/api/product/details', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });

  const details = await fetchProductDetails(String(q), 1800);
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
    resolvePlaces({ location, category, lat, lng }),
    searchOpenFoodFactsProducts(searchQuery, 6, 1100),
  ]).then(([places, productCandidates]) => {
    const items = buildInstantResults({ location, category, searchQuery, places, productCandidates });
    setCachedResults(cacheKey, items);
    refreshResultsInBackground(cacheKey, { location, category, searchQuery, places });
    return items;
  });
  pendingResults.set(cacheKey, generation);
  try {
    const items = await generation;
    res.set('X-Chifufu-Source', 'instant');
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
