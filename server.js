/*
 * Sunstone Pricing Calculator — local server (Node).
 *
 * Zero npm dependencies: built-in http + node:sqlite + node:crypto. Run with
 * `node server.js` (no `npm install`). Serves the static UI and a REST API that
 * saves/loads quotes to a SQLite file (quotes.db) next to this script.
 *
 * AUTH: the whole app is gated behind a single shared password (env PASSWORD,
 * default "sunstone" for local dev). A signed HttpOnly session cookie is issued
 * on login. This mirrors the Cloudflare Pages deployment (functions/) so the two
 * backends behave identically against the same REST contract. Because every
 * route — including the JS that contains cost/margin constants — is gated, those
 * figures are never served to an un-authenticated browser.
 *
 * PERSISTENCE HONESTY: quotes live in quotes.db on THIS machine's disk. Single
 * machine (optionally single-LAN). Not cloud, not cross-device. The Cloudflare
 * deployment uses D1 instead, which IS shared/durable — see README.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const P = require('./public/pricing.js'); // shared calc engine (client quote endpoints)

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'quotes.db');

const PASSWORD = process.env.PASSWORD || 'sunstone';
// Separate password for the external client quote page (/quote). Distinct from
// PASSWORD so a client link never unlocks the internal margin/config views.
const CLIENT_PASSWORD = process.env.CLIENT_PASSWORD || 'client';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const COOKIE = 'sps_session';        // internal staff session
const CLIENT_COOKIE = 'sps_client';  // external client session

// --- DB setup -------------------------------------------------------------
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    customer    TEXT,
    deal_json   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    data_json   TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS client_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT NOT NULL UNIQUE,
    label       TEXT,
    created_at  TEXT NOT NULL,
    revoked     INTEGER NOT NULL DEFAULT 0
  );
`);
const nowISO = () => new Date().toISOString();
// URL-safe token for a client access link — long and random enough that it's
// the credential itself (no separate password). 48 hex chars = 192 bits.
const newLinkToken = () => crypto.randomBytes(24).toString('hex');
const rowToClientLink = (r) => ({ id: r.id, token: r.token, label: r.label, createdAt: r.created_at, revoked: !!r.revoked });

// --- Auth helpers ---------------------------------------------------------
function sign(expiry) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(expiry)).digest('hex');
}
function makeToken() {
  const expiry = Date.now() + SESSION_TTL_MS;
  return `${expiry}.${sign(expiry)}`;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [expiry, mac] = token.split('.');
  if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;
  const expected = sign(expiry);
  const a = Buffer.from(mac, 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) { return verifyToken(parseCookies(req)[COOKIE]); }
function isClientAuthed(req) { return verifyToken(parseCookies(req)[CLIENT_COOKIE]); }

// Load the saved global config (or workbook defaults) into the shared engine
// immediately before a synchronous compute for the client quote endpoints.
function loadActiveConfig() {
  const row = db.prepare('SELECT data_json FROM config WHERE id = 1').get();
  P.setConfig(row ? JSON.parse(row.data_json) : P.getDefaultConfig());
}
// Margin-safe price-list projection (mirrors functions/_shared.js clientPriceList).
function clientPriceList(active) {
  const billingLabel = (b) => b === 'perUser' ? 'per user' : b === 'flat' ? 'flat / month' : 'per vehicle';
  const products = active.products.map((p) => ({
    name: p.quoteLabel || p.name, billing: p.billing, billingLabel: billingLabel(p.billing),
    unitPrice: P.listPrice(p), bundleEligible: p.bundleEligible, volumeEligible: p.volumeEligible,
  }));
  const bundle = Object.keys(active.bundleSchedule || {})
    .map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
    .map((count) => ({ count, discount: active.bundleSchedule[count] }));
  const volume = (active.volumeTiers || []).map((t) => ({ min: t.min, max: t.max, name: t.name, discount: t.discount }));
  const hardware = Object.keys(active.hardwareCatalog || {}).map((k) => ({
    name: active.hardwareCatalog[k].sku, price: P.sellPrice(active.hardwareCatalog[k]),
  }));
  const r = active.installRates || {};
  const install = [
    { name: 'GPS tracking installation', rate: r.gpsAlone },
    { name: 'Fuel probe kit installation — single-tank', rate: r.fuelKitSingle },
    { name: 'Fuel probe kit installation — dual-tank', rate: r.fuelKitDual },
    { name: 'Trailer GPS installation', rate: r.trailerGps },
    ...(active.installItems || []).map((ii) => ({ name: ii.name, rate: ii.rate })),
  ];
  return { products, bundle, volume, hardware, install, currency: { zarPerUnit: active.currency.zarPerUnit } };
}

// Margin-safe projection shared with the Cloudflare backend (functions/_shared.js).
function clientQuoteProjection(sub, vehicles, users) {
  const items = sub.lines.filter((l) => l.selected).map((l) => ({
    product: l.quoteLabel, billing: l.billing, billingLabel: l.billingLabel,
    qty: l.qty, unitPrice: l.effectivePrice, monthly: l.monthly, annual: l.annual,
  }));
  const notes = [];
  if (sub.fuelTrackingConflict) {
    notes.push('Fuel monitoring already includes Tracking — you may not need both selected.');
  }
  return {
    vehicles, users, items,
    monthly: sub.totalMonthly, annual: sub.totalAnnual, perVehicle: sub.blendedPerVehicle,
    discounts: { bundle: sub.bundle.discount, volume: sub.volume.discount, blended: sub.effectiveBlendedDiscount },
    notes,
  };
}

// --- tiny helpers ---------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function sendJSON(res, code, obj, headers) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...(headers || {}) });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5_000_000) reject(new Error('payload too large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('invalid JSON body')); } });
    req.on('error', reject);
  });
}
function rowToQuote(r) {
  return { id: r.id, name: r.name, customer: r.customer, deal: JSON.parse(r.deal_json), createdAt: r.created_at, updatedAt: r.updated_at };
}

// --- static file serving (locked to /public) ------------------------------
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/login') urlPath = '/login.html'; // match Cloudflare Pages clean URL
  if (urlPath === '/quote') urlPath = '/quote.html';
  if (urlPath === '/prices') urlPath = '/prices.html';
  if (urlPath === '/quote-login') urlPath = '/quote-login.html';
  const resolved = path.resolve(path.join(PUBLIC, urlPath));
  if (!resolved.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(resolved, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// --- API ------------------------------------------------------------------
async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const secureFlag = (req.headers['x-forwarded-proto'] === 'https') ? ' Secure;' : '';

  // Diagnostic (no session required): reports only whether secrets are bound.
  if (parts[1] === 'health' && req.method === 'GET') {
    return sendJSON(res, 200, {
      ok: true, hasPassword: !!PASSWORD, hasSessionSecret: !!SESSION_SECRET,
      passwordLength: PASSWORD ? PASSWORD.length : 0,
    });
  }

  // Auth endpoints (no session required)
  if (parts[1] === 'login' && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    // Trim both sides — pasted secrets often carry a trailing newline/space.
    if (body.password && String(body.password).trim() === String(PASSWORD).trim()) {
      const cookie = `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000};${secureFlag}`;
      return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': cookie });
    }
    return sendJSON(res, 401, { error: 'invalid password' });
  }
  if (parts[1] === 'logout' && req.method === 'POST') {
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; Path=/; Max-Age=0` });
  }

  // --- Client quote area (external clients) --------------------------------
  if (parts[1] === 'client') {
    // Client auth endpoints (no session required)
    if (parts[2] === 'login' && req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}));
      if (body.password && String(body.password).trim() === String(CLIENT_PASSWORD).trim()) {
        const cookie = `${CLIENT_COOKIE}=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000};${secureFlag}`;
        return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': cookie });
      }
      return sendJSON(res, 401, { error: 'invalid password' });
    }
    if (parts[2] === 'logout' && req.method === 'POST') {
      return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': `${CLIENT_COOKIE}=; HttpOnly; Path=/; Max-Age=0` });
    }
    // Client data endpoints — client cookie, or a valid internal session.
    if (!isClientAuthed(req) && !isAuthed(req)) return sendJSON(res, 401, { error: 'unauthenticated' });
    try {
      if (parts[2] === 'catalog' && req.method === 'GET') {
        loadActiveConfig();
        const active = P.getConfig();
        const products = active.products.map((p) => ({
          key: p.key, name: p.quoteLabel || p.name, billing: p.billing,
          billingLabel: p.billing === 'perUser' ? 'per user' : p.billing === 'flat' ? 'flat / month' : 'per vehicle',
          unitPrice: P.listPrice(p), bundleEligible: p.bundleEligible, volumeEligible: p.volumeEligible,
        }));
        return sendJSON(res, 200, { products, currency: { zarPerUnit: active.currency.zarPerUnit } });
      }
      if (parts[2] === 'quote' && req.method === 'POST') {
        const body = await readBody(req);
        const vehicles = Math.max(0, Number(body.vehicles) || 0);
        const users = Math.max(0, Number(body.users) || 0);
        const selected = (body.selected && typeof body.selected === 'object') ? body.selected : {};
        loadActiveConfig();
        const sub = P.calcSubscription({ vehicles, users, selected });
        return sendJSON(res, 200, clientQuoteProjection(sub, vehicles, users));
      }
      if (parts[2] === 'pricelist' && req.method === 'GET') {
        loadActiveConfig();
        return sendJSON(res, 200, clientPriceList(P.getConfig()));
      }
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
    return sendJSON(res, 404, { error: 'unknown endpoint' });
  }

  // Everything else requires internal auth
  if (!isAuthed(req)) return sendJSON(res, 401, { error: 'unauthenticated' });

  try {
    if (parts[1] === 'config') {
      if (req.method === 'GET') {
        const row = db.prepare('SELECT data_json, updated_at FROM config WHERE id = 1').get();
        return sendJSON(res, 200, { config: row ? JSON.parse(row.data_json) : null, updatedAt: row ? row.updated_at : null });
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        if (!body || typeof body.config !== 'object' || body.config === null) {
          return sendJSON(res, 400, { error: 'config object is required' });
        }
        const ts = nowISO();
        db.prepare(
          'INSERT INTO config (id, data_json, updated_at) VALUES (1, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at'
        ).run(JSON.stringify(body.config), ts);
        return sendJSON(res, 200, { ok: true, updatedAt: ts });
      }
    }

    if (parts[1] === 'client-links') {
      const id = parts[2];
      if (req.method === 'GET' && !id) {
        return sendJSON(res, 200, db.prepare('SELECT * FROM client_links ORDER BY created_at DESC').all().map(rowToClientLink));
      }
      if (req.method === 'POST' && !id) {
        const body = await readBody(req).catch(() => ({}));
        const label = (body.label || '').toString().slice(0, 200);
        const token = newLinkToken();
        const ts = nowISO();
        const info = db.prepare('INSERT INTO client_links (token, label, created_at, revoked) VALUES (?,?,?,0)')
          .run(token, label, ts);
        return sendJSON(res, 201, rowToClientLink(db.prepare('SELECT * FROM client_links WHERE id = ?').get(info.lastInsertRowid)));
      }
      if (req.method === 'DELETE' && id) {
        db.prepare('UPDATE client_links SET revoked = 1 WHERE id = ?').run(Number(id));
        return sendJSON(res, 200, { ok: true });
      }
    }

    if (parts[1] === 'quotes') {
      const id = parts[2];
      if (req.method === 'GET' && !id) {
        return sendJSON(res, 200, db.prepare('SELECT * FROM quotes ORDER BY updated_at DESC').all().map(rowToQuote));
      }
      if (req.method === 'GET' && id) {
        const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(Number(id));
        return row ? sendJSON(res, 200, rowToQuote(row)) : sendJSON(res, 404, { error: 'not found' });
      }
      if (req.method === 'POST' && !id) {
        const body = await readBody(req);
        if (!body.deal) return sendJSON(res, 400, { error: 'deal is required' });
        const name = (body.name || body.deal.customerName || 'Untitled quote').toString().slice(0, 200);
        const customer = (body.deal.customerName || '').toString().slice(0, 200);
        const ts = nowISO();
        const info = db.prepare('INSERT INTO quotes (name, customer, deal_json, created_at, updated_at) VALUES (?,?,?,?,?)')
          .run(name, customer, JSON.stringify(body.deal), ts, ts);
        return sendJSON(res, 201, rowToQuote(db.prepare('SELECT * FROM quotes WHERE id = ?').get(info.lastInsertRowid)));
      }
      if (req.method === 'PUT' && id) {
        const body = await readBody(req);
        if (!body.deal) return sendJSON(res, 400, { error: 'deal is required' });
        const existing = db.prepare('SELECT * FROM quotes WHERE id = ?').get(Number(id));
        if (!existing) return sendJSON(res, 404, { error: 'not found' });
        const name = (body.name || body.deal.customerName || existing.name).toString().slice(0, 200);
        const customer = (body.deal.customerName || '').toString().slice(0, 200);
        db.prepare('UPDATE quotes SET name=?, customer=?, deal_json=?, updated_at=? WHERE id=?')
          .run(name, customer, JSON.stringify(body.deal), nowISO(), Number(id));
        return sendJSON(res, 200, rowToQuote(db.prepare('SELECT * FROM quotes WHERE id = ?').get(Number(id))));
      }
      if (req.method === 'DELETE' && id) {
        db.prepare('DELETE FROM quotes WHERE id = ?').run(Number(id));
        return sendJSON(res, 200, { ok: true });
      }
    }
    return sendJSON(res, 404, { error: 'unknown endpoint' });
  } catch (e) {
    return sendJSON(res, 400, { error: e.message });
  }
}

// --- router ---------------------------------------------------------------
const OPEN_PATHS = new Set(['/login', '/login.html', '/favicon.ico', '/quote-login', '/quote-login.html']);
// Client area assets — reachable with the client cookie (or an internal session).
const CLIENT_ASSETS = new Set(['/quote', '/quote.html', '/quote.js', '/prices', '/prices.html', '/prices.js', '/styles.css']);
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);

  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Client access link — a per-client magic link generated in Config → Client
  // Links. The token itself IS the credential, so this route needs no session.
  // A valid, unrevoked token issues a normal client session (same cookie the
  // password login would) and sends the browser straight into the quote tool.
  if (urlPath === '/client-access') {
    const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token') || '';
    const row = token && db.prepare('SELECT * FROM client_links WHERE token = ? AND revoked = 0').get(token);
    const secureFlag = (req.headers['x-forwarded-proto'] === 'https') ? ' Secure;' : '';
    if (row) {
      const cookie = `${CLIENT_COOKIE}=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000};${secureFlag}`;
      res.writeHead(302, { Location: '/quote', 'Set-Cookie': cookie });
      return res.end();
    }
    // Unknown / revoked token — fall back to the manual client login.
    res.writeHead(302, { Location: '/quote-login' });
    return res.end();
  }

  if (OPEN_PATHS.has(urlPath)) return serveStatic(req, res);

  // Client quote area: client cookie or internal session; else client login.
  if (CLIENT_ASSETS.has(urlPath)) {
    if (isClientAuthed(req) || isAuthed(req)) return serveStatic(req, res);
    res.writeHead(302, { Location: '/quote-login?next=' + encodeURIComponent(urlPath) });
    return res.end();
  }

  // Internal app: staff session only.
  if (!isAuthed(req)) {
    res.writeHead(302, { Location: '/login?next=' + encodeURIComponent(urlPath) });
    return res.end();
  }
  return serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Sunstone Pricing Calculator`);
  console.log(`  → http://${HOST}:${PORT}`);
  console.log(`  Internal login: ${process.env.PASSWORD ? '(from $PASSWORD)' : '"sunstone" (default — set $PASSWORD to change)'}`);
  console.log(`  Client quote page: http://${HOST}:${PORT}/quote  ·  password: ${process.env.CLIENT_PASSWORD ? '(from $CLIENT_PASSWORD)' : '"client" (default — set $CLIENT_PASSWORD to change)'}`);
  console.log(`  Quotes persist to: ${DB_PATH}  (single-machine SQLite)\n`);
});
