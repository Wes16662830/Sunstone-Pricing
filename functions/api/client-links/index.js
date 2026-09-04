/* /api/client-links — internal-only management of client access links.
 * Auth: internal staff session, enforced by _middleware (this path is neither
 * an OPEN_PATH nor under /api/client/, so it falls to the internal-only gate). */
import { json, newLinkToken, rowToClientLink } from '../../_shared.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM client_links ORDER BY created_at DESC').all();
  return json((results || []).map(rowToClientLink));
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const label = (body.label || '').toString().slice(0, 200);
  const token = newLinkToken();
  const ts = new Date().toISOString();
  await env.DB.prepare('INSERT INTO client_links (token, label, created_at, revoked) VALUES (?,?,?,0)')
    .bind(token, label, ts).run();
  const row = await env.DB.prepare('SELECT * FROM client_links WHERE token = ?').bind(token).first();
  return json(rowToClientLink(row), 201);
}
