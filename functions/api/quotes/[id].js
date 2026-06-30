/* /api/quotes/:id — read, update, delete (Cloudflare D1). Auth via _middleware. */
import { json, rowToQuote } from '../../_shared.js';

export async function onRequestGet({ env, params }) {
  const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(Number(params.id)).first();
  return row ? json(rowToQuote(row)) : json({ error: 'not found' }, 404);
}

export async function onRequestPut({ request, env, params }) {
  const body = await request.json().catch(() => ({}));
  if (!body.deal) return json({ error: 'deal is required' }, 400);
  const existing = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(Number(params.id)).first();
  if (!existing) return json({ error: 'not found' }, 404);
  const name = (body.name || body.deal.customerName || existing.name).toString().slice(0, 200);
  const customer = (body.deal.customerName || '').toString().slice(0, 200);
  await env.DB
    .prepare('UPDATE quotes SET name=?, customer=?, deal_json=?, updated_at=? WHERE id=?')
    .bind(name, customer, JSON.stringify(body.deal), new Date().toISOString(), Number(params.id)).run();
  const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(Number(params.id)).first();
  return json(rowToQuote(row));
}

export async function onRequestDelete({ env, params }) {
  await env.DB.prepare('DELETE FROM quotes WHERE id = ?').bind(Number(params.id)).run();
  return json({ ok: true });
}
