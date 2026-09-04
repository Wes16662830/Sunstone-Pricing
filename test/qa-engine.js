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
