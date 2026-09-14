/* QA suite — API contract, access-control matrix, and margin-safety.
 *
 * Requires a RUNNING local server with known credentials:
 *   DB_PATH=/tmp/qa.db PORT=4200 PASSWORD=staffpw CLIENT_PASSWORD=clientpw node server.js &
 *   npm run test:api
 * Override the target with BASE=http://host:port.
 * Zero dependencies (Node built-in fetch).
 */
'use strict';
const BASE = process.env.BASE || 'http://127.0.0.1:4200';
const STAFF = 'staffpw', CLIENT = 'clientpw';

let pass = 0, fail = 0;
const findings = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; findings.push({ name, detail }); console.log('  ✗ FAIL:', name, detail ? '— ' + detail : ''); }
}

// cookie-jar-less fetch helpers
async function req(path, { method = 'GET', cookie, body, redirect = 'manual' } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json, location: res.headers.get('location') };
}
function cookieFrom(res, name) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  for (const c of sc) { const m = c && c.match(new RegExp('^' + name + '=([^;]+)')); if (m) return `${name}=${m[1]}`; }
  return null;
}

(async () => {
  console.log('\n=== 1. AUTH: login endpoints ===');
  let r = await req('/api/login', { method: 'POST', body: { password: 'wrong' } });
  check('internal login rejects wrong password', r.status === 401, `got ${r.status}`);
  r = await req('/api/login', { method: 'POST', body: { password: STAFF } });
  check('internal login accepts correct password', r.status === 200, `got ${r.status}`);
  const staffCookie = cookieFrom(r, 'sps_session');
  check('internal login sets sps_session cookie', !!staffCookie);
  const scRaw = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).join(';');
  check('session cookie is HttpOnly', /HttpOnly/i.test(scRaw), scRaw);
  check('session cookie is SameSite=Lax (magic links must survive a cross-site click)',
    /SameSite=Lax/i.test(scRaw), scRaw);

  r = await req('/api/client/login', { method: 'POST', body: { password: 'wrong' } });
  check('client login rejects wrong password', r.status === 401, `got ${r.status}`);
  r = await req('/api/client/login', { method: 'POST', body: { password: CLIENT } });
  check('client login accepts correct password', r.status === 200, `got ${r.status}`);
  const clientCookie = cookieFrom(r, 'sps_client');
  check('client login sets sps_client cookie', !!clientCookie);

  // password trimming (documented behaviour)
  r = await req('/api/login', { method: 'POST', body: { password: '  ' + STAFF + '\n' } });
  check('internal login trims whitespace/newline', r.status === 200, `got ${r.status}`);
  // empty password must not authenticate
  r = await req('/api/login', { method: 'POST', body: { password: '' } });
  check('empty password rejected', r.status === 401, `got ${r.status}`);
  r = await req('/api/login', { method: 'POST', body: {} });
  check('missing password rejected', r.status === 401, `got ${r.status}`);

  console.log('\n=== 2. ACCESS MATRIX: unauthenticated ===');
  for (const p of ['/', '/index.html', '/app.js', '/pricing.js', '/proposal.js']) {
    r = await req(p);
    check(`unauth ${p} -> redirect to /login`, r.status === 302 && /\/login/.test(r.location || ''), `${r.status} ${r.location}`);
  }
  for (const p of ['/api/config', '/api/quotes', '/api/client-links']) {
    r = await req(p);
    check(`unauth ${p} -> 401`, r.status === 401, `got ${r.status}`);
  }
  for (const p of ['/quote', '/prices']) {
    r = await req(p);
    check(`unauth ${p} -> redirect to /quote-login`, r.status === 302 && /quote-login/.test(r.location || ''), `${r.status} ${r.location}`);
  }
  for (const p of ['/login', '/quote-login', '/favicon.ico']) {
    r = await req(p);
    check(`open path ${p} reachable`, r.status === 200 || r.status === 404, `got ${r.status}`);
  }

  console.log('\n=== 3. ACCESS MATRIX: client cookie must NOT escalate ===');
  for (const p of ['/', '/index.html', '/app.js', '/pricing.js', '/proposal.js']) {
    r = await req(p, { cookie: clientCookie });
    check(`client cookie blocked from ${p}`, r.status === 302 && /\/login/.test(r.location || ''), `${r.status} ${r.location}`);
  }
  for (const p of ['/api/config', '/api/quotes', '/api/client-links']) {
    r = await req(p, { cookie: clientCookie });
    check(`client cookie blocked from ${p}`, r.status === 401, `got ${r.status}`);
  }
  for (const p of ['/quote', '/prices', '/quote.js', '/prices.js']) {
    r = await req(p, { cookie: clientCookie });
    check(`client cookie allowed ${p}`, r.status === 200, `got ${r.status}`);
  }
  for (const p of ['/api/client/catalog', '/api/client/pricelist']) {
    r = await req(p, { cookie: clientCookie });
    check(`client cookie allowed ${p}`, r.status === 200, `got ${r.status}`);
  }

  console.log('\n=== 4. ACCESS MATRIX: staff cookie ===');
  for (const p of ['/', '/api/config', '/api/quotes', '/api/client-links', '/quote', '/prices', '/api/client/pricelist']) {
    r = await req(p, { cookie: staffCookie });
    check(`staff allowed ${p}`, r.status === 200, `got ${r.status}`);
  }

  console.log('\n=== 5. COOKIE FORGERY / TAMPERING ===');
  const forged = [
    ['garbage', 'sps_session=garbage'],
    ['empty', 'sps_session='],
    ['no-mac', 'sps_session=' + (Date.now() + 100000)],
    ['bad-mac', 'sps_session=' + (Date.now() + 100000) + '.deadbeef'],
    ['expired', 'sps_session=1.' + 'a'.repeat(64)],
    ['far-future-badmac', 'sps_session=99999999999999.' + 'f'.repeat(64)],
  ];
  for (const [label, ck] of forged) {
    r = await req('/api/config', { cookie: ck });
    check(`forged session (${label}) rejected`, r.status === 401, `got ${r.status}`);
  }
  // client cookie value pasted into session cookie name must not work
  const clientVal = clientCookie.split('=').slice(1).join('=');
  r = await req('/api/config', { cookie: 'sps_session=' + clientVal });
  check('client token reused as staff cookie', r.status === 401, `got ${r.status} — SECURITY: client token accepted as staff!`);

  console.log('\n=== 6. MARGIN SAFETY of client payloads ===');
  const LEAK = ['marginalCost', 'targetGM', 'stepThreshold', 'stepCost', 'contribution', 'grossMargin', 'floor50', 'floor60', '"cost"', 'hardwareMarkup'];
  for (const p of ['/api/client/catalog', '/api/client/pricelist']) {
    r = await req(p, { cookie: clientCookie });
    const leaked = LEAK.filter((k) => r.text.includes(k.replace(/"/g, '')));
    check(`${p} leaks no cost/margin fields`, leaked.length === 0, 'leaked: ' + leaked.join(','));
  }
  r = await req('/api/client/quote', { method: 'POST', cookie: clientCookie, body: { vehicles: 20, users: 0, selected: { tracking: true, fuel: true } } });
  const qLeak = LEAK.filter((k) => r.text.includes(k.replace(/"/g, '')));
  check('/api/client/quote leaks no cost/margin fields', qLeak.length === 0, 'leaked: ' + qLeak.join(','));
  check('/api/client/quote returns totals', r.json && typeof r.json.monthly === 'number', JSON.stringify(r.json).slice(0, 120));

  console.log('\n=== 7. CLIENT QUOTE calc parity + input validation ===');
  const P = require('../public/pricing.js');
  P.setConfig(P.getDefaultConfig());
  const expected = P.calcSubscription({ vehicles: 20, users: 0, selected: { tracking: true, fuel: true, routeBuilder: true, digitalJourney: true } });
  r = await req('/api/client/quote', { method: 'POST', cookie: clientCookie, body: { vehicles: 20, users: 0, selected: { tracking: true, fuel: true, routeBuilder: true, digitalJourney: true } } });
  check('client quote monthly matches engine', Math.abs(r.json.monthly - expected.totalMonthly) < 0.01, `${r.json.monthly} vs ${expected.totalMonthly}`);
  check('client quote annual matches engine', Math.abs(r.json.annual - expected.totalAnnual) < 0.01, `${r.json.annual} vs ${expected.totalAnnual}`);

  const badInputs = [
    ['negative vehicles', { vehicles: -50, users: 0, selected: { tracking: true } }],
    ['string vehicles', { vehicles: 'abc', users: 0, selected: { tracking: true } }],
    ['null selected', { vehicles: 10, users: 0, selected: null }],
    ['missing body fields', {}],
    ['huge fleet', { vehicles: 1e9, users: 0, selected: { tracking: true } }],
    ['selected non-object', { vehicles: 10, selected: 'tracking' }],
    ['unknown product key', { vehicles: 10, selected: { nope: true } }],
  ];
  for (const [label, body] of badInputs) {
    r = await req('/api/client/quote', { method: 'POST', cookie: clientCookie, body });
    const ok = r.status === 200 && r.json && Number.isFinite(r.json.monthly) && r.json.monthly >= 0;
    check(`client quote handles ${label}`, ok, `status ${r.status} monthly=${r.json && r.json.monthly}`);
  }

  console.log('\n=== 8. QUOTES CRUD ===');
  r = await req('/api/quotes', { method: 'POST', cookie: staffCookie, body: { deal: { customerName: 'QA Co', vehicles: 5, selected: {} } } });
  check('create quote 201', r.status === 201, `got ${r.status}`);
  const qid = r.json && r.json.id;
  r = await req('/api/quotes', { cookie: staffCookie });
  check('list quotes includes new', Array.isArray(r.json) && r.json.some((q) => q.id === qid));
  r = await req('/api/quotes/' + qid, { cookie: staffCookie });
  check('get quote by id', r.status === 200 && r.json.id === qid, `got ${r.status}`);
  r = await req('/api/quotes/999999', { cookie: staffCookie });
  check('get missing quote -> 404', r.status === 404, `got ${r.status}`);
  r = await req('/api/quotes', { method: 'POST', cookie: staffCookie, body: {} });
  check('create quote without deal -> 400', r.status === 400, `got ${r.status}`);
  r = await req('/api/quotes/' + qid, { method: 'PUT', cookie: staffCookie, body: { deal: { customerName: 'QA Co 2', vehicles: 7 } } });
  check('update quote 200', r.status === 200 && r.json.deal.vehicles === 7, `got ${r.status}`);
  r = await req('/api/quotes/' + qid, { method: 'DELETE', cookie: staffCookie });
  check('delete quote 200', r.status === 200, `got ${r.status}`);
  r = await req('/api/quotes/' + qid, { cookie: staffCookie });
  check('deleted quote gone -> 404', r.status === 404, `got ${r.status}`);

  console.log('\n=== 9. CONFIG endpoint ===');
  r = await req('/api/config', { cookie: staffCookie });
  check('GET config 200', r.status === 200, `got ${r.status}`);
  r = await req('/api/config', { method: 'PUT', cookie: staffCookie, body: {} });
  check('PUT config without config -> 400', r.status === 400, `got ${r.status}`);
  r = await req('/api/config', { method: 'PUT', cookie: staffCookie, body: { config: null } });
  check('PUT config null -> 400', r.status === 400, `got ${r.status}`);

  console.log('\n=== 10. CLIENT LINKS lifecycle ===');
  r = await req('/api/client-links', { method: 'POST', cookie: staffCookie, body: { label: 'QA Client' } });
  check('create link 201', r.status === 201 && r.json.token, `got ${r.status}`);
  const link = r.json;
  check('token is long/random', link.token && link.token.length >= 32, `len ${link.token && link.token.length}`);
  check('new link not revoked', link.revoked === false);
  // redeem
  r = await req('/client-access?token=' + link.token);
  check('valid token redirects to /quote', r.status === 302 && /\/quote$/.test(r.location || ''), `${r.status} ${r.location}`);
  const magicCookie = cookieFrom(r, 'sps_client');
  check('valid token issues client cookie', !!magicCookie);
  r = await req('/quote', { cookie: magicCookie });
  check('magic-link session can load /quote', r.status === 200, `got ${r.status}`);
  r = await req('/api/config', { cookie: magicCookie });
  check('magic-link session CANNOT reach /api/config', r.status === 401, `got ${r.status}`);
  r = await req('/api/client-links', { cookie: magicCookie });
  check('magic-link session CANNOT list links', r.status === 401, `got ${r.status}`);
  // bad tokens
  for (const [label, t] of [['garbage', 'nope'], ['empty', ''], ['sql-ish', "' OR 1=1 --"], ['very long', 'a'.repeat(500)]]) {
    r = await req('/client-access?token=' + encodeURIComponent(t));
    const ok = r.status === 302 && /quote-login/.test(r.location || '') && !cookieFrom(r, 'sps_client');
    check(`invalid token (${label}) denied, no cookie`, ok, `${r.status} ${r.location}`);
  }
  r = await req('/client-access');
  check('missing token param denied', r.status === 302 && /quote-login/.test(r.location || ''), `${r.status} ${r.location}`);
  // revoke
  r = await req('/api/client-links/' + link.id, { method: 'DELETE', cookie: staffCookie });
  check('revoke link 200', r.status === 200, `got ${r.status}`);
  r = await req('/client-access?token=' + link.token);
  check('revoked token denied', r.status === 302 && /quote-login/.test(r.location || '') && !cookieFrom(r, 'sps_client'), `${r.status} ${r.location}`);
  r = await req('/api/client-links', { cookie: staffCookie });
  const revokedRow = r.json.find((l) => l.id === link.id);
  check('revoked link still listed w/ revoked=true', revokedRow && revokedRow.revoked === true);
  // already-issued session survives revocation? (documented behaviour check)
  r = await req('/quote', { cookie: magicCookie });
  findings.push({ name: 'INFO: session issued before revoke still valid', detail: `status ${r.status} (cookie is a standalone 12h session; revoke blocks NEW redemptions only)` });

  // reactivate the revoked link — same URL must work again
  r = await req('/api/client-links/' + link.id, { method: 'PUT', cookie: staffCookie, body: { revoked: false } });
  check('reactivate link 200', r.status === 200 && r.json && r.json.revoked === false, `${r.status} ${JSON.stringify(r.json)}`);
  r = await req('/client-access?token=' + link.token);
  const reCookie = cookieFrom(r, 'sps_client');
  check('reactivated token signs in again', r.status === 302 && /\/quote$/.test(r.location || '') && !!reCookie, `${r.status} ${r.location}`);
  check('reactivated cookie is SameSite=Lax', /SameSite=Lax/i.test((r.headers.getSetCookie ? r.headers.getSetCookie() : []).join(';')));
  r = await req('/api/client-links', { cookie: staffCookie });
  check('reactivated link listed as active', (r.json.find((l) => l.id === link.id) || {}).revoked === false);
  // re-revoke, and confirm PUT{revoked:true} also works
  r = await req('/api/client-links/' + link.id, { method: 'PUT', cookie: staffCookie, body: { revoked: true } });
  check('PUT revoked:true re-revokes', r.status === 200 && r.json.revoked === true, JSON.stringify(r.json));
  r = await req('/client-access?token=' + link.token);
  check('re-revoked token denied again', r.status === 302 && /quote-login/.test(r.location || ''), `${r.status} ${r.location}`);
  r = await req('/api/client-links/999999', { method: 'PUT', cookie: staffCookie, body: { revoked: false } });
  check('reactivate missing link -> 404', r.status === 404, `got ${r.status}`);
  r = await req('/api/client-links/' + link.id, { method: 'PUT', cookie: clientCookie, body: { revoked: false } });
  check('client cookie cannot reactivate a link', r.status === 401, `got ${r.status}`);

  // permanent delete (?purge=1) — the row goes away and cannot be reactivated
  r = await req('/api/client-links', { method: 'POST', cookie: staffCookie, body: { label: 'QA Purge Me' } });
  const doomed = r.json;
  check('create link to purge 201', r.status === 201 && !!doomed.token, `got ${r.status}`);
  r = await req('/api/client-links/' + doomed.id + '?purge=1', { method: 'DELETE', cookie: clientCookie });
  check('client cookie cannot purge a link', r.status === 401, `got ${r.status}`);
  r = await req('/api/client-links/' + doomed.id + '?purge=1', { method: 'DELETE', cookie: staffCookie });
  check('purge link 200', r.status === 200 && r.json && r.json.deleted === true, `${r.status} ${JSON.stringify(r.json)}`);
  r = await req('/api/client-links', { cookie: staffCookie });
  check('purged link gone from list', !r.json.some((l) => l.id === doomed.id));
  r = await req('/client-access?token=' + doomed.token);
  check('purged token denied', r.status === 302 && /quote-login/.test(r.location || '') && !cookieFrom(r, 'sps_client'), `${r.status} ${r.location}`);
  r = await req('/api/client-links/' + doomed.id, { method: 'PUT', cookie: staffCookie, body: { revoked: false } });
  check('purged link cannot be reactivated -> 404', r.status === 404, `got ${r.status}`);
  r = await req('/api/client-links/999999?purge=1', { method: 'DELETE', cookie: staffCookie });
  check('purge missing link -> 404', r.status === 404, `got ${r.status}`);
  // the other links must be untouched by the purge
  r = await req('/api/client-links', { cookie: staffCookie });
  check('purge left the other link intact', r.json.some((l) => l.id === link.id));

  console.log('\n=== 11. METHOD / MALFORMED handling ===');
  r = await req('/api/client-links', { method: 'DELETE', cookie: staffCookie });
  check('DELETE /api/client-links (no id) not 500', r.status !== 500, `got ${r.status}`);
  r = await req('/api/nope', { cookie: staffCookie });
  check('unknown api endpoint -> 404', r.status === 404, `got ${r.status}`);
  const raw = await fetch(BASE + '/api/quotes', { method: 'POST', headers: { Cookie: staffCookie, 'Content-Type': 'application/json' }, body: '{not json' });
  check('malformed JSON body -> 4xx not 500', raw.status >= 400 && raw.status < 500, `got ${raw.status}`);

  console.log('\n=== 12. PATH TRAVERSAL / static serving ===');
  for (const p of ['/../server.js', '/..%2fserver.js', '/../../etc/passwd', '/quotes.db']) {
    r = await req(p, { cookie: staffCookie });
    const leaked = r.status === 200 && (r.text.includes('CLIENT_PASSWORD') || r.text.includes('root:'));
    check(`traversal ${p} does not leak`, !leaked, `status ${r.status}`);
  }

  console.log(`\n================ API/SECURITY: ${pass} passed, ${fail} failed ================`);
  if (findings.length) { console.log('\nFINDINGS:'); findings.forEach((f) => console.log(' -', f.name, f.detail ? '| ' + f.detail : '')); }
  process.exit(fail > 0 ? 1 : 0);
})();
