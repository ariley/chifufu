# Chifufu Search Thread Context

Date: 2026-06-29

## What I Was Trying To Achieve

The immediate implementation goal was to stop the app from behaving like a hardcoded demo and make search return real grocery product rows for arbitrary user queries.

The product goal is bigger than that:

- A user types any food item.
- The app searches available grocery providers near the selected location.
- Results show actual product identity, image, store, price, and label/nutrition info when available.
- The app should not invent fake products or prices.
- The app should not kick users out to external product pages.
- Store/location choice should stay anchored to the selected or GPS-derived location.

## Important Big-Picture Correction

I got too bogged down in exact wording such as "with pulp." That was the wrong level of focus.

The app should optimize for useful grocery matches, not literal query perfection. For example:

- Search: `orange juice with pulp`
- Good enough result: real orange juice with a real price
- Bad result: no results because the provider does not expose "pulp" exactly
- Also bad: pulp-free orange juice if the user explicitly asked for pulp

The correct behavior is to preserve negative constraints where obvious, but degrade gracefully to useful category/product matches.

## What Changed

Commit: `8fe576f fix: broaden product search results`

Server/API changes:

- Removed fake example price hints and generic fallback rows.
- Removed generated rows like `eggs (dozen)` and `typical package`.
- Generalized search term expansion for arbitrary food queries.
- Kept provider-backed live price rows first.
- Uses Open Food Facts for catalog/label enrichment, not as a fake price source.
- Added relevance filtering so obvious mismatches do not leak into results.
- Relaxed `with pulp` handling so it does not block all orange juice results.
- Bumped result cache version to avoid stale fake rows.

App changes:

- Removed hardcoded quick-search chips.
- Removed outbound `productUrl` handling.
- Added user preference: `Shop in one location`.
- Results screen can prefer one store when the setting is enabled.
- Version bumped to `1.1.1`.

Tests:

- Added product regression coverage for:
  - Norwegian cream cheese
  - Norwegian crème cheese
  - Eggs
  - Milk
  - Carrots
  - Orange juice with pulp
  - Greek yogurt
  - Peanut butter
  - Dark chocolate
  - Israeli feta

## Verification Completed

Local/static:

- `node --check server/index.js`
- `node --check server/lib/kroger.js`
- `npx tsc --noEmit`
- `git diff --check`

Provider-backed:

- Ran regression using Railway provider credentials.
- Deployed API to Railway.
- Ran production regression against `https://chifufu.com`.

Deployment:

- Railway deploy succeeded:
  - `73ef94b6-d719-4ea1-be37-3bfb673b7be0`

TestFlight:

- iOS build finished:
  - version `1.1.1`
  - build `25`
  - EAS build `ddb17b3b-2b4c-4fa6-b04d-df260f248fc5`
- Submitted to App Store Connect.
- Apple processing was pending at the end of the run.

## What Is Still Not Solved

The app still does not have broad supermarket coverage.

Current reality:

- Kroger/Foods Co is the only true live price provider currently wired.
- Google Places can find stores, but it does not provide grocery item inventory/prices.
- Open Food Facts can provide product identity/label/nutrition data, but not store-specific live prices.
- This means the app can search more generally now, but live prices remain limited by provider coverage.

## What Whole Foods Is Doing Differently

Whole Foods/Amazon is not guessing from search text.

They have:

- A product catalog.
- Store or fulfillment-location inventory.
- Product images and label metadata.
- Price/availability tied to a selected delivery/pickup location.

Chifufu needs the same model:

```text
query + location
  -> provider catalog search
  -> store availability/pricing
  -> product enrichment
  -> ranked useful results
```

Google Places belongs only in the store-discovery layer. It should not be treated as a product source.

## Next Product Direction

The next useful work is not more query micro-tuning. It is provider coverage.

Priority:

1. Keep Kroger as one live provider, but label it honestly.
2. Add more US grocery providers where official or stable access exists.
3. Keep store-only results separate from product-price results.
4. Add a provider abstraction so each source returns the same shape:
   - product name
   - brand
   - size
   - image
   - price
   - store
   - availability
   - source/provider
   - confidence
5. Use catalog sources like Open Food Facts only for labels/details.

## Personal Notes For Future Codex Work

- Do not overfit individual example queries.
- Do not hardcode sample products.
- Do not use Google Places as if it provides products/prices.
- Do not add outbound product buttons unless explicitly asked.
- Do not ship App Store/TestFlight changes without regression tests.
- Keep updates short.
- If a query modifier causes no results, prefer useful broad results over empty screens unless the modifier is safety-critical or clearly exclusionary.

