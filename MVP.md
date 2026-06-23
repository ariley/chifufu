# Chifufu — MVP Product Spec

---

## 1. Core Problem

Chifufu is for people on tight budgets — renters, students, families — who want to know
where to buy groceries or grab a meal for the least amount of money right now, near where
they are. The existing problem: price comparison is slow (manual web searches, or driving
around), and delivery apps surface deals but not value. Chifufu collapses "where should I
shop tonight?" into a single tap. The value proposition is local, real-time, AI-synthesized
price intelligence — not a couponing app, not a delivery aggregator.

---

## 2. MVP Scope

The v1.0 must do exactly these things and nothing else:

**Search**
- Auto-detect GPS location; allow manual city/zip override
- Four categories: Groceries, Go Out, Order In, Pet Stores
- Optional freetext query (e.g. "avocados", "ramen under $8")
- Server calls Google Places for real nearby stores, feeds them to Claude, returns 5–8
  priced items sorted cheapest-first

**Results**
- List view: item name, store, price, distance, up to 3 badges (deal / fast / close)
- Tap item → detail view (description, address, price)
- Add item to route (the in-session shopping list)

**Route (Bucket)**
- Items grouped by store
- One-tap navigation to each store via Apple Maps / Google Maps deep link
- Save named route locally; load saved routes
- Share route as a 6-character code (web-viewable, 24-hour TTL)

**Accounts**
- Email + password sign-up / sign-in with email verification
- Profile screen showing email; sign-out
- Auth token persisted in SecureStore

**Settings**
- Theme picker (4 options)
- Clear search history

**Platforms**
- React Native (iOS + Android) via Expo
- Next.js web app (search + results only; same backend)

---

## 3. Data Model

### Recommendation: stay on Postgres (already wired via Prisma + Neon)

The data is relational: users own routes, routes contain ordered items, items reference
stores. There is no document-shaped data that would benefit from Mongo. Postgres wins here.

### Schema additions needed for MVP

**`User`** (exists)
- `id`, `email`, `password`, `name`, `emailVerified`, `createdAt`, `updatedAt`

**`Route`** (new)
- `id` — cuid
- `userId` — FK → User
- `name` — string
- `savedAt` — DateTime
- `createdAt` — DateTime

**`RouteItem`** (new)
- `id` — cuid
- `routeId` — FK → Route, cascade delete
- `position` — Int (order within route)
- `itemId` — string (AI-generated id, not a DB FK — stores are not persisted)
- `name` — string (store name)
- `description` — string (item description)
- `price` — string (display: "$2.49")
- `priceValue` — Float
- `distance` — string
- `address` — string?
- `lat` — Float?
- `lng` — Float?
- `quantity` — Int default 1
- `badges` — string[] (Postgres array or JSON)

**`SharedCart`** (new — replace in-memory Map)
- `code` — string PK (6-char uppercase)
- `items` — Json (BucketItem[])
- `createdAt` — DateTime
- `expiresAt` — DateTime (createdAt + 24h)

**`VerificationToken`** (exists)

**`SearchHistory`** — do NOT move to DB (see §4)

### What does not need a DB table

- Individual `ResultItem` objects from a search — these are ephemeral, synthesized
  per-request; no value in persisting them
- Current bucket/in-progress route — session state only
- Theme preference — local only

---

## 4. Local vs Cloud

| Data | Storage | Rationale |
|---|---|---|
| Active bucket (in-progress route) | AsyncStorage | Ephemeral session state; no sharing needed until saved |
| Search history | AsyncStorage | Personal, high-write, low-value if lost |
| Theme preference | AsyncStorage | Pure UI preference |
| Auth token | SecureStore | Security requirement |
| Saved routes | **DB (cloud)** — currently AsyncStorage | Routes are the core value; losing them on reinstall is bad UX and blocks sharing |
| Shared carts | **DB (cloud)** — currently in-memory Map | In-memory dies on server restart; codes should survive deploys |
| User account | DB | Already wired |

The single most important migration for v1.0: move saved routes from AsyncStorage to the
database, keyed to the authenticated user. Everything else staying local is fine.

**Anonymous users:** saved routes should be local until sign-in, then merged/uploaded on
first authentication. This is the most complex UX decision but it's necessary — requiring
sign-in before saving will kill conversion.

---

## 5. Out of Scope for MVP

Cut these completely for v1.0. Add them only after shipping and seeing retention data.

- **Price history / trending** — requires scraping or partner data feeds; enormous scope
- **Push notifications** (deal alerts, route reminders) — infrastructure cost before product fit is known
- **Social / following** — shared carts cover the immediate sharing use case
- **Saved items list** (the "Saved" screen, `useSaved.ts`) — overlaps with routes; the current codebase has both; pick one or merge; routes are more useful
- **Order-in platform integration** (real DoorDash / Uber Eats API) — Claude generating delivery prices is currently hallucinated; either integrate real APIs or remove the category
- **Reviews / ratings surface** — Google Places already surfaces ratings; don't build a separate layer
- **Budget tracking / spending history** — different product
- **Web app parity** — web app can stay search + results only for v1.0
- **Offline mode** — requires caching strategy; not day-one
- **`under5` / `under10` categories** — these exist in `types/index.ts` and the server but are not surfaced in `HomeScreen.tsx`; decide whether to cut the types or add the UI; don't ship dead code

---

## 6. Open Questions

**1. What happens to "Order In" results?**
The current implementation asks Claude to guess DoorDash prices. Those prices are
hallucinated. Either (a) remove the Order In category, (b) integrate a real delivery API
(DoorDash Drive, Uber Eats API), or (c) reframe it as "cheapest pickup options" and drop
the `platform` field. This is a trust and accuracy issue — shipping hallucinated delivery
prices will get bad reviews.

**2. Do anonymous users get saved routes?**
The app currently allows bucket/route use without an account. If saved routes move to the
DB, unauthenticated users lose persistence. Options: (a) require sign-in to save, (b) keep
anonymous routes in AsyncStorage and merge on sign-in, (c) generate a device-level anonymous
user in the DB. Option (b) is recommended but adds complexity. Decide before building the
sync layer.

**3. Is the web app a separate product or just a landing page?**
The Next.js app at `/web` is a full search+results implementation. Running two surfaces with
two codebases is maintenance debt. Decide: (a) invest in the web app as a real second
platform (needs auth, route sync), (b) make it a pure marketing/shared-cart landing page
and drop the search UI, or (c) migrate both to Expo Web to share code. Option (b) is the
lowest-effort path to ship.

**4. What is the monetization model?**
The current architecture has no monetization hook. Each search costs money (Google Places
API + Anthropic API call). Before adding users at scale, decide: (a) freemium with a search
limit per day, (b) subscription, (c) affiliate / store partnership, (d) ads. This affects
whether rate-limiting infrastructure is needed for v1.0.

**5. How accurate are the AI-generated prices?**
Claude is synthesizing plausible prices for real stores, but it does not have real-time
inventory or pricing data. The accuracy claim "We find the best value — every time" in the
UI is not defensible today. Either (a) add a disclaimer ("estimated prices"), (b) source
real price data for at least the grocery category (Kroger API, Instacart API), or (c)
reframe the product around discovery ("cheap options near you") rather than price accuracy.
This is the core product integrity question.
