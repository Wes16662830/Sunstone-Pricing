# Sunstone Pricing Calculator

A B2B pricing/quoting web app for **Sunstone Logistic Systems** (fleet logistics
SaaS + hardware). It replaces the multi-tab `Sunstone_Pricing_Calculator.xlsx`
workbook with a single local web app covering SaaS subscription pricing,
hardware costing, implementation labour, rental/financing amortisation, an
internal margin analysis, and a client-safe quote document.

## Quick start

No dependencies, no build step, no `npm install`. You only need **Node ≥ 22.5**
(for the built-in `node:sqlite` module).

```bash
npm start          # or: node --no-warnings server.js
# → open http://127.0.0.1:4000
```

Run the calculation verification suite (checks the engine against the values
already computed in the spreadsheet):

```bash
npm test           # or: node test/verify.js   → 95 checks, all passing
```

## What's in here

| File | Purpose |
|------|---------|
| `pricing.js` | **The calculation engine — single source of truth.** Pure, environment-agnostic JS used unchanged by the browser UI, the server, and the test script. Every formula is transcribed from the workbook. |
| `server.js` | Zero-dependency local server (built-in `http` + `node:sqlite`). Serves the UI and a small REST API that saves/loads quotes. |
| `public/` | The UI (`index.html`, `app.js`, `styles.css`). Vanilla JS, no framework. |
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
  step-cost, discount walk-down, and margin-floor data. Gated behind a passcode.

### About the passcode gate (default: `sunstone`)

**It is a deterrent, not security**, and the UI says so on the gate itself. The
check runs entirely client-side and the internal figures are present in the page
regardless. It only stops casual over-the-shoulder viewing during a client
meeting. I built it anyway because that narrow purpose is genuinely useful and
the cost was trivial — but do not mistake it for access control. If you ever need
real protection, the margin endpoints would have to move server-side behind real
auth. Change the passcode in `public/app.js` (`INTERNAL_PASSCODE`).

## Persistence — read this, it matters

Quotes are saved to a **SQLite file (`quotes.db`) on the disk of the machine
running `server.js`**. Concretely:

- ✅ They survive browser refreshes, switching browsers, and reboots.
- ✅ Any browser pointing at this server sees them — including other people on
  your LAN if you start the server bound to your network (`HOST=0.0.0.0 npm start`).
- ❌ They are **NOT in any cloud.** A teammate on a different machine, or you on a
  different device that can't reach this server, will **not** see your quotes.
- ❌ This is **not** automatic cross-device sync.

In short: **single-machine (optionally single-LAN) persistence.** If you need
real cross-device/cross-teammate access, you'd host this on a shared server or
swap the SQLite file for a hosted database — that's a deployment decision, not
something this local app does for you. `quotes.db` is gitignored so quotes never
get committed.

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
GET    /api/quotes        list saved quotes
GET    /api/quotes/:id    one quote
POST   /api/quotes        create  { name, deal }
PUT    /api/quotes/:id    update  { name, deal }
DELETE /api/quotes/:id    delete
```

A `deal` is the full input object (customer, vehicles, product selection,
hardware config, implementation activities, rental config). All pricing is
recomputed from the deal by `pricing.js`, so saved quotes always reflect the
current calculation logic.
