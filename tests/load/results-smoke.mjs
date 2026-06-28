const BASE_URL = process.env.CHIFUFU_API_URL ?? 'https://cheap-food-production.up.railway.app';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const ROUNDS = Number(process.env.ROUNDS ?? 2);

const scenarios = [
  { searchQuery: 'eggs', location: 'Oakland, CA', lat: 37.8044, lng: -122.2712 },
  { searchQuery: 'Israeli feta', location: 'Oakland, CA', lat: 37.8044, lng: -122.2712 },
  { searchQuery: 'Norwegian cream cheese', location: 'Oakland, CA', lat: 37.8044, lng: -122.2712 },
  { searchQuery: 'Italian provolone cheese', location: 'Oakland, CA', lat: 37.8044, lng: -122.2712 },
  { searchQuery: 'milk', location: 'Berkeley, CA', lat: 37.8715, lng: -122.2730 },
];

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function runScenario(scenario) {
  const startedAt = performance.now();
  const response = await fetch(`${BASE_URL}/api/results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: scenario.location,
      category: 'grocery',
      searchQuery: scenario.searchQuery,
      lat: scenario.lat,
      lng: scenario.lng,
    }),
  });
  const elapsedMs = performance.now() - startedAt;
  const cache = response.headers.get('x-chifufu-cache') ?? 'none';
  const body = await response.json().catch(() => null);
  const count = Array.isArray(body) ? body.length : 0;
  const hasPrices = Array.isArray(body) && body.every(item => typeof item.price === 'string' && Number.isFinite(item.priceValue));
  const hasStores = Array.isArray(body) && body.every(item => typeof item.name === 'string' && item.name.length > 0);

  return {
    searchQuery: scenario.searchQuery,
    status: response.status,
    ok: response.ok,
    elapsedMs,
    cache,
    count,
    hasPrices,
    hasStores,
  };
}

async function worker(id, queue, results) {
  while (queue.length > 0) {
    const scenario = queue.shift();
    if (!scenario) return;
    try {
      const result = await runScenario(scenario);
      results.push(result);
      console.log(
        `[worker ${id}] ${result.searchQuery}: ${result.status} ${Math.round(result.elapsedMs)}ms cache=${result.cache} count=${result.count}`,
      );
    } catch (error) {
      results.push({
        searchQuery: scenario.searchQuery,
        status: 0,
        ok: false,
        elapsedMs: 0,
        cache: 'error',
        count: 0,
        hasPrices: false,
        hasStores: false,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`[worker ${id}] ${scenario.searchQuery}: ERROR ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const queue = [];
for (let round = 0; round < ROUNDS; round += 1) {
  queue.push(...scenarios);
}

const results = [];
await Promise.all(Array.from({ length: CONCURRENCY }, (_, index) => worker(index + 1, queue, results)));

const latencies = results.filter(result => result.ok).map(result => result.elapsedMs);
const failures = results.filter(result => !result.ok);
const invalid = results.filter(result => result.ok && (!result.hasPrices || !result.hasStores || result.count === 0));

console.log('\nSummary');
console.log(`base=${BASE_URL}`);
console.log(`requests=${results.length} failures=${failures.length} invalid=${invalid.length}`);
console.log(`p50=${Math.round(percentile(latencies, 50))}ms p90=${Math.round(percentile(latencies, 90))}ms max=${Math.round(Math.max(0, ...latencies))}ms`);

if (failures.length > 0 || invalid.length > 0) {
  process.exitCode = 1;
}
