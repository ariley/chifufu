const planCache = new Map();
const backgroundPlanRefreshes = new Map();
const PLAN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEMANTIC_PLAN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeForSearch(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bcreme\b/gi, 'cream')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function normalizeTokens(value) {
  return normalizeForSearch(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularizeToken);
}

function uniqueClean(values, limit = 16) {
  const seen = new Set();
  const items = [];
  (values ?? []).forEach(value => {
    const text = cleanText(value);
    const key = normalizeForSearch(text);
    if (!text || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    items.push(text);
  });
  return items.slice(0, limit);
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

function createFallbackProductQueryPlan(searchQuery) {
  const normalized = normalizeForSearch(searchQuery);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(token => token.length > 2);
  const terms = [normalized, ...contiguousPhrases(tokens)];
  tokens.forEach(token => terms.push(token, pluralizeToken(token), singularizeToken(token)));

  return normalizeProductQueryPlan({
    source: 'fallback',
    originalQuery: searchQuery,
    canonicalQuery: normalized,
    searchTerms: terms,
    requiredTerms: tokens.filter(token => !['with', 'and', 'the', 'for'].includes(token)),
    excludedTerms: [],
    productType: tokens[tokens.length - 1] || normalized,
    attributes: tokens.slice(0, -1),
    likelyBrands: [],
    retailerHints: [],
  }, searchQuery);
}

function semanticCacheKey(searchQuery) {
  const normalized = normalizeForSearch(searchQuery);
  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2)
    .map(singularizeToken)
    .sort();
  return tokens.join(' ');
}

function normalizeProductQueryPlan(plan, searchQuery) {
  const fallback = normalizeForSearch(searchQuery);
  const canonicalQuery = cleanText(plan?.canonicalQuery) || fallback;
  const searchTerms = uniqueClean([
    ...(Array.isArray(plan?.searchTerms) ? plan.searchTerms : []),
    canonicalQuery,
    fallback,
  ], 18);
  const requiredTerms = uniqueClean(Array.isArray(plan?.requiredTerms) ? plan.requiredTerms : normalizeTokens(canonicalQuery), 10)
    .map(normalizeForSearch);
  const excludedTerms = uniqueClean(Array.isArray(plan?.excludedTerms) ? plan.excludedTerms : [], 12)
    .map(normalizeForSearch);

  return {
    source: plan?.source === 'ai' ? 'ai' : 'fallback',
    originalQuery: cleanText(searchQuery),
    canonicalQuery,
    productType: cleanText(plan?.productType) || canonicalQuery,
    searchTerms,
    requiredTerms,
    excludedTerms,
    attributes: uniqueClean(plan?.attributes, 12),
    likelyBrands: uniqueClean(plan?.likelyBrands, 8),
    retailerHints: uniqueClean(plan?.retailerHints, 8),
  };
}

function cachedPlan(cacheKey, ttlMs = PLAN_CACHE_TTL_MS) {
  const cached = planCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > ttlMs) {
    planCache.delete(cacheKey);
    return null;
  }
  return cached.plan;
}

function setCachedPlan(cacheKey, plan) {
  planCache.set(cacheKey, { createdAt: Date.now(), plan });
}

function extractJsonObject(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

async function fetchAiProductQueryPlan(searchQuery, { apiKey, timeoutMs }) {
  const prompt = [
    'You are the grocery search query planner for Chifufu.',
    'Convert the user query into provider search terms and relevance constraints.',
    'Do not invent store availability, prices, or product rows.',
    'Return JSON only with these keys:',
    'canonicalQuery string, productType string, searchTerms array, requiredTerms array, excludedTerms array, attributes array, likelyBrands array, retailerHints array.',
    'searchTerms should include likely retail/product names, common spellings, category terms, and useful synonyms.',
    'requiredTerms should be the concepts a result must satisfy. Use semantic product concepts, not every filler word.',
    'excludedTerms should catch common wrong matches.',
    `User query: ${JSON.stringify(searchQuery)}`,
  ].join('\n');

  const response = await Promise.race([
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 700,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
  if (!response.ok) throw new Error(`Anthropic ${response.status}`);
  const data = await response.json();
  const json = extractJsonObject(data?.content?.[0]?.text);
  if (!json) throw new Error('No JSON query plan');
  const parsed = JSON.parse(json);
  return normalizeProductQueryPlan({ ...parsed, source: 'ai' }, searchQuery);
}

function refreshAiProductQueryPlan(searchQuery, { apiKey, timeoutMs }) {
  const exactKey = normalizeForSearch(searchQuery);
  const semanticKey = `semantic:${semanticCacheKey(searchQuery)}`;
  if (!apiKey || backgroundPlanRefreshes.has(exactKey)) return;

  const refresh = fetchAiProductQueryPlan(searchQuery, { apiKey, timeoutMs })
    .then(plan => {
      setCachedPlan(exactKey, plan);
      setCachedPlan(semanticKey, plan);
      return plan;
    })
    .catch(err => {
      if (err.message !== 'timeout') {
        console.error('product query planner background fallback:', err.message);
      }
      return null;
    })
    .finally(() => {
      backgroundPlanRefreshes.delete(exactKey);
    });
  backgroundPlanRefreshes.set(exactKey, refresh);
}

async function planProductQuery(searchQuery, { apiKey = process.env.ANTHROPIC_API_KEY, timeoutMs = 250, awaitAi = false } = {}) {
  const cacheKey = normalizeForSearch(searchQuery);
  if (!cacheKey) return createFallbackProductQueryPlan(searchQuery);
  const cached = cachedPlan(cacheKey);
  if (cached) return cached;
  const semanticKey = `semantic:${semanticCacheKey(searchQuery)}`;
  const semanticCached = cachedPlan(semanticKey, SEMANTIC_PLAN_CACHE_TTL_MS);
  if (semanticCached) {
    const plan = normalizeProductQueryPlan({
      ...semanticCached,
      originalQuery: searchQuery,
      searchTerms: [
        searchQuery,
        ...(semanticCached.searchTerms ?? []),
      ],
    }, searchQuery);
    setCachedPlan(cacheKey, plan);
    return plan;
  }

  if (!apiKey) {
    const fallback = createFallbackProductQueryPlan(searchQuery);
    setCachedPlan(cacheKey, fallback);
    return fallback;
  }

  if (awaitAi) {
    try {
      const plan = await fetchAiProductQueryPlan(searchQuery, { apiKey, timeoutMs });
      setCachedPlan(cacheKey, plan);
      setCachedPlan(semanticKey, plan);
      return plan;
    } catch (err) {
      if (err.message !== 'timeout') {
        console.error('product query planner fallback:', err.message);
      }
    }
  } else {
    refreshAiProductQueryPlan(searchQuery, { apiKey, timeoutMs: Math.max(timeoutMs, 1200) });
  }

  const fallback = createFallbackProductQueryPlan(searchQuery);
  setCachedPlan(cacheKey, fallback);
  return fallback;
}

async function warmProductQueryPlan(searchQuery, options = {}) {
  const cacheKey = normalizeForSearch(searchQuery);
  if (!cacheKey) return null;
  const semanticKey = `semantic:${semanticCacheKey(searchQuery)}`;
  const cached = cachedPlan(cacheKey) || cachedPlan(semanticKey, SEMANTIC_PLAN_CACHE_TTL_MS);
  if (cached?.source === 'ai') return cached;
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return cached;

  try {
    const plan = await fetchAiProductQueryPlan(searchQuery, {
      apiKey,
      timeoutMs: options.timeoutMs ?? 1800,
    });
    setCachedPlan(cacheKey, plan);
    setCachedPlan(semanticKey, plan);
    return plan;
  } catch (err) {
    if (err.message !== 'timeout') {
      console.error('product query planner warm failed:', err.message);
    }
    return cached ?? null;
  }
}

module.exports = {
  planProductQuery,
  warmProductQueryPlan,
  createFallbackProductQueryPlan,
  normalizeForSearch,
  normalizeTokens,
};
