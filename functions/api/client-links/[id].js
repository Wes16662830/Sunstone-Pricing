/* /api/client-links/:id — revoke, reactivate or permanently delete a link.
 * DELETE          → revoke (soft delete; the row stays and can be reactivated)
 * DELETE ?purge=1 → remove the row outright; the token stops resolving and the
 *                   link is gone from the list for good
 * PUT     → { revoked: bool } — set the state directly, so a revoked link can be
 *           reactivated and the same URL starts working again without having to
 *           issue and re-send a new one. */
import { json, rowToClientLink } from '../../_shared.js';

export async function onRequestDelete({ request, params, env }) {
  if (new URL(request.url).searchParams.get('purge') === '1') {
    const existing = await env.DB.prepare('SELECT id FROM client_links WHERE id = ?').bind(params.id).first();
    if (!existing) return json({ error: 'not found' }, 404);
    await env.DB.prepare('DELETE FROM client_links WHERE id = ?').bind(params.id).run();
    return json({ ok: true, deleted: true });
  }
  await env.DB.prepare('UPDATE client_links SET revoked = 1 WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}

export async function onRequestPut({ request, params, env }) {
  const body = await request.json().catch(() => ({}));
  const revoked = body.revoked ? 1 : 0;
  const existing = await env.DB.prepare('SELECT id FROM client_links WHERE id = ?').bind(params.id).first();
  if (!existing) return json({ error: 'not found' }, 404);
  await env.DB.prepare('UPDATE client_links SET revoked = ? WHERE id = ?').bind(revoked, params.id).run();
  const row = await env.DB.prepare('SELECT * FROM client_links WHERE id = ?').bind(params.id).first();
  return json(rowToClientLink(row));
}
