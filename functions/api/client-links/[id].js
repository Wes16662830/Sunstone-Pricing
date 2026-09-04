/* /api/client-links/:id — revoke a client access link (soft delete). */
import { json } from '../../_shared.js';

export async function onRequestDelete({ params, env }) {
  await env.DB.prepare('UPDATE client_links SET revoked = 1 WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}
