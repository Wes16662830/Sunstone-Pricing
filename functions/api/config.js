/* /api/config — read + save the global pricing configuration (Cloudflare D1).
 * Auth enforced by _middleware. GET returns { config, updatedAt } (config is null
 * when none is saved, so the client uses built-in defaults). PUT saves the config. */
import { json } from '../_shared.js';

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare('SELECT data_json, updated_at FROM config WHERE id = 1').first();
  return json({ config: row ? JSON.parse(row.data_json) : null, updatedAt: row ? row.updated_at : null });
}

export async function onRequestPut({ request, env }) {
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body.config !== 'object' || body.config === null) {
    return json({ error: 'config object is required' }, 400);
  }
  const ts = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO config (id, data_json, updated_at) VALUES (1, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at'
  ).bind(JSON.stringify(body.config), ts).run();
  return json({ ok: true, updatedAt: ts });
}
