import { sessionCookie, json } from '../_shared.js';

export async function onRequestPost(context) {
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(context.request, '') });
}
