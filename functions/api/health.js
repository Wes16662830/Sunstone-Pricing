/* /api/health — unauthenticated diagnostic. Reports ONLY whether the app
 * secrets are bound to THIS deployment (booleans + length, never the value).
 * Lets you confirm from the browser whether PASSWORD/SESSION_SECRET actually
 * reached the served environment. Safe to leave in; remove later if you like. */
export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    ok: true,
    hasPassword: !!env.PASSWORD,
    hasSessionSecret: !!env.SESSION_SECRET,
    passwordLength: env.PASSWORD ? String(env.PASSWORD).length : 0,
  }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
