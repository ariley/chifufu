const Fuse = require('fuse.js');

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
async function searchProducts(query, locationId, limit = 20, queryPlan = null) {
  const token = await getToken();
  const searchLimit = Math.max(limit, 50);

  for (const term of buildSearchTerms(query, queryPlan)) {
    const products = await fetchProductsForTerm(token, term, locationId, searchLimit, query, queryPlan);
    if (products.length > 0) return products;
  }

  return [];
}

async function fetchProductsForTerm(token, term, locationId, limit, originalQuery = term, queryPlan = null) {
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

  return rankProductMatches(pricedProducts, term, originalQuery, queryPlan);
}

module.exports = { findNearestStore, searchProducts };

function productMatchesQuery(query, originalQuery = query, queryPlan = null) {
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
    const normalizedOriginalQuery = normalizeForSearch(originalQuery);
    const requiredDescriptors = getRequiredDescriptorTokens(normalizedOriginalQuery);
    if (normalizedOriginalQuery.includes('with pulp') && /\b(no pulp|pulp free|sans pulpe)\b/.test(productText)) {
      return false;
    }
    if (!matchesQueryPlan(productText, queryPlan)) return false;
    if (requiredDescriptors.length > 0 && !requiredDescriptors.every(token => productHasDescriptor(productText, token))) {
      return false;
    }
    if (normalizedOriginalQuery === 'milk' && /\b(milk-bone|milk dud|candy|chocolate|cookie|biscuit|dog|snack|bone|kinder|milky)\b/.test(productText)) {
      return false;
    }
    if ((normalizedOriginalQuery === 'egg' || normalizedOriginalQuery === 'eggs') && /\b(candy|chocolate|cadbury|creme)\b/.test(productText)) {
      return false;
    }
    if ((normalizedOriginalQuery === 'carrot' || normalizedOriginalQuery === 'carrots') && /\b(tuna|salad|soup|juice|pouch|smoothie)\b/.test(productText)) {
      return false;
    }
    const rawHaystackTokens = new Set(productText
      .split(/[^a-z0-9]+/)
      .filter(Boolean));
    const haystackTokens = new Set([...rawHaystackTokens]
      .map(token => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));
    const originalCoreTokens = normalizeForSearch(originalQuery)
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 2 && !GENERIC_PRODUCT_MODIFIERS.has(token))
      .filter(token => !requiredDescriptors.includes(token))
      .filter(token => !(normalizedOriginalQuery.includes('with pulp') && token === 'pulp'))
      .map(singularizeToken);

    if (originalCoreTokens.length > 0 && !originalCoreTokens.every(token => haystackTokens.has(token))) {
      return false;
    }

    return tokens.every((token, index) => {
      const rawToken = rawTokens[index];
      if (rawToken.length > 3 && rawToken.endsWith('s')) {
        return rawHaystackTokens.has(rawToken);
      }
      return haystackTokens.has(token);
    });
  };
}

function rankProductMatches(products, query, originalQuery = query, queryPlan = null) {
  const candidates = products.filter(productMatchesQuery(query, originalQuery, queryPlan));
  if (candidates.length < 2) return candidates;

  const fuse = new Fuse(candidates, {
    includeScore: true,
    ignoreLocation: true,
    ignoreFieldNorm: true,
    threshold: 0.4,
    minMatchCharLength: 2,
    keys: [
      { name: 'name', weight: 0.58 },
      { name: 'brand', weight: 0.24 },
      { name: 'size', weight: 0.12 },
      { name: 'badges', weight: 0.06 },
    ],
  });
  const scores = new Map(fuse.search(buildFuseProductQuery(originalQuery, query, queryPlan)).map(result => [result.item.id, result.score ?? 1]));
  if (scores.size === 0) return candidates;

  return candidates
    .map((product, index) => ({ product, index, searchScore: scores.get(product.id) ?? 1 }))
    .sort((a, b) => (
      a.searchScore - b.searchScore
      || a.product.relevanceRank - b.product.relevanceRank
      || a.product.priceValue - b.product.priceValue
      || a.index - b.index
    ))
    .map(entry => entry.product);
}

function buildFuseProductQuery(originalQuery, fallbackQuery, queryPlan = null) {
  return normalizeForSearch(queryPlan?.canonicalQuery || originalQuery || fallbackQuery)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2 && !['with', 'and', 'the', 'for'].includes(token))
    .join(' ')
    || normalizeForSearch(fallbackQuery);
}

function buildSearchTerms(query, queryPlan = null) {
  const plannedTerms = Array.isArray(queryPlan?.searchTerms) ? queryPlan.searchTerms : [];
  if (plannedTerms.length > 0) {
    return [...new Set([
      ...plannedTerms.map(normalizeForSearch),
      normalizeForSearch(query),
      ...buildTokenSearchTerms(query),
    ].filter(Boolean))].slice(0, 20);
  }
  return buildTokenSearchTerms(query);
}

function buildTokenSearchTerms(query) {
  const normalizedQuery = stripStoreSearchTerms(query);
  const tokens = normalizedQuery
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2);
  const terms = [];
  const requiredDescriptors = getRequiredDescriptorTokens(normalizedQuery);

  if (requiredDescriptors.length > 0) {
    terms.push(normalizedQuery);
    requiredDescriptors.forEach(token => {
      const aliases = STRICT_DESCRIPTOR_ALIASES[token] ?? [];
      aliases.forEach(alias => terms.push(alias));
      contiguousPhrases(tokens).filter(term => term.includes(token)).forEach(term => terms.push(term));
    });
    return [...new Set(terms.filter(Boolean))].slice(0, 10);
  }

  const coreTokens = tokens.filter(token => !GENERIC_PRODUCT_MODIFIERS.has(token));
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

  return [...new Set(terms.filter(Boolean))].slice(0, 16);
}

function matchesQueryPlan(productText, queryPlan) {
  if (!queryPlan) return true;
  const text = normalizeForSearch(productText);
  const textTokens = new Set(text.split(/[^a-z0-9]+/).filter(Boolean).map(singularizeToken));
  const excludedTerms = Array.isArray(queryPlan.excludedTerms) ? queryPlan.excludedTerms : [];
  if (excludedTerms.some(term => term && text.includes(normalizeForSearch(term)))) return false;

  const requiredTerms = (Array.isArray(queryPlan.requiredTerms) ? queryPlan.requiredTerms : [])
    .map(normalizeForSearch)
    .filter(term => term.length > 2 && !GENERIC_PRODUCT_MODIFIERS.has(term));
  if (requiredTerms.length === 0) return true;
  return requiredTerms.every(term => {
    const termTokens = term.split(/[^a-z0-9]+/).filter(Boolean).map(singularizeToken);
    return termTokens.every(token => (
      textTokens.has(token)
      || [...textTokens].some(textToken => token.length >= 5 && (textToken.startsWith(token) || token.startsWith(textToken)))
    ));
  });
}

function stripStoreSearchTerms(query) {
  let next = ` ${normalizeForSearch(query)} `;
  for (const pattern of STORE_SEARCH_PATTERNS) {
    next = next.replace(pattern, ' ');
  }
  return next.replace(/\s+/g, ' ').trim() || normalizeForSearch(query);
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
  'whole',
  'low',
  'fat',
  'free',
]);

const STRICT_DESCRIPTOR_ALIASES = {};

function getRequiredDescriptorTokens(query) {
  const tokenSet = new Set(normalizeForSearch(query).split(/[^a-z0-9]+/).filter(Boolean));
  return Object.keys(STRICT_DESCRIPTOR_ALIASES).filter(token => tokenSet.has(token));
}

function productHasDescriptor(productText, token) {
  if (new RegExp(`\\b${token}\\b`).test(productText)) return true;
  return (STRICT_DESCRIPTOR_ALIASES[token] ?? [])
    .some(alias => new RegExp(`\\b${normalizeForSearch(alias).replace(/\s+/g, '\\s+')}\\b`).test(productText));
}

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

const STORE_SEARCH_PATTERNS = [
  /\bgrocery\s+outlet\b/g,
  /\bbargain\s+market\b/g,
  /\bfoods?\s*co\b/g,
  /\bfood\s*4\s*less\b/g,
  /\bkroger\b/g,
  /\bsafeway\b/g,
  /\bwhole\s+foods?\b/g,
  /\btrader\s+joe'?s\b/g,
  /\bcostco\b/g,
  /\bwinco\b/g,
  /\bsprouts\b/g,
  /\bwalmart\b/g,
  /\btarget\b/g,
  /\baldi\b/g,
  /\bpublix\b/g,
  /\bshoprite\b/g,
  /\bheb\b/g,
  /\bh-?e-?b\b/g,
  /\bmeijer\b/g,
  /\bwegmans\b/g,
  /\bgiant\b/g,
];

function normalizeForSearch(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bcreme\b/gi, 'cream')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
