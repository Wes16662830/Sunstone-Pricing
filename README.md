# Sunstone Pricing Calculator

A B2B pricing/quoting web app for **Sunstone Logistic Systems** (fleet logistics
SaaS + hardware). It replaces the multi-tab `Sunstone_Pricing_Calculator.xlsx`
workbook with a single local web app covering SaaS subscription pricing,
hardware costing, implementation labour, rental/financing amortisation, an
internal margin analysis, and a client-safe quote document.

It runs two ways from one codebase:

- **Locally** — a zero-dependency Node server (`server.js`) with a SQLite file.
- **Hosted on Cloudflare** — Pages + Functions (`functions/`) with a D1 database,
  for a shareable URL with real shared persistence. See **Deploying to Cloudflare**.

Both backends speak the same REST contract and serve the same `public/` UI and
`pricing.js` engine, so behaviour is identical.

## Quick start (local)

No dependencies, no build step, no `npm install`. You only need **Node ≥ 22.5**
(for the built-in `node:sqlite` module).

```bash
npm start          # or: node --no-warnings server.js
# → open http://127.0.0.1:4000  → sign in (default password: "sunstone")
```

The whole app is gated behind a single password (env `PASSWORD`, default
`sunstone` locally — set `PASSWORD=… npm start` to change it).

Run the calculation verification suite (checks the engine against the values
already computed in the spreadsheet):

```bash
npm test           # or: node test/verify.js   → 95 checks, all passing
```

## What's in here

| Path | Purpose |
|------|---------|
| `public/pricing.js` | **The calculation engine — single source of truth.** Pure, environment-agnostic JS used unchanged by the browser UI, the local server, and the test script. Every formula is transcribed from the workbook. |
| `server.js` | Zero-dependency local server (built-in `http` + `node:sqlite` + `node:crypto`). Serves the UI and the REST API; enforces the password gate. |
| `functions/` | Cloudflare Pages Functions: auth middleware (`_middleware.js`), login/logout, and quotes CRUD against D1. Same REST contract as `server.js`. |
| `public/` | The UI (`index.html`, `app.js`, `styles.css`, `login.html`, `pricing.js`). Vanilla JS, no framework, no build. |
| `wrangler.toml` / `schema.sql` | Cloudflare deploy config + D1 table schema. |
| `test/verify.js` | Verification harness. Runs known scenarios (Zambia Sugar + Scenarios A/B/C + hardware/PMT) against the workbook's own computed cell values. |
| `Sunstone_Pricing_Calculator.xlsx` | The original workbook, kept as the reference source of truth. |

## Views

Two views toggled in one app:

- **Client view (the "Customer Quote" tab)** — subscription, implementation, and
  hardware line items and totals only. It renders **only** from a whitelisted
  projection (`buildClientQuote` in `pricing.js`), which by construction never
  contains marginal cost, gross margin, contribution, or step-cost data. Flipping
  any toggle elsewhere cannot leak margin data here — the data simply isn't in the
  object the view reads. (Verified by the test suite: the serialised client quote
  contains no `margin`/`contribution`/`marginal` fields.)
- **Internal view (the "Internal Margin" tab)** — full cost, margin, contribution,
  step-cost, discount walk-down, and margin-floor data.

### Access control — two layers, and what each actually does

1. **Site password gate (real, server-side).** The entire app is behind a single
   shared password checked by the server. A signed HttpOnly session cookie is
   issued on login (HMAC-SHA256, 12h expiry). Every route — including `pricing.js`,
   which carries the cost/margin constants — returns 401/redirect until you are
   authenticated, so **cost and margin figures are never served to an un-signed-in
   browser.** This is the real protection. Set the password via the `PASSWORD`
   secret (Cloudflare) or env var (local); set `SESSION_SECRET` to a long random
   string in production.
2. **"Presentation mode" toggle (on-screen deterrent only).** Once signed in, you
   are trusted internal staff and margins are visible by default. The Presentation
   toggle hides the Internal Margin tab and forces the client Quote view — purely
   so margins aren't on screen if a client glances at your laptop. It changes
   nothing the server sends; it is not security.

This matches the "internal-only audience" decision: because clients never access
the app (they receive the **printed/PDF quote** from the Customer Quote tab), the
single site-wide gate is the proportionate way to keep margins server-side. The
heavier alternative — splitting the pricing engine so anonymous browsers can load
the quote builder but never receive cost inputs — is only needed if clients use
the live app directly, which they don't here.

## Persistence — read this, it matters

The persistence story depends on **how you run it**:

**Local (`server.js`)** — quotes go to a **SQLite file (`quotes.db`) on the disk of
the machine running the server**.

- ✅ Survive refreshes, browser changes, and reboots.
- ✅ Any browser pointing at this server sees them — incl. LAN peers if you bind to
  your network (`HOST=0.0.0.0 npm start`).
- ❌ **NOT cloud, NOT cross-device.** A teammate on another machine won't see them.

→ **single-machine (optionally single-LAN) persistence.** `quotes.db` is gitignored.

**Hosted on Cloudflare (D1)** — quotes go to a **Cloudflare D1 database** (managed,
SQLite-backed, durable).

- ✅ **Genuinely shared and cross-device:** every teammate hitting the URL reads and
  writes the same store, from any machine, no LAN required.
- ✅ Survives restarts/redeploys (it's a managed DB, not a container file).

→ This is the real cross-team persistence the local version can't give you, and the
reason the hosted path exists.

## Deploying to Cloudflare (Pages + Functions + D1)

The app is structured as a Cloudflare Pages project: static UI in `public/`, API in
`functions/`, persistence in D1. One-time setup (needs your own Cloudflare account;
these commands run under your `wrangler login`):

```bash
# 0. Auth wrangler to YOUR Cloudflare account
npx wrangler login

# 1. Create the D1 database, then paste the returned database_id into wrangler.toml
npx wrangler d1 create sunstone-quotes

# 2. Create the table (remote)
npx wrangler d1 execute sunstone-quotes --remote --file=schema.sql

# 3. Create the Pages project and deploy
npx wrangler pages project create sunstone-pricing
npx wrangler pages deploy public

# 4. Set the secrets (you'll be prompted for the value)
npx wrangler pages secret put PASSWORD         # the staff login password
npx wrangler pages secret put SESSION_SECRET   # any long random string

# 5. In the Cloudflare dashboard → your Pages project → Settings → Functions →
#    D1 bindings, bind variable name `DB` to the `sunstone-quotes` database.
#    (Bindings for the deployed project are set here, not only in wrangler.toml.)
```

Your shareable URL is the Pages project URL (`https://sunstone-pricing.pages.dev`,
or a custom domain you attach). Anyone you give it to lands on the login page and
needs the `PASSWORD` to get in.

**Run the Cloudflare stack locally first** (recommended, to verify before deploying):

```bash
cp .dev.vars.example .dev.vars                              # local PASSWORD/SESSION_SECRET
npx wrangler d1 execute sunstone-quotes --local --file=schema.sql
npx wrangler pages dev                                      # → http://localhost:8788
```

`.dev.vars` and `.wrangler/` are gitignored; real secrets live only in Cloudflare.

### Auto-deploy on push (GitHub Actions)

`.github/workflows/deploy.yml` deploys to Cloudflare Pages on **every push**:
push to `main` → production, push to any other branch → a preview URL. Cloudflare
decides production vs preview from the branch name, so a feature branch is never
forced into production.

To arm it, add two **GitHub repo secrets** (Settings → Secrets and variables →
Actions) — the only manual step, and it must be you since the token is tied to
your Cloudflare account:

| Secret | Where to get it |
|--------|-----------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → grant **Cloudflare Pages: Edit** (and **D1: Edit** if you later run migrations from CI). |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar of any account page. |

The app's `PASSWORD` and `SESSION_SECRET` are **Cloudflare Pages project secrets**
(set once with `wrangler pages secret put`), not GitHub secrets — they persist on
the project across deploys, so CI never touches them. The D1 schema is a one-time
`wrangler d1 execute … --remote` (idempotent `CREATE TABLE IF NOT EXISTS`), kept
out of the deploy job to keep it simple. Once the two secrets exist and you've run
`pages project create` once, every push deploys with no further action.

Note: the workflow reads the D1 binding from `wrangler.toml`, so put your real
`database_id` there (it isn't a secret) before relying on CI deploys.

## Calculation model (verified against the workbook)

All of these were read directly from the `.xlsx` cell formulas (`openpyxl`,
`data_only=False`) and cross-checked against the values the spreadsheet had
already computed.

- **Subscription** — `list = marginalCost / (1 − targetGM)`; bundle multiplier by
  count of selected products (1→0%…5→20%); volume cliff tiers by vehicle count;
  `effective = list × bundleMult × volumeMult`; `monthly = effective × vehicles`.
- **Hardware** — 25% markup on cost → sell; fuel-probe kits = GPS + 1 or 2 probes;
  20% international shipping surcharge on hardware items only; installation
  auto-computed from selections + fleet composition. Handset is a real per-line
  dropdown across all three SKUs (a deliberate improvement over the workbook's
  fragile one-VLOOKUP-per-row approach).
- **Implementation** — 12 time-and-materials activities; Senior R1,325/hr vs
  Consultant R1,000/hr per row; per-row editable hours/senior/discount; training
  rows bill only if the matching product is selected (shown greyed otherwise).
- **Rental** — all-inclusive monthly = SaaS + `PMT(18%/12, term, hardware+install)`;
  term 12/24/36; Pure Rental vs Rent-to-Own; end-of-term refresh vs retain
  comparison (retain = SaaS + 0.75%/mo support on hardware value, Pure Rental only).
- **Internal margin** — per-product revenue/cost/contribution/GM; margin-floor
  check (50% floor = marginal×2, 60% floor = marginal÷0.4); step-cost warning
  (advisory only, never added to price).

### Known bug, deliberately replicated (not fixed)

Fuel already includes Tracking's functionality, so the two are meant to be
mutually exclusive. The workbook only **warns** when both are selected — it does
**not** block the double-counting in the total. This app does the same: it shows
a prominent warning banner when both are on, but still calculates the total with
both counted and still lets the quote be generated and saved. This was an explicit
requirement — "fixing" it silently would change what reps can quote. With the
Zambia Sugar example (Tracking + Fuel both on) this is exactly why the bundle
shows 4 products and the monthly total is R19,391.33.

## Discrepancies between the build spec and the workbook (the workbook won)

The brief said the workbook is the source of truth and to flag any disagreement.
Three came up:

1. **Fuel target gross margin.** The spec said Fuel uses an 85% GM. The workbook
   cell `Config!C6` is **0.75 (75%)**, giving a list price of **R332**, not R553.
   I used the workbook's 75% / R332 — this is what every downstream value in the
   sheet (R5,644/mo for Fuel at 20 vehicles, etc.) is actually built on.
2. **Extra catalog items.** `Config` contains two items the spec's product/SKU
   lists omit: a **Fleetview** subscription product (R87 marginal, 75% GM) and a
   **Streamax 3 camera** hardware SKU. The Calculator sheet itself only uses the
   five named products, so the subscription UI uses those five; the Streamax SKU
   is carried in the hardware catalog for completeness. Fleetview is noted here
   but not added to the five-product subscription flow (the workbook doesn't use
   it there either).
3. **Rental vehicle count.** `Rental!B11` is hardcoded to **140** vehicles in the
   workbook — stale and inconsistent with the 20-vehicle deal driving every other
   sheet (it makes the workbook's per-vehicle rental figure, R138.51, not tie to
   the rest of the model). This app links the rental vehicle count to the actual
   fleet size instead, so the rental per-vehicle number is internally consistent.

## REST API (used by the UI)

```
POST   /api/login         { password }  → sets session cookie
POST   /api/logout        clears session cookie
GET    /api/quotes        list saved quotes          (auth required)
GET    /api/quotes/:id    one quote                  (auth required)
POST   /api/quotes        create  { name, deal }      (auth required)
PUT    /api/quotes/:id    update  { name, deal }      (auth required)
DELETE /api/quotes/:id    delete                      (auth required)
```

Identical on both backends (`server.js` and `functions/`). Unauthenticated API
calls return 401; unauthenticated page navigations redirect to `/login`.

A `deal` is the full input object (customer, vehicles, product selection,
hardware config, implementation activities, rental config). All pricing is
recomputed from the deal by `pricing.js`, so saved quotes always reflect the
current calculation logic.
