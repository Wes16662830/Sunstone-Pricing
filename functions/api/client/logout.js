/* /api/client/logout — clear the client session cookie. */
import { clientCookie, json } from '../../_shared.js';

export async function onRequestPost({ request }) {
  return json({ ok: true }, 200, { 'Set-Cookie': clientCookie(request, '') });
}
