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
