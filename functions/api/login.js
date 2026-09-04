import { makeToken, sessionCookie, json, AUD_STAFF } from '../_shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  // Trim both sides: pasted dashboard secrets often carry a trailing newline/space,
  // which would otherwise make a "correct" password never match.
  if (body.password && env.PASSWORD && String(body.password).trim() === String(env.PASSWORD).trim()) {
    const token = await makeToken(env.SESSION_SECRET, AUD_STAFF);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, token) });
  }
  return json({ error: 'invalid password' }, 401);
}
