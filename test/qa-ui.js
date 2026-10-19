/* QA suite — browser/UI functional tests (internal app + client pages).
 *
 * Requires a RUNNING server (see test/qa-api.js header) AND Playwright:
 *   npm run test:ui
 * Chromium path is taken from PW_CHROMIUM (default /opt/pw-browsers/chromium).
 * This is the only suite with an external dependency; `npm test` runs the
 * dependency-free suites (workbook + engine) only.
 */
'use strict';
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4200';
const STAFF = 'staffpw', CLIENT = 'clientpw';

let pass = 0, fail = 0; const findings = [];
function check(name, cond, detail) {
  if (cond) pass++; else { fail++; findings.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ FAIL:', name, detail || ''); }
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  // saveCurrent() uses prompt(); revoke/delete use confirm(). Handle both.
  p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'QA Round Trip' : ''));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errors.push('CONSOLE: ' + m.text()); });

  console.log('\n=== 1. Internal login + all tabs render ===');
  await p.goto(BASE + '/login');
  await p.fill('input[type=password]', STAFF);
  await p.click('button[type=submit]');
  await p.waitForURL('**/');
  const tabs = ['subscription', 'hardware', 'implementation', 'rental', 'quote', 'proposal', 'margin', 'config'];
  for (const t of tabs) {
    await p.click(`.tab[data-tab="${t}"]`);
    await p.waitForTimeout(120);
    const len = await p.$eval(`.panel[data-panel="${t}"]`, (el) => el.innerText.trim().length);
    check(`tab "${t}" renders content`, len > 50, `len=${len}`);
  }

  console.log('\n=== 2. Blank-slate defaults (regression for latest change) ===');
  await p.click('.tab[data-tab="subscription"]');
  const subChecked = await p.$$eval('#sub-tbody input[type=checkbox]:checked', (e) => e.length);
  check('no products pre-selected', subChecked === 0, `${subChecked} checked`);
  const monthly = await p.$eval('#sub-summary', (el) => el.innerText);
  check('zero-state totals show 0', /0\.00/.test(monthly), monthly.replace(/\s+/g, ' ').slice(0, 80));
  await p.click('.tab[data-tab="implementation"]');
  const implChecked = await p.$$eval('#impl-tbody input[data-f="enabled"]:checked', (e) => e.length);
  check('no implementation activities pre-enabled', implChecked === 0, `${implChecked} enabled`);

  console.log('\n=== 2b. Reported fixes (regressions) ===');
  // No default customer: a quote must not arrive pre-addressed to another client.
  check('customer name starts empty', (await p.inputValue('#in-customer')) === '',
    await p.inputValue('#in-customer'));
  // The old dev note under the handset dropdowns was a comment on the code.
  await p.click('.tab[data-tab="hardware"]');
  await p.waitForTimeout(200);
  const hwPanel = await p.$eval('.panel[data-panel="hardware"]', (e) => e.innerText);
  check('no code-commentary note on the hardware page', !/VLOOKUP|source workbook/i.test(hwPanel));
  // Implementation starts empty and is then suggested from the deal.
  await p.click('.tab[data-tab="implementation"]');
  await p.waitForTimeout(200);
  const implOn = () => p.locator('#impl-tbody input[data-f="enabled"]:checked').count();
  check('no activities enabled before anything is selected', (await implOn()) === 0, String(await implOn()));
  await p.click('.tab[data-tab="subscription"]');
  await p.locator('#sub-tbody tr').filter({ hasText: 'Fuel' }).first().locator('input[type=checkbox]').check();
  await p.waitForTimeout(500);
  await p.click('.tab[data-tab="implementation"]');
  await p.waitForTimeout(300);
  const suggested = await p.$$eval('#impl-tbody tr', (rs) => rs
    .filter((r) => r.querySelector('input[data-f=enabled]').checked)
    .map((r) => r.children[1].innerText));
  check('selecting a product suggests core activities', suggested.includes('Project Management'), suggested.join(','));
  check('selecting Fuel suggests its training', suggested.some((n) => /Training.*Fuel/.test(n)), suggested.join(','));
  check('training for unselected products stays off',
    !suggested.some((n) => /Training.*Stock Master/.test(n)), suggested.join(','));
  // A manual choice must survive a later product change — this is the trap in
  // auto-suggestion, and the reason activities carry a userSet flag.
  const rbTrain = p.locator('#impl-tbody tr').filter({ hasText: 'Route Builder' }).first().locator('input[data-f="enabled"]');
  await rbTrain.check();
  await p.waitForTimeout(300);
  await p.click('.tab[data-tab="subscription"]');
  await p.locator('#sub-tbody tr').filter({ hasText: 'Stock Master' }).first().locator('input[type=checkbox]').check();
  await p.waitForTimeout(500);
  await p.click('.tab[data-tab="implementation"]');
  await p.waitForTimeout(300);
  check('a manually ticked activity survives a later product change', await rbTrain.isChecked());
  await p.click('#impl-reset');
  await p.waitForTimeout(400);
  check('"Reset suggestions" hands control back to the deal', !(await rbTrain.isChecked()));
  // Fleet composition sanity warning, non-blocking.
  await p.click('.tab[data-tab="subscription"]');
  await p.fill('#in-vehicles', '10');
  await p.waitForTimeout(300);
  await p.click('.tab[data-tab="hardware"]');
  await p.waitForTimeout(250);
  await p.fill('#hw-single', '30');
  await p.dispatchEvent('#hw-single', 'change');
  await p.waitForTimeout(450);
  const fleetWarn = await p.$eval('#hw-fleet-warn', (e) => e.classList.contains('hidden') ? '' : e.innerText);
  check('over-assigning fuel-monitored vehicles warns', /exceeds/i.test(fleetWarn), fleetWarn.replace(/\n/g, ' '));
  check('the warning does not block the quote',
    (await p.$eval('#hw-totals', (e) => e.innerText)).length > 0);
  await p.fill('#hw-single', '5');
  await p.dispatchEvent('#hw-single', 'change');
  await p.waitForTimeout(400);
  check('warning clears once the figures are consistent',
    await p.$eval('#hw-fleet-warn', (e) => e.classList.contains('hidden')));
  // Clear all.
  await p.click('.tab[data-tab="subscription"]');
  await p.waitForTimeout(200);
  check('products are selected before Clear all',
    (await p.locator('#sub-tbody input[type=checkbox]:checked').count()) > 0);
  await p.click('#sub-clear');
  await p.waitForTimeout(400);
  check('Clear all unticks every product',
    (await p.locator('#sub-tbody input[type=checkbox]:checked').count()) === 0);
  check('Clear all leaves the fleet size alone', (await p.inputValue('#in-vehicles')) === '10');

  console.log('\n=== 2c. Currency labelling on money columns ===');
  // Table CELLS deliberately carry no symbol — a symbol on every row of a dense
  // numeric table is noise — so the HEADER is what tells the reader which
  // currency they are looking at, and it must follow the selector.
  const tags = () => p.$$eval('.cur-tag', (es) => es.map((e) => e.textContent.trim()));
  const zarTags = await tags();
  check('money headers carry a currency tag', zarTags.length >= 20, String(zarTags.length));
  check('every currency tag is filled in', zarTags.every((t) => t.length > 0),
    String(zarTags.filter((t) => !t).length) + ' empty');
  check('every currency tag agrees', new Set(zarTags).size === 1, [...new Set(zarTags)].join(' / '));
  check('the tag names the active currency', /ZAR/.test(zarTags[0]), zarTags[0]);
  await p.selectOption('#currency-select', 'USD');
  await p.waitForTimeout(500);
  const usdTags = await tags();
  check('currency tags follow the selector', usdTags.every((t) => /USD/.test(t)), [...new Set(usdTags)].join(' / '));
  check('the same number of columns stay labelled', usdTags.length === zarTags.length,
    `${zarTags.length} -> ${usdTags.length}`);
  await p.selectOption('#currency-select', 'ZAR');
  await p.waitForTimeout(500);

  // Marginal cost is per vehicle for some products and per user for others, so
  // the old "Marginal/lic" header was comparing figures that are not alike.
  await p.click('.tab[data-tab="margin"]');
  await p.waitForTimeout(300);
  const marginHead = await p.$eval('#margin-table thead', (e) => e.innerText);
  check('the margin column is no longer labelled "/lic"', !/\/lic/i.test(marginHead), marginHead.replace(/\n/g, ' '));
  check('the margin column says it is per unit', /per unit|\/ UNIT/i.test(marginHead), marginHead.replace(/\n/g, ' '));
  const marginRows = await p.$$eval('#margin-tbody tr', (rs) => rs.map((r) => r.innerText.replace(/\n/g, ' ')));
  check('each margin row states its billing basis',
    marginRows.some((r) => /per vehicle/.test(r)), marginRows[0]);
  const floorHead = await p.$eval('#margin-floor thead', (e) => e.innerText);
  check('the floor table also states the unit', /per unit|\/ UNIT/i.test(floorHead), floorHead.replace(/\n/g, ' '));
  await p.click('.tab[data-tab="subscription"]');
  await p.waitForTimeout(250);

  console.log('\n=== 3. Subscription selection drives totals ===');
  await p.click('.tab[data-tab="subscription"]');
  await p.fill('#in-vehicles', '20');
  await p.locator('#sub-tbody input[type=checkbox]').first().click();
  await p.waitForTimeout(250);
  const afterSel = await p.$eval('#sub-summary', (el) => el.innerText);
  check('selecting a product produces non-zero total', !/^0\.00$/.test(afterSel) && /[1-9]/.test(afterSel), afterSel.replace(/\s+/g, ' ').slice(0, 80));

  console.log('\n=== 4. Currency toggle propagates ===');
  const zarText = await p.$eval('#sub-summary', (el) => el.innerText);
  await p.selectOption('#currency-select', 'USD');
  await p.waitForTimeout(250);
  const usdText = await p.$eval('#sub-summary', (el) => el.innerText);
  check('currency switch changes displayed figures', zarText !== usdText);
  await p.selectOption('#currency-select', 'ZAR');
  await p.waitForTimeout(200);

  console.log('\n=== 5. Theme toggle + persistence ===');
  const t0 = await p.getAttribute('html', 'data-theme');
  await p.click('#btn-theme');
  const t1 = await p.getAttribute('html', 'data-theme');
  check('theme toggles', t0 !== t1, `${t0} -> ${t1}`);
  await p.reload();
  await p.waitForSelector('#btn-theme');
  const t2 = await p.getAttribute('html', 'data-theme');
  check('theme persists across reload', t2 === t1, `${t1} vs ${t2}`);

  console.log('\n=== 6. Presentation mode hides internal tabs ===');
  await p.click('#btn-present');
  await p.waitForTimeout(150);
  const marginHidden = await p.$eval('#tab-margin', (el) => el.classList.contains('hidden'));
  const configHidden = await p.$eval('#tab-config', (el) => el.classList.contains('hidden'));
  check('presentation hides Internal Margin tab', marginHidden);
  check('presentation hides Config tab', configHidden);
  await p.click('#btn-present');
  await p.waitForTimeout(150);
  const marginBack = await p.$eval('#tab-margin', (el) => !el.classList.contains('hidden'));
  check('presentation mode restores tabs', marginBack);

  console.log('\n=== 7. Hardware: all quantities editable (regression) ===');
  await p.click('.tab[data-tab="hardware"]');
  await p.waitForSelector('#hw-tbody tr');
  const qtyInputs = await p.$$eval('#hw-tbody input[type=number]', (e) => e.length);
  const hwRows = await p.$$eval('#hw-tbody tr', (e) => e.length);
  check('every hardware row has an editable qty', qtyInputs >= hwRows, `${qtyInputs} inputs / ${hwRows} rows`);
  // hardware-only quote with 0 vehicles
  await p.fill('#in-vehicles', '0');
  await p.waitForTimeout(150);
  await p.locator('#hw-tbody input[data-inc]').first().click();
  await p.waitForTimeout(250);
  const bq = p.locator('#hw-tbody input[data-base-qty]').first();
  await bq.fill('4'); await bq.dispatchEvent('change');
  await p.waitForTimeout(300);
  const hwTotal = await p.$eval('#hw-totals', (el) => el.innerText);
  check('hardware-only quote computes with 0 vehicles', /[1-9]/.test(hwTotal), hwTotal.replace(/\s+/g, ' ').slice(0, 90));
  await p.fill('#in-vehicles', '20');
  await p.waitForTimeout(150);

  console.log('\n=== 8. Save / load quote round-trip ===');
  await p.click('.tab[data-tab="subscription"]');
  await p.fill('#in-customer', 'QA Round Trip');
  await p.fill('#in-vehicles', '33');
  await p.waitForTimeout(200);
  await p.click('#drawer-toggle');
  await p.waitForTimeout(200);
  await p.click('#btn-save');
  await p.waitForTimeout(500);
  const savedStatus = await p.$eval('#save-status', (el) => el.innerText);
  check('quote saves', /saved/i.test(savedStatus), savedStatus);
  // start new, then reload saved
  await p.click('#btn-new');
  await p.waitForTimeout(300);
  const afterNew = await p.inputValue('#in-vehicles');
  check('new quote resets fleet size', afterNew !== '33', afterNew);
  await p.waitForTimeout(200);
  const itemsLoc = p.locator('#quote-list li .q-name');
  const itemCount = await itemsLoc.count();
  check('saved quote appears in drawer', itemCount > 0, `${itemCount} real items`);
  if (itemCount) {
    await itemsLoc.nth(0).click();   // handler lives on .q-name, not the <li>
    await p.waitForTimeout(500);
    const restored = await p.inputValue('#in-vehicles');
    const restoredName = await p.inputValue('#in-customer');
    check('loading restores fleet size', restored === '33', restored);
    check('loading restores customer name', restoredName === 'QA Round Trip', restoredName);
  }
  await p.click('#drawer-close');

  console.log('\n=== 9. Config: product reorder (regression) ===');
  await p.click('.tab[data-tab="config"]');
  await p.waitForSelector('#config-root table.data');
  const before = await p.$$eval('#config-root input[data-path^="products."][data-path$=".name"]', (e) => e.map((x) => x.value));
  const upsLoc = p.locator('button[data-move-up^="products:"]');
  const upCount = await upsLoc.count();
  check('reorder buttons present', upCount > 1, `${upCount}`);
  check('first row move-up is disabled', await upsLoc.nth(0).isDisabled());
  const downsLoc = p.locator('button[data-move-down^="products:"]');
  check('last row move-down is disabled', await downsLoc.nth((await downsLoc.count()) - 1).isDisabled());
  await upsLoc.nth(1).click();
  await p.waitForTimeout(250);
  const after = await p.$$eval('#config-root input[data-path^="products."][data-path$=".name"]', (e) => e.map((x) => x.value));
  check('move-up swaps rows', before[0] === after[1] && before[1] === after[0], `${before.slice(0,2)} -> ${after.slice(0,2)}`);
  // move back and verify order also drives Subscription tab
  await p.locator('button[data-move-down^="products:"]').nth(0).click();
  await p.waitForTimeout(250);
  const restoredOrder = await p.$$eval('#config-root input[data-path^="products."][data-path$=".name"]', (e) => e.map((x) => x.value));
  check('move-down restores original order', JSON.stringify(restoredOrder) === JSON.stringify(before), `${restoredOrder.slice(0,2)}`);

  console.log('\n=== 10. Config save persists ===');
  await p.locator('button[data-move-up^="products:"]').nth(1).click(); // reorder again
  await p.waitForTimeout(250);
  const reordered = await p.$$eval('#config-root input[data-path^="products."][data-path$=".name"]', (e) => e.map((x) => x.value));
  await p.click('#cfg-save');
  await p.waitForTimeout(700);
  const cfgStatus = await p.$eval('#config-status', (el) => el.innerText);
  check('config saves', /saved/i.test(cfgStatus), cfgStatus);
  await p.reload();
  await p.waitForSelector('.tab[data-tab="config"]');
  await p.click('.tab[data-tab="config"]');
  await p.waitForSelector('#config-root table.data');
  const afterReload = await p.$$eval('#config-root input[data-path^="products."][data-path$=".name"]', (e) => e.map((x) => x.value));
  check('reordered products persist after reload', JSON.stringify(afterReload) === JSON.stringify(reordered), `${afterReload.slice(0,2)} vs ${reordered.slice(0,2)}`);
  // subscription tab reflects same order
  await p.click('.tab[data-tab="subscription"]');
  await p.waitForTimeout(200);
  const subOrder = await p.$$eval('#sub-tbody tr td:nth-child(2)', (e) => e.map((x) => x.innerText.trim()));
  check('Subscription tab uses the configured product order', subOrder[0] === afterReload[0], `${subOrder[0]} vs ${afterReload[0]}`);

  console.log('\n=== 10b. Proposal = the standard template ===');
  await p.click('.tab[data-tab="subscription"]');
  await p.waitForTimeout(200);
  // clear every product so the document reads as the full generic suite
  const boxes = p.locator('#sub-tbody input[type=checkbox]');
  for (let i = 0; i < await boxes.count(); i++) {
    if (await boxes.nth(i).isChecked()) await boxes.nth(i).uncheck();
  }
  await p.fill('#in-customer', 'Trade Kings (Zim Kings)');
  await p.waitForTimeout(500);
  await p.click('.tab[data-tab="proposal"]');
  await p.waitForTimeout(600);
  const doc = () => p.$eval('#proposal-doc', (el) => el.innerText);
  let pd = await doc();
  // the fixed boilerplate must be present verbatim
  for (const phrase of [
    'ControlHub',
    'Integrated Logistics & Fleet Management Solution',
    'The Sunstone Product Suite',
    'The Control Hub Suite in a Day',
    'Integration, Delivery and Support',
    'Implementation Timeline',
    'Price List',
    'Commercial Notes',
    'Conclusion',
    'Execution Manager is supplied with Route Builder and is not separately licensed.',
    'All hardware to be delivered outside of South Africa',
    '+27 11 482 4768',
    '43B Edward Rubenstein Drive',
  ]) {
    // innerText returns RENDERED text and some headings are uppercased in CSS,
    // so compare case-insensitively.
    check(`proposal contains standard copy: "${phrase.slice(0, 42)}"`,
      pd.toLowerCase().includes(phrase.toLowerCase()));
  }
  check('proposal names the customer on the cover', /Submitted to:\s*Trade Kings \(Zim Kings\)/.test(pd));
  const mentions = (pd.match(/Trade Kings \(Zim Kings\)/g) || []).length;
  check('customer name is woven through the body, not just the cover', mentions >= 8, `${mentions} mentions`);
  check('no unreplaced client placeholder remains', !pd.includes('{CLIENT}') && !pd.includes('{INTL}'));
  const FULL_SUITE = ['1. Route Builder', '2. Digital Journey', '3. Fleet Pro', '4. Stock Master', '5. Yard Manager'];
  check('full suite shown when nothing is selected',
    FULL_SUITE.every((s) => pd.includes(s)), pd.slice(pd.indexOf('CONTENTS'), pd.indexOf('CONTENTS') + 220));
  // Every Fleet Pro module is described, not just the ones on the deal.
  // (Module headings are uppercased in CSS, so compare case-insensitively.)
  const pdLower = pd.toLowerCase();
  check('all three Fleet Pro modules described',
    ['Module 1 — Track & Trace', 'Module 2 — Fuel Control', 'Module 3 — Fleet View']
      .every((s) => pdLower.includes(s.toLowerCase())));

  // the price list must come from config, not from hardcoded copy
  const cfgPrices = await p.evaluate(() => {
    const c = P.getConfig();
    return {
      // Format with the app's own currency helper: Node and Chromium disagree
      // on en-ZA grouping, so formatting in the test would compare apples to pears.
      products: c.products.map((x) => ({ name: x.quoteLabel || x.name, price: cur(P.listPrice(x)) })),
      hardware: P.clientHardwareOptions().hardware.map((h) => h.desc),
      install: P.clientHardwareOptions().install.map((h) => h.desc),
      intl: P.clientHardwareOptions().intlShippingSurcharge,
    };
  });
  check('every configured product is priced in the proposal',
    cfgPrices.products.every((x) => pd.includes(x.name)), cfgPrices.products.map((x) => x.name).join(','));
  check('proposal prices match the engine list price',
    cfgPrices.products.every((x) => pd.includes(x.price)),
    cfgPrices.products.map((x) => x.price).join(','));
  check('every catalogue hardware item is listed', cfgPrices.hardware.every((d) => pd.includes(d)));
  check('every installation item is listed', cfgPrices.install.every((d) => pd.includes(d)));
  check('intl surcharge rate comes from config', pd.includes(`${cfgPrices.intl * 100}% international shipping`));
  check('open-ended volume tier reads as "+"', /2000\+ vehicles/.test(pd));
  check('whole percentages have no trailing decimal', !/\b\d+\.0%/.test(pd), (pd.match(/\b\d+\.0%/g) || []).join(','));

  // a proposal is client-facing: it must carry no cost or margin data
  const propHtml = await p.$eval('#proposal-doc', (el) => el.innerHTML);
  const propLeak = ['marginalCost', 'targetGM', 'stepThreshold', 'stepCost', 'grossMargin', 'hardwareMarkup']
    .filter((k) => propHtml.includes(k));
  check('proposal document leaks no cost/margin identifiers', propLeak.length === 0, propLeak.join(','));

  // REGRESSION: this is the GENERIC proposal. Ticking products on the deal
  // must NOT cut sections out of it — an earlier version narrowed the
  // narrative to the selected products, which is not the document the team
  // sends. Only the customer and the Price List may vary.
  const docBeforeSelect = pd;
  await p.click('.tab[data-tab="subscription"]');
  await p.waitForTimeout(200);
  const rbRow = p.locator('#sub-tbody tr').filter({ hasText: 'Route Builder' }).first();
  await rbRow.locator('input[type=checkbox]').check();
  await p.waitForTimeout(600);
  await p.click('.tab[data-tab="proposal"]');
  await p.waitForTimeout(600);
  pd = await doc();
  check('selecting a product does NOT drop any section', FULL_SUITE.every((s) => pd.includes(s)),
    FULL_SUITE.filter((s) => !pd.includes(s)).join(',') || 'all present');
  check('document is unchanged by product selection', pd === docBeforeSelect,
    pd.length === docBeforeSelect.length ? 'same length, differing text' : `${docBeforeSelect.length} -> ${pd.length} chars`);
  check('price list still lists all products', cfgPrices.products.every((x) => pd.includes(x.name)));
  check('customer name still interpolated', pd.includes('Trade Kings (Zim Kings)'));

  console.log('\n=== 10b2. Product selection from the margin table ===');
  // Scenario planning happens on this tab, so products can be picked here
  // rather than hopping back to Subscription. It is one shared selection, not
  // a copy — ticking in either place must show in both.
  await p.click('.tab[data-tab="subscription"]');
  await p.waitForTimeout(200);
  await p.click('#sub-clear');
  await p.waitForTimeout(400);
  await p.click('.tab[data-tab="margin"]');
  await p.waitForTimeout(400);
  const scnCount = () => p.locator('#scn-tbody tr').count();
  check('no scenario rows before anything is selected', (await scnCount()) === 0, String(await scnCount()));
  await p.locator('input[data-margin-sel="tracking"]').check();
  await p.waitForTimeout(500);
  check('ticking in the margin table selects the product', (await scnCount()) === 1, String(await scnCount()));
  check('focus stays on the box that was ticked',
    (await p.evaluate(() => document.activeElement && document.activeElement.dataset
      && document.activeElement.dataset.marginSel)) === 'tracking');
  await p.click('.tab[data-tab="subscription"]');
  await p.waitForTimeout(350);
  check('the Subscription tab shows the same selection',
    (await p.locator('#sub-tbody input[type=checkbox]:checked').count()) === 1);
  // and the other way round
  await p.locator('#sub-tbody tr').filter({ hasText: 'Route Builder' }).first().locator('input[type=checkbox]').check();
  await p.waitForTimeout(500);
  await p.click('.tab[data-tab="margin"]');
  await p.waitForTimeout(350);
  check('selecting on Subscription shows in the margin table',
    await p.locator('input[data-margin-sel="routeBuilder"]').isChecked());
  check('the planner picks up both products', (await scnCount()) === 2, String(await scnCount()));
  await p.locator('input[data-margin-sel="tracking"]').uncheck();
  await p.waitForTimeout(500);
  check('unticking in the margin table deselects', (await scnCount()) === 1, String(await scnCount()));
  const fleetBeforeClear = await p.inputValue('#in-vehicles');
  await p.click('#margin-clear');
  await p.waitForTimeout(500);
  check('Clear all on the margin tab clears the selection',
    (await p.locator('#margin-tbody input:checked').count()) === 0);
  check('Clear all here leaves the fleet size alone',
    (await p.inputValue('#in-vehicles')) === fleetBeforeClear,
    `${fleetBeforeClear} -> ${await p.inputValue('#in-vehicles')}`);

  console.log('\n=== 10c. Scenario planner (Internal Margin) ===');
  await p.click('.tab[data-tab="subscription"]');
  await p.waitForTimeout(200);
  await p.fill('#in-vehicles', '120');
  const scnBoxes = p.locator('#sub-tbody input[type=checkbox]');
  for (let i = 0; i < await scnBoxes.count(); i++) {
    if (!(await scnBoxes.nth(i).isChecked())) await scnBoxes.nth(i).check();
  }
  await p.waitForTimeout(500);
  await p.click('.tab[data-tab="margin"]');
  await p.waitForSelector('#scn-tbody tr');
  const gmNow = async () => Number((await p.$eval('#scn-summary .scn-tile-lead b', (e) => e.innerText)).replace(/[^0-9.]/g, ''));
  const revNow = async () => Number((await p.$eval('#scn-summary .scn-tile:nth-child(2) b', (e) => e.innerText)).replace(/[^0-9.]/g, ''));

  const gmAuto = await gmNow();
  check('scenario planner renders a blended GM', gmAuto > 0 && gmAuto < 100, String(gmAuto));
  const scnRows = await p.locator('#scn-tbody tr').count();
  check('one scenario row per selected product', scnRows === 5, String(scnRows));

  // The headline use case: type the price the client will pay.
  await p.locator('input[data-scn-price="tracking"]').fill('200');
  await p.waitForTimeout(450);
  const gmPriced = await gmNow();
  check('naming a client price lowers blended GM', gmPriced < gmAuto, `${gmAuto} -> ${gmPriced}`);
  check('the named price is held in its input',
    (await p.inputValue('input[data-scn-price="tracking"]')) === '200');
  // Find the row by product name: an earlier test reorders the config, so row
  // position is not stable.
  const trkRow = await p.locator('#scn-tbody tr').filter({ hasText: 'Tracking' }).first().innerText();
  check('revenue follows the named price', /24[,.]000/.test(trkRow), trkRow.replace(/\n/g, ' '));
  check('a thin margin is flagged', /Below|Loss/i.test(trkRow), trkRow.replace(/\n/g, ' '));

  // Discount and price are two views of one number — setting one clears the other.
  await p.locator('input[data-scn-disc="tracking"]').fill('25');
  await p.waitForTimeout(450);
  check('setting a discount clears the price override',
    (await p.inputValue('input[data-scn-price="tracking"]')) === '');
  const gmDisc = await gmNow();
  check('discount override changes GM', gmDisc !== gmAuto, `${gmAuto} vs ${gmDisc}`);

  // Work back from a price the client has named.
  const tgtBox = p.locator('#scn-tgt-amt');
  await tgtBox.click();
  for (const ch of '400') { await p.keyboard.type(ch); await p.waitForTimeout(140); }
  await p.waitForTimeout(500);
  check('the target amount can be typed without losing the box',
    (await tgtBox.inputValue()) === '400', await tgtBox.inputValue());
  const verdict = () => p.$eval('.tgt-verdict', (e) => e.innerText.replace(/\n/g, ' '));
  check('a per-vehicle target is multiplied by the fleet', /48[,.]000/.test(await verdict()), await verdict());
  const tgtRows = () => p.$$eval('#scn-tgt-out tbody tr', (rs) => rs.map((r) =>
    [...r.querySelectorAll('td')].map((t) => t.innerText.split('\n')[0].trim())));

  // Cost basis: one GM for every product. List basis: one discount for every product.
  const costRows = await tgtRows();
  const costGMs = costRows.map((r) => r[6]);
  check('cost basis gives every product the same GM', new Set(costGMs).size === 1, costGMs.join(','));
  await p.selectOption('#scn-tgt-basis', 'list');
  await p.waitForTimeout(500);
  const listRows = await tgtRows();
  const listDiscs = listRows.map((r) => r[4]);
  check('list basis gives every product the same discount', new Set(listDiscs).size === 1, listDiscs.join(','));
  check('list basis leaves GM differing by product',
    new Set(listRows.map((r) => r[6])).size > 1, listRows.map((r) => r[6]).join(','));

  // The whole-bill mode.
  await p.selectOption('#scn-tgt-mode', 'total');
  await p.waitForTimeout(400);
  await tgtBox.fill('48000');
  await p.waitForTimeout(500);
  check('a total target is used as given', /48[,.]000/.test(await verdict()), await verdict());

  // Applying writes the allocation into the per-product table.
  await p.selectOption('#scn-tgt-basis', 'cost');
  await p.waitForTimeout(400);
  await p.click('#scn-tgt-apply');
  await p.waitForTimeout(700);
  const appliedPrice = await p.inputValue('input[data-scn-price="tracking"]');
  check('Apply writes the allocated unit price into the table',
    Number(appliedPrice) > 0, appliedPrice);
  const appliedGm = Number((await p.$eval('#scn-summary .scn-tile-lead b', (e) => e.innerText)).replace(/[^0-9.]/g, ''));
  check('the applied scenario reaches the target margin', appliedGm > 0 && appliedGm < 100, String(appliedGm));
  const appliedRev = Number((await p.$eval('#scn-summary .scn-tile:nth-child(2) b', (e) => e.innerText)).replace(/[^0-9.]/g, ''));
  check('the applied scenario bills exactly the target', Math.abs(appliedRev - 48000) < 1, String(appliedRev));

  // The target box is money, so it obeys the display currency like everything else.
  await p.selectOption('#currency-select', 'USD');
  await p.waitForTimeout(800);
  const usdTarget = Number(await tgtBox.inputValue());
  check('the target amount converts with the display currency',
    usdTarget > 0 && usdTarget < 48000, String(usdTarget));
  await p.selectOption('#currency-select', 'ZAR');
  await p.waitForTimeout(800);
  check('the target is stored in ZAR', Math.abs(Number(await tgtBox.inputValue()) - 48000) < 1,
    await tgtBox.inputValue());
  await p.click('#scn-reset');
  await p.waitForTimeout(450);
  check('reset clears the target too', (await tgtBox.inputValue()) === '', await tgtBox.inputValue());

  // REGRESSION: the rows used to be rebuilt on every keystroke, which destroyed
  // the input being typed in — focus was lost and only the first digit landed.
  await p.click('#scn-reset');
  await p.waitForTimeout(400);
  const priceBox = p.locator('input[data-scn-price="tracking"]');
  await priceBox.click();
  for (const ch of '237') { await p.keyboard.type(ch); await p.waitForTimeout(150); }
  await p.waitForTimeout(400);
  check('a multi-digit price can be typed without losing the box',
    (await priceBox.inputValue()) === '237', await priceBox.inputValue());
  check('the price input keeps focus while typing',
    await priceBox.evaluate((el) => el === document.activeElement));

  // Prices are per unit, and in the DISPLAY currency — the engine works in ZAR,
  // so a figure typed under USD must be read as USD, not as Rands.
  const trkPriceRow = () => p.locator('#scn-tbody tr').filter({ hasText: 'Tracking' }).first().innerText();
  const zarRow = await trkPriceRow();
  check('revenue is unit price x quantity', /28[,.]440/.test(zarRow), zarRow.replace(/\n/g, ' '));
  await p.selectOption('#currency-select', 'USD');
  await p.waitForTimeout(700);
  const usdShown = Number(await priceBox.inputValue());
  check('switching currency converts the price shown', usdShown > 0 && usdShown < 237, String(usdShown));
  await priceBox.fill('100');
  await p.waitForTimeout(500);
  const usdRow = await trkPriceRow();
  check('a price typed under USD is read as USD', /12[,.]000/.test(usdRow), usdRow.replace(/\n/g, ' '));
  await p.selectOption('#currency-select', 'ZAR');
  await p.waitForTimeout(700);
  const backInZar = Number(await priceBox.inputValue());
  check('the stored price is held in ZAR, not the display currency',
    backInZar > 1000, String(backInZar));
  check('headers state the per-unit basis',
    /\/unit/.test(await p.$eval('#scn-table thead', (e) => e.innerText)));
  check('the planner names the currency being typed in',
    /per unit/i.test(await p.$eval('#scn-unit-note', (e) => e.innerText)));
  await p.click('#scn-reset');
  await p.waitForTimeout(400);
  // Put the override back: the pin test below expects a scenario that differs
  // from schedule pricing, otherwise there is nothing for it to record.
  await p.locator('input[data-scn-disc="tracking"]').fill('25');
  await p.waitForTimeout(450);

  // NO MIXED CURRENCIES. Every money figure on the planner — table cells,
  // summary tiles, negotiation floors, the editable price box and the pinned
  // descriptions — must re-express together when the display currency changes.
  // One figure left in Rands beside converted ones is the bug this guards.
  await p.locator('input[data-scn-price="tracking"]').fill('200');
  await p.waitForTimeout(500);
  const moneyCells = async () => p.evaluate(() => {
    const n = (t) => Number(String(t).replace(/[^0-9.\-]/g, '')) || 0;
    const out = [];
    document.querySelectorAll('#scn-tbody tr').forEach((r) => {
      const td = [...r.querySelectorAll('td')];
      [2, 5, 6, 7].forEach((i) => td[i] && out.push(n(td[i].innerText.split('\n')[0])));
    });
    document.querySelectorAll('#scn-summary .scn-tile b').forEach((e) => {
      if (!/%/.test(e.innerText)) out.push(n(e.innerText));
    });
    document.querySelectorAll('#scn-floors-tbody tr').forEach((r) => {
      const td = [...r.querySelectorAll('td')];
      [1, 2, 3, 4, 5].forEach((i) => td[i] && out.push(n(td[i].innerText)));
    });
    out.push(n(document.querySelector('input[data-scn-price="tracking"]').value));
    return out;
  });
  const inZar = await moneyCells();
  await p.selectOption('#currency-select', 'USD');
  await p.waitForTimeout(800);
  const inUsd = await moneyCells();
  check('the same money figures are shown in both currencies', inZar.length === inUsd.length,
    `${inZar.length} vs ${inUsd.length}`);
  const ratios = inZar.map((v, i) => (v && inUsd[i]) ? v / inUsd[i] : null).filter((r) => r !== null);
  check('every money figure converts, none left behind', ratios.length > 10, String(ratios.length));
  const spread = Math.max(...ratios) - Math.min(...ratios);
  check('all money figures share ONE exchange rate (no mixing)', spread < 0.05,
    `rates ${Math.min(...ratios).toFixed(2)}..${Math.max(...ratios).toFixed(2)}`);
  // Percentages are ratios and must NOT move with the currency.
  const gmUsd = await p.$eval('#scn-summary .scn-tile-lead b', (e) => e.innerText);
  await p.selectOption('#currency-select', 'ZAR');
  await p.waitForTimeout(800);
  check('gross margin is unchanged by the display currency',
    (await p.$eval('#scn-summary .scn-tile-lead b', (e) => e.innerText)) === gmUsd, gmUsd);
  await p.click('#scn-reset');
  await p.waitForTimeout(400);
  await p.locator('input[data-scn-disc="tracking"]').fill('25');
  await p.waitForTimeout(450);

  // Pin it, so scenarios can be compared.
  await p.click('#scn-pin');
  await p.waitForTimeout(500);
  check('pinned scenario is listed', (await p.locator('#scn-pinned-tbody tr').count()) === 1);
  const pinTxt = await p.$eval('#scn-pinned-tbody', (e) => e.innerText);
  check('pinned row records what made it different', /Tracking/.test(pinTxt), pinTxt.replace(/\n/g, ' '));
  // A pinned description must not freeze the symbol it was created under.
  await p.locator('input[data-scn-price="fuel"]').fill('250');
  await p.waitForTimeout(450);
  await p.click('#scn-pin');
  await p.waitForTimeout(500);
  const pinZar = await p.$eval('#scn-pinned-tbody', (e) => e.innerText);
  await p.selectOption('#currency-select', 'USD');
  await p.waitForTimeout(800);
  const pinUsd = await p.$eval('#scn-pinned-tbody', (e) => e.innerText);
  check('a pinned price is described in Rands under ZAR', /R\s*250/.test(pinZar), pinZar.replace(/\n/g, ' ').slice(0, 120));
  check('the same pin is described in dollars under USD',
    /\$/.test(pinUsd) && !/R\s*250/.test(pinUsd), pinUsd.replace(/\n/g, ' ').slice(0, 120));
  await p.selectOption('#currency-select', 'ZAR');
  await p.waitForTimeout(700);

  // Reset returns to schedule pricing but keeps the pins.
  const pinsBeforeReset = await p.locator('#scn-pinned-tbody tr').count();
  await p.click('#scn-reset');
  await p.waitForTimeout(450);
  check('reset restores the schedule GM', Math.abs((await gmNow()) - gmAuto) < 0.05, `${await gmNow()} vs ${gmAuto}`);
  check('reset clears the per-product inputs',
    (await p.inputValue('input[data-scn-disc="tracking"]')) === '');
  check('reset keeps pinned scenarios',
    (await p.locator('#scn-pinned-tbody tr').count()) === pinsBeforeReset,
    `${pinsBeforeReset} -> ${await p.locator('#scn-pinned-tbody tr').count()}`);

  // Step costs are the thing that quietly ruins a big deal.
  await p.click('.tab[data-tab="subscription"]');
  await p.fill('#in-vehicles', '700');
  await p.waitForTimeout(450);
  await p.click('.tab[data-tab="margin"]');
  await p.waitForTimeout(450);
  const gmBigOff = await gmNow(), revBig = await revNow();
  await p.check('#scn-step');
  await p.waitForTimeout(500);
  const gmBigOn = await gmNow();
  check('including step costs lowers GM at scale', gmBigOn < gmBigOff, `${gmBigOff} -> ${gmBigOn}`);
  check('including step costs does not change revenue', Math.abs((await revNow()) - revBig) < 1, String(revBig));

  // Negotiation floors table
  const floors = await p.$eval('#scn-floors-tbody', (e) => e.innerText);
  check('floors table lists the negotiation prices', /\d/.test(floors) && floors.split('\n').length >= 1);

  // The planner is a sandbox: it must not leak into anything client-facing.
  await p.click('.tab[data-tab="quote"]');
  await p.waitForTimeout(400);
  const quoteTxt = await p.$eval('.panel[data-panel="quote"]', (e) => e.innerText);
  for (const k of ['Breakeven', 'GM %', 'Contribution', 'Marginal']) {
    check(`client quote tab shows no "${k}"`, !quoteTxt.includes(k));
  }
  await p.click('.tab[data-tab="margin"]');
  await p.waitForTimeout(300);
  await p.uncheck('#scn-step');
  await p.waitForTimeout(300);

  console.log('\n=== 11. Client links UI lifecycle ===');
  await p.click('.tab[data-tab="config"]');
  await p.waitForSelector('#link-create');
  await p.fill('#link-label', 'QA UI Client');
  await p.click('#link-create');
  await p.waitForTimeout(500);
  const linkUrl = await p.$eval('#link-tbody tr td input[readonly]', (el) => el.value);
  check('created link URL well-formed', /\/client-access\?token=[0-9a-f]{32,}/.test(linkUrl), linkUrl);
  const statusTxt = await p.$eval('#link-tbody tr td:nth-child(4)', (el) => el.innerText.trim());
  check('new link shows active', /active/i.test(statusTxt), statusTxt);

  console.log('\n=== 12. External client via magic link (fresh context) ===');
  const cctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  const cp = await cctx.newPage();
  const cerr = [];
  cp.on('pageerror', (e) => cerr.push('PAGEERR: ' + e.message));
  await cp.goto(linkUrl);
  await cp.waitForURL('**/quote', { timeout: 8000 });
  check('magic link lands on /quote signed in', /\/quote$/.test(cp.url()), cp.url());
  await cp.waitForSelector('#product-list .prod');
  // client builds a quote
  await cp.fill('#in-vehicles', '50');
  await cp.locator('#product-list input[type=checkbox]').first().click();
  await cp.waitForTimeout(600);
  const cMonthly = await cp.$eval('#r-monthly', (el) => el.innerText);
  check('client quote shows a price', /[1-9]/.test(cMonthly), cMonthly);
  // client picks hardware + installation, then flips on international delivery
  await cp.waitForSelector('#hardware-list input[data-group="hardware"]');
  const hwOptCount = await cp.locator('#hardware-list input[data-group="hardware"]').count();
  const instOptCount = await cp.locator('#install-list input[data-group="install"]').count();
  check('client page offers hardware options', hwOptCount > 0, String(hwOptCount));
  check('client page offers installation options', instOptCount > 0, String(instOptCount));
  check('hardware summary hidden until something is picked',
    (await cp.$eval('#r-hardware', (el) => el.innerText.trim())) === '');
  // Equipment and installation are separate choices, and a client who has not
  // bought from us before will not know that. Prompt them when it applies.
  const cNudge = async () => cp.$eval('#install-nudge', (e) => e.hidden ? '' : e.innerText);
  check('no install prompt before equipment is picked', (await cNudge()) === '');
  await cp.locator('#hardware-list input[data-group="hardware"]').first().fill('4');
  await cp.waitForTimeout(600);
  check('equipment with no installation prompts the client',
    /installation/i.test(await cNudge()), (await cNudge()).slice(0, 90));
  check('installation group says what it is for',
    /fitting/i.test(await cp.$eval('#install-list .hgroup', (e) => e.innerText)));
  await cp.locator('#install-list input[data-group="install"]').first().fill('4');
  await cp.waitForTimeout(600);
  check('the prompt clears once installation is added', (await cNudge()) === '');
  await cp.locator('#install-list input[data-group="install"]').first().fill('');
  await cp.waitForTimeout(500);
  const onceOff = await cp.$eval('#r-hardware', (el) => el.innerText);
  check('once-off total appears after picking hardware', /Once-off/i.test(onceOff), onceOff.slice(0, 80));
  const money = (s) => Number(String(s).replace(/[^0-9.]/g, ''));
  const beforeIntl = money((await cp.$eval('#r-hardware', (el) => el.innerText)).split('\n').pop());
  await cp.check('#in-intl');
  await cp.waitForTimeout(600);
  const intlTxt = await cp.$eval('#r-hardware', (el) => el.innerText);
  const afterIntl = money(intlTxt.split('\n').pop());
  check('international delivery adds a shipping line', /shipping/i.test(intlTxt), intlTxt.slice(0, 120));
  check('international delivery raises the once-off total', afterIntl > beforeIntl, `${beforeIntl} -> ${afterIntl}`);
  // the printable quote must carry hardware too
  const docHtml = await cp.$eval('#quote-doc', (el) => el.innerHTML);
  check('printable quote includes a hardware section', /Hardware &amp; Installation|Hardware & Installation/.test(docHtml));
  check('printable quote includes the shipping line', /shipping/i.test(docHtml));
  // client page must not expose internal data
  const html = await cp.content();
  const leaked = ['marginalCost', 'targetGM', 'stepThreshold'].filter((k) => html.includes(k));
  check('client /quote page HTML has no cost/margin identifiers', leaked.length === 0, leaked.join(','));
  // price list
  await cp.goto(BASE + '/prices');
  await cp.waitForSelector('#tbl-products tr');
  const prodRows = await cp.$$eval('#tbl-products tr', (e) => e.length);
  const hwRows2 = await cp.$$eval('#tbl-hardware tr', (e) => e.length);
  const bundleRows = await cp.$$eval('#tbl-bundle tr', (e) => e.length);
  const volRows = await cp.$$eval('#tbl-volume tr', (e) => e.length);
  check('price list shows products', prodRows > 0, String(prodRows));
  check('price list shows hardware', hwRows2 > 0, String(hwRows2));
  check('price list shows bundle tiers', bundleRows > 0, String(bundleRows));
  check('price list shows volume tiers', volRows > 0, String(volRows));
  // currency toggle on price list
  const pz = await cp.$eval('#tbl-products tr td.num', (el) => el.innerText);
  await cp.selectOption('#currency', 'USD');
  await cp.waitForTimeout(300);
  const pu = await cp.$eval('#tbl-products tr td.num', (el) => el.innerText);
  check('price list currency conversion works', pz !== pu, `${pz} -> ${pu}`);
  check('no client-side JS errors', cerr.length === 0, cerr.join(' | '));

  console.log('\n=== 13. Client cannot reach internal app in browser ===');
  await cp.goto(BASE + '/');
  await cp.waitForTimeout(400);
  check('client redirected away from internal app', /login/.test(cp.url()), cp.url());

  console.log('\n=== 14. Revoke kills new redemptions ===');
  await p.click('.tab[data-tab="config"]');
  await p.waitForSelector('#link-create');
  await p.locator('button[data-link-revoke]').first().click();
  await p.waitForTimeout(700);
  const statusAfter = await p.$eval('#link-tbody tr td:nth-child(4)', (el) => el.innerText.trim());
  check('link shows revoked', /revoked/i.test(statusAfter), statusAfter);
  const fctx = await b.newContext();
  const fp = await fctx.newPage();
  await fp.goto(linkUrl);
  await fp.waitForTimeout(400);
  check('revoked link no longer signs in', /quote-login/.test(fp.url()), fp.url());

  console.log('\n=== 15. Reactivating a revoked link ===');
  await p.waitForSelector('button[data-link-restore]');
  await p.locator('button[data-link-restore]').first().click();
  await p.waitForTimeout(700);
  const statusReactivated = await p.$eval('#link-tbody tr td:nth-child(4)', (el) => el.innerText.trim());
  check('link shows active again', /active/i.test(statusReactivated), statusReactivated);
  const rctx = await b.newContext();
  const rp = await rctx.newPage();
  await rp.goto(linkUrl);
  await rp.waitForTimeout(600);
  check('the SAME url signs in again after reactivation', /\/quote$/.test(rp.url()), rp.url());

  console.log('\n=== 16. Deleting a link permanently ===');
  await p.click('#link-create');           // a second link, so we delete one and keep one
  await p.waitForTimeout(700);
  const rowsBefore = await p.locator('#link-tbody tr').count();
  // Delete the row holding OUR link specifically — rows are newest-first, so
  // "first" would hit the one just created, not the one we then check is dead.
  const targetId = await p.locator('#link-tbody tr').evaluateAll((rows, u) => {
    const row = rows.find((r) => (r.querySelector('input[readonly]') || {}).value === u);
    return row ? row.querySelector('button[data-link-delete]').dataset.linkDelete : null;
  }, linkUrl);
  check('found the row for our link', !!targetId);
  await p.locator(`button[data-link-delete="${targetId}"]`).click();
  await p.waitForTimeout(700);
  const rowsAfter = await p.locator('#link-tbody tr').count();
  check('deleted link disappears from the list', rowsAfter === rowsBefore - 1, `${rowsBefore} -> ${rowsAfter}`);
  const gone = await p.locator('#link-tbody tr td input[readonly]').evaluateAll(
    (els, u) => els.every((e) => e.value !== u), linkUrl);
  check('deleted link url no longer listed', gone);
  const dctx = await b.newContext();
  const dp = await dctx.newPage();
  await dp.goto(linkUrl);
  await dp.waitForTimeout(600);
  check('deleted link no longer signs in', /quote-login/.test(dp.url()), dp.url());

  console.log('\n=== 17. No JS errors in internal app overall ===');
  check('internal app raised no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n================ UI: ${pass} passed, ${fail} failed ================`);
  if (findings.length) { console.log('\nFINDINGS:'); findings.forEach((f) => console.log(' -', f)); }
  await b.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL:', e.message); process.exit(2); });
