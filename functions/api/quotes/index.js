/* /api/quotes — list + create (Cloudflare D1). Auth enforced by _middleware. */
import { json, rowToQuote } from '../../_shared.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM quotes ORDER BY updated_at DESC').all();
  return json(results.map(rowToQuote));
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  if (!body.deal) return json({ error: 'deal is required' }, 400);
  const name = (body.name || body.deal.customerName || 'Untitled quote').toString().slice(0, 200);
  const customer = (body.deal.customerName || '').toString().slice(0, 200);
  const ts = new Date().toISOString();
  const res = await env.DB
    .prepare('INSERT INTO quotes (name, customer, deal_json, created_at, updated_at) VALUES (?,?,?,?,?)')
    .bind(name, customer, JSON.stringify(body.deal), ts, ts).run();
  const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(res.meta.last_row_id).first();
  return json(rowToQuote(row), 201);
}
