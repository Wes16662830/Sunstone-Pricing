/*
 * Root middleware — runs on EVERY request (static assets included). Gates the
 * whole app behind the session cookie so cost/margin JS is never served to an
 * un-authenticated browser. Only the login endpoint + login page are open.
 */
import { COOKIE, verifyToken, getCookie } from './_shared.js';

// Cloudflare Pages serves /login.html at the clean URL /login (308 from .html).
// Allow both so the login page is reachable pre-auth on either backend.
const OPEN_PATHS = new Set(['/login', '/login.html', '/favicon.ico']);

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const p = url.pathname;

  if (p === '/api/login' || p === '/api/health' || OPEN_PATHS.has(p)) return next();

  const authed = await verifyToken(env.SESSION_SECRET, getCookie(request, COOKIE));
  if (authed) return next();

  if (p.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(p)}`, 302);
}
