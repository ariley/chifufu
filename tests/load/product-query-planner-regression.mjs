import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { planProductQuery, warmProductQueryPlan } = require('../../server/lib/product-query-planner');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includesTerm(plan, pattern) {
  const text = [
    plan.canonicalQuery,
    plan.productType,
    ...(plan.searchTerms ?? []),
    ...(plan.requiredTerms ?? []),
    ...(plan.excludedTerms ?? []),
    ...(plan.attributes ?? []),
    ...(plan.likelyBrands ?? []),
    ...(plan.retailerHints ?? []),
  ].join(' ').toLowerCase();
  return pattern.test(text);
}

const originalFetch = global.fetch;
global.fetch = async () => ({
  ok: true,
  json: async () => ({
    content: [{
      text: JSON.stringify({
        canonicalQuery: 'snofrisk norwegian cheese spread',
        productType: 'spreadable cheese',
        searchTerms: [
          'snofrisk',
          'tine snofrisk',
          'norwegian cheese spread',
          'spreadable goat cheese',
        ],
        requiredTerms: ['snofrisk'],
        excludedTerms: ['philadelphia', 'kroger original cream cheese'],
        attributes: ['norwegian', 'spreadable'],
        likelyBrands: ['Tine'],
        retailerHints: ['Whole Foods Market'],
      }),
    }],
  }),
});

const coldPlan = await planProductQuery('Norwegian cream cheese', {
  apiKey: 'test-key',
  timeoutMs: 10,
});
assert(coldPlan.source === 'fallback', 'expected cold search to return fallback immediately');
assert(coldPlan.searchTerms.includes('norwegian cream cheese'), 'expected cold fallback to keep full query');

const aiPlan = await warmProductQueryPlan('Norwegian cream cheese', {
  apiKey: 'test-key',
  timeoutMs: 500,
});
assert(aiPlan.source === 'ai', 'expected AI query plan source');
assert(includesTerm(aiPlan, /\bsnofrisk\b/), 'expected AI plan to preserve Snofrisk expansion');
assert(includesTerm(aiPlan, /\bwhole foods market\b/), 'expected AI plan to preserve retailer hints');
assert(aiPlan.excludedTerms.some(term => /philadelphia/.test(term)), 'expected AI plan exclusions');

const semanticPlan = await planProductQuery('cream cheese norwegian', {
  apiKey: 'test-key',
  timeoutMs: 10,
});
assert(semanticPlan.source === 'ai', 'expected semantically equivalent query to reuse warm AI plan');
assert(includesTerm(semanticPlan, /\bsnofrisk\b/), 'expected semantic cache to reuse AI expansion');

global.fetch = originalFetch;

const fallbackPlan = await planProductQuery('beer battered fish', {
  apiKey: '',
  timeoutMs: 50,
});
assert(fallbackPlan.source === 'fallback', 'expected fallback query plan source');
assert(fallbackPlan.searchTerms.includes('beer battered fish'), 'expected fallback to keep full query');
assert(fallbackPlan.searchTerms.includes('battered fish'), 'expected fallback to include contiguous phrase');
assert(fallbackPlan.requiredTerms.includes('beer'), 'expected fallback to require beer concept');
assert(fallbackPlan.requiredTerms.includes('battered'), 'expected fallback to require battered concept');
assert(fallbackPlan.requiredTerms.includes('fish'), 'expected fallback to require fish concept');

const oatPlan = await planProductQuery('oatmilk', {
  apiKey: '',
  timeoutMs: 50,
});
assert(oatPlan.searchTerms.includes('oatmilk'), 'expected fallback to keep compact product spelling');

console.log(JSON.stringify({
  ai: {
    canonicalQuery: aiPlan.canonicalQuery,
    searchTerms: aiPlan.searchTerms,
    requiredTerms: aiPlan.requiredTerms,
    excludedTerms: aiPlan.excludedTerms,
  },
  fallback: {
    beerBatteredFish: fallbackPlan.searchTerms.slice(0, 8),
    oatmilk: oatPlan.searchTerms.slice(0, 4),
  },
}, null, 2));
