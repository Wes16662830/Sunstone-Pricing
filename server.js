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

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'quotes.db');

const PASSWORD = process.env.PASSWORD || 'sunstone';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const COOKIE = 'sps_session';

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
`);
const nowISO = () => new Date().toISOString();

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

  // Auth endpoints (no session required)
  if (parts[1] === 'login' && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    if (body.password === PASSWORD) {
      const cookie = `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000};${secureFlag}`;
      return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': cookie });
    }
    return sendJSON(res, 401, { error: 'invalid password' });
  }
  if (parts[1] === 'logout' && req.method === 'POST') {
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; Path=/; Max-Age=0` });
  }

  // Everything else requires auth
  if (!isAuthed(req)) return sendJSON(res, 401, { error: 'unauthenticated' });

  try {
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
const PUBLIC_PATHS = new Set(['/login', '/login.html', '/favicon.ico']);
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);

  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  // Gate every static route behind auth; allow only the login page itself.
  if (!PUBLIC_PATHS.has(urlPath) && !isAuthed(req)) {
    res.writeHead(302, { Location: '/login?next=' + encodeURIComponent(urlPath) });
    return res.end();
  }
  return serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Sunstone Pricing Calculator`);
  console.log(`  → http://${HOST}:${PORT}`);
  console.log(`  Login password: ${process.env.PASSWORD ? '(from $PASSWORD)' : '"sunstone" (default — set $PASSWORD to change)'}`);
  console.log(`  Quotes persist to: ${DB_PATH}  (single-machine SQLite)\n`);
});
