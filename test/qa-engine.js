/* QA suite — pricing-engine edge cases, robustness against corrupt config/deals,
 * and cross-backend projection parity. Dependency-free; run with `npm run
 * test:engine` (also part of `npm test`). Complements test/verify.js, which
 * checks the numbers against the source workbook. */
'use strict';
const P = require('../public/pricing.js');
let pass = 0, fail = 0; const findings = [];
function check(name, cond, detail) {
  if (cond) pass++; else { fail++; findings.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ FAIL:', name, detail || ''); }
}
function safe(name, fn) {
  try { const v = fn(); check(name + ' (no throw)', true); return v; }
  catch (e) { check(name + ' (no throw)', false, e.message); return null; }
}

console.log('\n=== A. Numeric edge cases on calcSubscription ===');
P.setConfig(P.getDefaultConfig());
const cases = [
  ['zero vehicles', { vehicles: 0, users: 0, selected: { tracking: true } }],
  ['negative vehicles', { vehicles: -10, users: 0, selected: { tracking: true } }],
  ['fractional vehicles', { vehicles: 3.7, users: 0, selected: { tracking: true } }],
  ['huge fleet', { vehicles: 1e7, users: 0, selected: { tracking: true } }],
  ['NaN vehicles', { vehicles: NaN, users: 0, selected: { tracking: true } }],
  ['string vehicles', { vehicles: '25', users: 0, selected: { tracking: true } }],
  ['no selection', { vehicles: 20, users: 0, selected: {} }],
  ['undefined selected', { vehicles: 20, users: 0 }],
  ['all products', { vehicles: 20, users: 5, selected: { tracking: true, fuel: true, routeBuilder: true, digitalJourney: true, stockMaster: true } }],
];
for (const [label, input] of cases) {
  const s = safe('calcSubscription ' + label, () => P.calcSubscription(input));
  if (s) {
    check(`${label}: totals finite`, Number.isFinite(s.totalMonthly) && Number.isFinite(s.totalAnnual), `${s.totalMonthly}/${s.totalAnnual}`);
    check(`${label}: no negative total`, s.totalMonthly >= 0, String(s.totalMonthly));
    check(`${label}: annual = 12x monthly`, Math.abs(s.totalAnnual - s.totalMonthly * 12) < 1e-6);
  }
}
const empty = P.calcSubscription({ vehicles: 20, users: 0, selected: {} });
check('no selection -> zero total', empty.totalMonthly === 0, String(empty.totalMonthly));
check('no selection -> blendedPerVehicle 0', empty.blendedPerVehicle === 0, String(empty.blendedPerVehicle));

console.log('\n=== B. Discount schedules ===');
// bundle tiers 1..5
for (let n = 1; n <= 5; n++) {
  const keys = ['tracking', 'fuel', 'routeBuilder', 'digitalJourney', 'stockMaster'].slice(0, n);
  const sel = {}; keys.forEach((k) => { sel[k] = true; });
  const s = P.calcSubscription({ vehicles: 10, users: 0, selected: sel });
  const expected = P.getConfig().bundleSchedule[n];
  check(`bundle tier ${n} discount = ${expected}`, Math.abs(s.bundle.discount - expected) < 1e-9, `${s.bundle.discount}`);
}
// volume tiers boundaries
const tiers = P.getConfig().volumeTiers;
for (const t of tiers) {
  const at = P.calcSubscription({ vehicles: t.min, users: 0, selected: { tracking: true } });
  check(`volume tier "${t.name}" at min=${t.min}`, Math.abs(at.volume.discount - t.discount) < 1e-9, `${at.volume.discount} vs ${t.discount}`);
}
// boundary just below a tier
const tier2 = tiers[1];
if (tier2) {
  const below = P.calcSubscription({ vehicles: tier2.min - 1, users: 0, selected: { tracking: true } });
  check(`vehicles just below ${tier2.name} uses lower tier`, below.volume.discount === tiers[0].discount, `${below.volume.discount}`);
}

console.log('\n=== C. Billing models (perVehicle / perUser / flat) ===');
{
  const cfg = P.getDefaultConfig();
  cfg.products = [
    { key: 'pv', name: 'PerVeh', marginalCost: 50, targetGM: 0.5, billing: 'perVehicle' },
    { key: 'pu', name: 'PerUser', marginalCost: 50, targetGM: 0.5, billing: 'perUser' },
    { key: 'fl', name: 'Flat', marginalCost: 50, targetGM: 0.5, billing: 'flat' },
  ];
  P.setConfig(cfg);
  const s = P.calcSubscription({ vehicles: 10, users: 4, selected: { pv: true, pu: true, fl: true } });
  const byKey = Object.fromEntries(s.lines.map((l) => [l.key, l]));
  check('perVehicle qty = vehicles', byKey.pv.qty === 10, String(byKey.pv.qty));
  check('perUser qty = users', byKey.pu.qty === 4, String(byKey.pu.qty));
  check('flat qty = 1', byKey.fl.qty === 1, String(byKey.fl.qty));
  // zero users with a perUser product
  const s0 = P.calcSubscription({ vehicles: 10, users: 0, selected: { pu: true } });
  check('perUser with 0 users -> 0 monthly', s0.totalMonthly === 0, String(s0.totalMonthly));
}

console.log('\n=== D. Discount eligibility toggles ===');
{
  const cfg = P.getDefaultConfig();
  cfg.products = [
    { key: 'a', name: 'A', marginalCost: 50, targetGM: 0.5, bundleEligible: true, volumeEligible: true },
    { key: 'b', name: 'B', marginalCost: 50, targetGM: 0.5, bundleEligible: false, volumeEligible: false },
  ];
  P.setConfig(cfg);
  const s = P.calcSubscription({ vehicles: 5000, users: 0, selected: { a: true, b: true } });
  const a = s.lines.find((l) => l.key === 'a'), b = s.lines.find((l) => l.key === 'b');
  check('ineligible product priced at list', Math.abs(b.effectivePrice - b.listPrice) < 1e-9, `${b.effectivePrice} vs ${b.listPrice}`);
  check('eligible product discounted below list', a.effectivePrice < a.listPrice, `${a.effectivePrice} vs ${a.listPrice}`);
  check('ineligible product excluded from bundle count', s.productCount === 1, `count=${s.productCount}`);
}

console.log('\n=== E. Known Fuel+Tracking double-count (deliberately replicated) ===');
P.setConfig(P.getDefaultConfig());
{
  const both = P.calcSubscription({ vehicles: 10, users: 0, selected: { tracking: true, fuel: true } });
  check('conflict flagged when both selected', both.fuelTrackingConflict === true);
  check('conflict does NOT block calculation', both.totalMonthly > 0, String(both.totalMonthly));
  const onlyFuel = P.calcSubscription({ vehicles: 10, users: 0, selected: { fuel: true } });
  check('both > fuel alone (double-count preserved)', both.totalMonthly > onlyFuel.totalMonthly);
  const none = P.calcSubscription({ vehicles: 10, users: 0, selected: {} });
  check('no conflict when neither selected', none.fuelTrackingConflict === false);
}

console.log('\n=== F. Corrupt / hostile config robustness ===');
const corrupt = [
  ['null catalog entry', (c) => { c.hardwareCatalog.bad = null; }],
  ['catalog entry missing sku', (c) => { c.hardwareCatalog.bad = { cost: 5 }; }],
  ['catalog entry missing cost', (c) => { c.hardwareCatalog.bad = { sku: 'X' }; }],
  ['catalog entry is a string', (c) => { c.hardwareCatalog.bad = 'oops'; }],
  ['catalog entry cost is string', (c) => { c.hardwareCatalog.bad = { sku: 'X', cost: 'abc' }; }],
  ['empty products array', (c) => { c.products = []; }],
  ['product missing key', (c) => { c.products = [{ name: 'NoKey', marginalCost: 10, targetGM: 0.5 }]; }],
  ['product targetGM = 1 (div by zero)', (c) => { c.products = [{ key: 'x', name: 'X', marginalCost: 10, targetGM: 1 }]; }],
  ['product targetGM > 1', (c) => { c.products = [{ key: 'x', name: 'X', marginalCost: 10, targetGM: 1.5 }]; }],
  ['negative marginalCost', (c) => { c.products = [{ key: 'x', name: 'X', marginalCost: -10, targetGM: 0.5 }]; }],
  ['handsetOptions references missing key', (c) => { c.handsetOptions = ['ghost1', 'ghost2']; }],
  ['volumeTiers empty', (c) => { c.volumeTiers = []; }],
  ['bundleSchedule empty', (c) => { c.bundleSchedule = {}; }],
  ['installItems null', (c) => { c.installItems = null; }],
  ['implActivities null', (c) => { c.implActivities = null; }],
  ['currency rates missing', (c) => { c.currency = {}; }],
];
for (const [label, mutate] of corrupt) {
  const cfg = P.getDefaultConfig();
  try { mutate(cfg); } catch {}
  const ok = safe('config: ' + label, () => {
    P.setConfig(cfg);
    const d = P.calcDeal({ vehicles: 20, users: 2, selected: { tracking: true }, hardware: { items: { extra: {}, installSel: {} } }, implementation: {}, rental: {} });
    if (!Number.isFinite(d.subscription.totalMonthly)) throw new Error('non-finite subscription total');
    if (!Number.isFinite(d.hardware.grandTotal)) throw new Error('non-finite hardware total');
    return d;
  });
  if (ok) check(`config: ${label} -> client projection safe`, Number.isFinite(ok.clientQuote.year1Total), String(ok.clientQuote.year1Total));
}

console.log('\n=== G. Corrupt / legacy DEAL robustness ===');
P.setConfig(P.getDefaultConfig());
const badDeals = [
  ['empty object', {}],
  ['null hardware', { vehicles: 10, selected: { tracking: true }, hardware: null }],
  ['legacy deal (no qtyOverride/extra)', { vehicles: 10, selected: { tracking: true }, hardware: { singleTank: 1, items: {} } }],
  ['hardware.items missing entirely', { vehicles: 10, selected: { tracking: true }, hardware: {} }],
  ['custom rows referencing deleted sku', { vehicles: 10, selected: {}, hardware: { items: { custom: [{ key: 'ghostSku', qty: 2 }] } } }],
  ['customInstall malformed', { vehicles: 10, selected: {}, hardware: { items: { customInstall: [{}, null] } } }],
  ['qtyOverride garbage values', { vehicles: 10, selected: {}, hardware: { items: { qtyOverride: { djHandset: 'abc', printer: null }, extra: {} } } }],
  ['selected is null', { vehicles: 10, selected: null }],
  ['implementation.activities null', { vehicles: 10, selected: {}, implementation: { activities: null } }],
];
for (const [label, deal] of badDeals) {
  safe('deal: ' + label, () => {
    const d = P.calcDeal(deal);
    if (!Number.isFinite(d.clientQuote.year1Total)) throw new Error('non-finite year1Total');
    return d;
  });
}

console.log('\n=== H. Client projection = margin-safe by construction ===');
P.setConfig(P.getDefaultConfig());
{
  const d = P.calcDeal({ vehicles: 20, users: 0, selected: { tracking: true, fuel: true }, hardware: { items: { extra: {}, installSel: {} } }, implementation: {}, rental: {} });
  const json = JSON.stringify(d.clientQuote);
  const banned = ['marginalCost', 'targetGM', 'stepThreshold', 'stepCost', 'contribution', 'grossMargin', 'floor50', 'floor60'];
  const leaked = banned.filter((k) => json.includes(k));
  check('clientQuote contains no cost/margin keys', leaked.length === 0, leaked.join(','));
  check('internalMargin DOES contain margin data (sanity)', JSON.stringify(d.internalMargin).includes('grossMargin'));
}

console.log('\n=== H2. Client HARDWARE options / input / projection ===');
P.setConfig(P.getDefaultConfig());
{
  const opt = P.clientHardwareOptions();
  const ids = opt.hardware.map((h) => h.id);
  check('options expose the wired hardware rows', ['djHandset', 'smHandset', 'printer', 'vehicleGps', 'trailerGps', 'fuelKitSingle', 'fuelKitDual'].every((i) => ids.includes(i)), ids.join(','));
  check('options expose every extra catalog item', ids.includes('cat:streamax3cam'));
  check('option rows carry a positive unit price', opt.hardware.every((h) => h.unitPrice > 0));
  const iids = opt.install.map((h) => h.id);
  check('options expose the wired install rows', ['gpsInstall', 'fuelKitSingleInst', 'fuelKitDualInst', 'trailerInstall'].every((i) => iids.includes(i)), iids.join(','));
  check('options expose configured install items', iids.includes('inst:cameraInstall'));
  check('options expose the intl shipping rate', opt.intlShippingSurcharge === 0.20, String(opt.intlShippingSurcharge));

  // A newly added catalog item must surface automatically (config-driven, not hardcoded).
  const cfg = P.getDefaultConfig();
  cfg.hardwareCatalog.qaWidget = { sku: 'QA Widget', cost: 1000 };
  P.setConfig(cfg);
  check('catalog item added in Config appears as an option',
    P.clientHardwareOptions().hardware.some((h) => h.id === 'cat:qaWidget'));
  P.setConfig(P.getDefaultConfig());

  const proj = (sel) => P.clientHardwareProjection(P.calcHardware(P.clientHardwareInput(sel)));
  const sel = { outsideSA: false, hardware: { vehicleGps: 10, 'cat:streamax3cam': 2 }, install: { gpsInstall: 10 } };
  const local = proj(sel);
  const hwExpect = 10 * 798.75 + 2 * 10890;
  check('hardware subtotal = qty x unit sell', local.hardwareSubtotal === hwExpect, `${local.hardwareSubtotal} vs ${hwExpect}`);
  check('install subtotal = qty x rate', local.installSubtotal === 8000, String(local.installSubtotal));
  check('once-off total = hardware + install', local.onceOffTotal === hwExpect + 8000, String(local.onceOffTotal));
  check('no shipping surcharge inside SA', local.shippingSurcharge === 0);
  check('only selected rows are returned', local.rows.length === 2 && local.install.length === 1);

  const intl = proj({ ...sel, outsideSA: true });
  check('intl surcharge = 20% of hardware subtotal', Math.abs(intl.shippingSurcharge - hwExpect * 0.20) < 1e-9, String(intl.shippingSurcharge));
  check('intl surcharge does NOT apply to labour', intl.installSubtotal === local.installSubtotal);
  check('intl once-off = hardware x1.2 + install', Math.abs(intl.onceOffTotal - (hwExpect * 1.2 + 8000)) < 1e-9, String(intl.onceOffTotal));
  check('projection reports the rate it applied', intl.shippingRate === 0.20 && intl.outsideSA === true);

  // zero / absent / hostile selections must not throw or invent charges
  check('empty selection = zero once-off', proj({}).onceOffTotal === 0);
  check('zero quantities = no rows', proj({ hardware: { vehicleGps: 0 } }).rows.length === 0);
  check('negative quantity clamped to zero', proj({ hardware: { vehicleGps: -5 } }).onceOffTotal === 0);
  check('non-numeric quantity ignored', proj({ hardware: { vehicleGps: 'abc' } }).onceOffTotal === 0);
  check('unknown row id ignored', proj({ hardware: { nonsense: 99 } }).onceOffTotal === 0);
  check('null selection does not throw', proj(null).onceOffTotal === 0);
  check('outsideSA with nothing selected adds nothing', proj({ outsideSA: true }).shippingSurcharge === 0);

  // quantities are explicit: fleet size must not leak into a client hardware quote
  check('fleet size does not drive client hardware qty',
    proj({ hardware: { vehicleGps: 3 } }).rows[0].qty === 3);

  const banned = ['marginalCost', 'targetGM', 'stepThreshold', 'stepCost', 'contribution', 'grossMargin', '"cost"', 'markup'];
  const leaked = banned.filter((k) => JSON.stringify(intl).includes(k));
  check('hardware projection leaks no cost/margin keys', leaked.length === 0, leaked.join(','));
  const optLeaked = banned.filter((k) => JSON.stringify(P.clientHardwareOptions()).includes(k));
  check('hardware options leak no cost/margin keys', optLeaked.length === 0, optLeaked.join(','));
}

console.log('\n=== H3. Scenario planner (calcScenario) ===');
P.setConfig(P.getDefaultConfig());
{
  const base = { vehicles: 120, users: 0, selected: { tracking: true, fuel: true, routeBuilder: true } };
  const scn = (o) => P.calcScenario({ ...base, ...o });
  const row = (s, k) => s.rows.find((r) => r.key === k);

  // 1. With no overrides the scenario must agree with the real quote exactly —
  //    otherwise the planner is modelling something the business doesn't sell.
  const auto = scn({});
  const sub = P.calcSubscription(base);
  const mar = P.calcInternalMargin(sub);
  check('auto scenario revenue == calcSubscription total',
    Math.abs(auto.totalRevenue - sub.totalMonthly) < 1e-9, `${auto.totalRevenue} vs ${sub.totalMonthly}`);
  check('auto scenario GM == calcInternalMargin GM',
    Math.abs(auto.totalGrossMargin - mar.totalGrossMargin) < 1e-9,
    `${auto.totalGrossMargin} vs ${mar.totalGrossMargin}`);
  check('auto scenario per-product price == quote effective price',
    auto.rows.every((r) => Math.abs(r.effectivePrice - sub.lines.find((l) => l.key === r.key).effectivePrice) < 1e-9));

  // 2. The headline use case: the client names a price.
  const pinned = scn({ productOverride: { tracking: { price: 200 } } });
  const t = row(pinned, 'tracking');
  check('price override is used verbatim', t.effectivePrice === 200);
  check('price override reports its source', t.source === 'price');
  check('price override derives the implied discount',
    Math.abs(t.discount - (1 - 200 / t.listPrice)) < 1e-12, String(t.discount));
  check('price override GM = (price - cost) / price',
    Math.abs(t.grossMargin - (200 - 83) / 200) < 1e-12, String(t.grossMargin));
  check('price override leaves other products on schedule',
    row(pinned, 'fuel').source === 'auto');

  // 3. Discount override, and price winning over it.
  const d = row(scn({ productOverride: { tracking: { discount: 0.25 } } }), 'tracking');
  check('discount override applies to LIST, not to the schedule price',
    Math.abs(d.effectivePrice - d.listPrice * 0.75) < 1e-12, String(d.effectivePrice));
  const both = row(scn({ productOverride: { tracking: { price: 190, discount: 0.9 } } }), 'tracking');
  check('price beats discount when both are set', both.effectivePrice === 190);

  // 4. Bundle / volume overrides, and the empty-vs-zero distinction that makes
  //    "blank = use the schedule" work.
  const b0 = scn({ bundleOverride: 0, volumeOverride: 0 });
  check('explicit 0 discount means NO discount, not "auto"',
    b0.rows.every((r) => !r.selected || Math.abs(r.effectivePrice - r.listPrice) < 1e-12));
  check('explicit 0 is reported as an override', b0.bundle.overridden && b0.volume.overridden);
  const bNull = scn({ bundleOverride: null, volumeOverride: undefined });
  check('null/undefined fall back to the schedules',
    !bNull.bundle.overridden && bNull.bundle.discount === auto.bundle.auto);
  const b30 = scn({ bundleOverride: 0.30, volumeOverride: 0 });
  check('bundle override applies only to eligible products',
    b30.rows.every((r) => !r.selected || Math.abs(r.effectivePrice - r.listPrice * (r.bundleEligible ? 0.7 : 1)) < 1e-9));
  check('scenario still reports the schedule value it replaced',
    b30.bundle.auto === auto.bundle.auto && b30.bundle.discount === 0.30);

  // 5. Step costs — ignoring these gives a dangerously wrong answer at scale.
  const big = { vehicles: 700, users: 0, selected: { tracking: true } };
  const off = P.calcScenario(big), on = P.calcScenario({ ...big, includeStepCost: true });
  const ro = row(off, 'tracking'), rn = row(on, 'tracking');
  check('steps are counted even when not charged', ro.stepCount === 2 && ro.stepMonthly === 50000);
  check('step cost excluded by default', ro.monthlyCost === 83 * 700);
  check('step cost included when asked', rn.monthlyCost === 83 * 700 + 50000);
  check('including step cost lowers GM', rn.grossMargin < ro.grossMargin);
  check('revenue is unaffected by the step toggle', rn.revenue === ro.revenue);

  // 6. The negotiation floors must be exactly what they claim.
  const f = row(auto, 'tracking');
  check('breakeven == marginal cost', f.breakeven === 83);
  check('floor50 yields exactly 50% GM',
    Math.abs((f.floor50 - f.marginalCost) / f.floor50 - 0.5) < 1e-12);
  check('floor60 yields exactly 60% GM',
    Math.abs((f.floor60 - f.marginalCost) / f.floor60 - 0.6) < 1e-12);
  check('target price == list price (the product\'s own target GM)',
    f.targetPrice === f.listPrice);
  check('target price yields exactly the product target GM',
    Math.abs((f.targetPrice - f.marginalCost) / f.targetPrice - f.targetGM) < 1e-12);
  check('maxDiscount50 lands exactly on the 50% floor',
    Math.abs(f.listPrice * (1 - f.maxDiscount50) - f.floor50) < 1e-9);

  // 7. Deal-level floors must track whatever makes up the cost.
  for (const step of [false, true]) {
    const s = P.calcScenario({ ...big, selected: { tracking: true, fuel: true }, includeStepCost: step });
    check(`floor50Revenue is exactly 50% GM (step costs ${step ? 'on' : 'off'})`,
      Math.abs((s.floor50Revenue - s.totalCost) / s.floor50Revenue - 0.5) < 1e-12);
    check(`breakevenRevenue == total cost (step costs ${step ? 'on' : 'off'})`,
      s.breakevenRevenue === s.totalCost);
  }

  // 8. Status banding drives the colour a user makes a decision from.
  check('price below cost flags a loss',
    row(scn({ productOverride: { tracking: { price: 50 } } }), 'tracking').floorStatus === 'loss');
  check('price below the 50% floor is flagged',
    row(scn({ productOverride: { tracking: { price: 150 } } }), 'tracking').floorStatus === 'below50');
  check('price between the floors is flagged below60',
    row(scn({ productOverride: { tracking: { price: 190 } } }), 'tracking').floorStatus === 'below60');
  check('a healthy price is flagged healthy',
    row(scn({ productOverride: { tracking: { price: 260 } } }), 'tracking').floorStatus === 'healthy');
  check('unselected products are n/a',
    row(scn({ selected: { tracking: true } }), 'fuel').floorStatus === 'n/a');

  // 9. Unselected products must not move any total.
  const one = scn({ selected: { tracking: true } });
  check('unselected products contribute no revenue or cost',
    one.rows.filter((r) => !r.selected).every((r) => r.revenue === 0 && r.monthlyCost === 0));
  check('totals count only selected products',
    Math.abs(one.totalRevenue - row(one, 'tracking').revenue) < 1e-9);

  // 10. Hostile / empty input must not throw or invent money.
  const bad = [
    ['no input', undefined],
    ['empty object', {}],
    ['negative fleet', { vehicles: -50, selected: { tracking: true } }],
    ['string fleet', { vehicles: 'abc', selected: { tracking: true } }],
    ['null selected', { vehicles: 10, selected: null }],
    ['productOverride not an object', { vehicles: 10, selected: { tracking: true }, productOverride: 'nope' }],
    ['negative price', { vehicles: 10, selected: { tracking: true }, productOverride: { tracking: { price: -99 } } }],
    ['string price', { vehicles: 10, selected: { tracking: true }, productOverride: { tracking: { price: 'free' } } }],
    ['unknown product key', { vehicles: 10, selected: { tracking: true }, productOverride: { nope: { price: 5 } } }],
    ['discount over 100%', { vehicles: 10, selected: { tracking: true }, productOverride: { tracking: { discount: 5 } } }],
  ];
  for (const [label, input] of bad) {
    let ok = false;
    try {
      const s = P.calcScenario(input);
      ok = Number.isFinite(s.totalRevenue) && Number.isFinite(s.totalGrossMargin) && s.totalRevenue >= 0;
    } catch (e) { ok = false; }
    check(`calcScenario survives ${label}`, ok);
  }

  // 11. The planner is INTERNAL — but it must not corrupt the shared config,
  //     which every client-facing surface also reads.
  const before = JSON.stringify(P.getConfig());
  scn({ bundleOverride: 0.9, productOverride: { tracking: { price: 1 } }, includeStepCost: true });
  check('calcScenario does not mutate the active config', JSON.stringify(P.getConfig()) === before);
}

console.log('\n=== I. Cross-backend projection parity (server.js vs functions/_shared.js) ===');
{
  // Compare the two hand-written clientPriceList implementations field-by-field.
  const path = require('path');
  const srvSrc = require('fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const fnSrc = require('fs').readFileSync(path.join(__dirname, '..', 'functions', '_shared.js'), 'utf8');
  // Match either `field,` (shorthand) or `field:` (explicit) in each backend.
  const has = (src, f) => new RegExp('\\b' + f + '\\s*[,:]').test(src);
  const fields = ['products', 'bundle', 'volume', 'hardware', 'install', 'currency'];
  for (const f of fields) {
    check(`priceList field "${f}" in server.js`, has(srvSrc, f), '');
    check(`priceList field "${f}" in functions/_shared.js`, has(fnSrc, f), '');
  }
  const qFields = ['monthly', 'annual', 'perVehicle', 'discounts', 'notes'];
  for (const f of qFields) {
    check(`quoteProjection "${f}" in server.js`, has(srvSrc, f), '');
    check(`quoteProjection "${f}" in functions/_shared.js`, has(fnSrc, f), '');
  }
}

console.log(`\n================ ENGINE/ROBUSTNESS: ${pass} passed, ${fail} failed ================`);
if (findings.length) { console.log('\nFINDINGS:'); findings.forEach((f) => console.log(' -', f)); }
process.exit(fail > 0 ? 1 : 0);
