/*
 * Sunstone Pricing Calculator — local server.
 *
 * Zero npm dependencies: built-in http + node:sqlite. Run with `node server.js`
 * (no `npm install` needed). Serves the static UI and a small REST API that
 * saves/loads quotes to a SQLite file (quotes.db) next to this script.
 *
 * PERSISTENCE HONESTY: quotes live in quotes.db on THIS machine's disk. They
 * survive browser refreshes, browser changes, and reboots, and are reachable
 * from any browser pointing at this server (incl. other machines on the LAN if
 * you bind to 0.0.0.0). They are NOT in any cloud — a teammate on a different
 * machine, or you on a different device off-LAN, will NOT see them unless you
 * host this somewhere shared. See README for the full picture.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'quotes.db');

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

// --- tiny helpers ---------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function rowToQuote(r) {
  return {
    id: r.id, name: r.name, customer: r.customer,
    deal: JSON.parse(r.deal_json),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// --- static file serving (locked to this dir + /public) -------------------
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/public/index.html';
  // Allow root-level pricing.js (shared engine) and anything under /public.
  let filePath;
  if (urlPath === '/pricing.js') filePath = path.join(ROOT, 'pricing.js');
  else filePath = path.join(ROOT, urlPath.startsWith('/public/') ? urlPath : '/public' + urlPath);

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(resolved, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// --- API ------------------------------------------------------------------
async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean); // ['api','quotes', ':id?']

  try {
    if (parts[1] === 'quotes') {
      const id = parts[2];

      if (req.method === 'GET' && !id) {
        const rows = db.prepare('SELECT * FROM quotes ORDER BY updated_at DESC').all();
        return sendJSON(res, 200, rows.map(rowToQuote));
      }
      if (req.method === 'GET' && id) {
        const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(Number(id));
        if (!row) return sendJSON(res, 404, { error: 'not found' });
        return sendJSON(res, 200, rowToQuote(row));
      }
      if (req.method === 'POST' && !id) {
        const body = await readBody(req);
        if (!body.deal) return sendJSON(res, 400, { error: 'deal is required' });
        const name = (body.name || body.deal.customerName || 'Untitled quote').toString().slice(0, 200);
        const customer = (body.deal.customerName || '').toString().slice(0, 200);
        const ts = nowISO();
        const info = db.prepare(
          'INSERT INTO quotes (name, customer, deal_json, created_at, updated_at) VALUES (?,?,?,?,?)'
        ).run(name, customer, JSON.stringify(body.deal), ts, ts);
        const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(info.lastInsertRowid);
        return sendJSON(res, 201, rowToQuote(row));
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
        const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(Number(id));
        return sendJSON(res, 200, rowToQuote(row));
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
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Sunstone Pricing Calculator`);
  console.log(`  → http://${HOST}:${PORT}`);
  console.log(`  Quotes persist to: ${DB_PATH}`);
  console.log(`  (single-machine SQLite store — see README on cross-device limits)\n`);
});
