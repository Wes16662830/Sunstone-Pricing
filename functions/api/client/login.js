/* /api/client/login — external client sign-in (separate from internal staff).
 * Checks CLIENT_PASSWORD and issues the client-scoped cookie. This cookie only
 * unlocks the /quote page and /api/client/* — never the internal app. */
import { makeToken, clientCookie, json } from '../../_shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  // Trim both sides: pasted secrets often carry a trailing newline/space.
  if (body.password && env.CLIENT_PASSWORD &&
      String(body.password).trim() === String(env.CLIENT_PASSWORD).trim()) {
    const token = await makeToken(env.SESSION_SECRET);
    return json({ ok: true }, 200, { 'Set-Cookie': clientCookie(request, token) });
  }
  return json({ error: 'invalid password' }, 401);
}
