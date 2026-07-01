import { makeToken, sessionCookie, json } from '../_shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  if (body.password && env.PASSWORD && body.password === env.PASSWORD) {
    const token = await makeToken(env.SESSION_SECRET);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, token) });
  }
  return json({ error: 'invalid password' }, 401);
}
