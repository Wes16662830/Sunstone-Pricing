/*
 * Root middleware — runs on EVERY request (static assets included).
 *
 * Two separate gates:
 *   • Internal app (everything by default) — requires the staff session cookie,
 *     so cost/margin JS is never served to an un-authenticated browser.
 *   • Client quote area (/quote, its assets, /api/client/*) — requires the
 *     CLIENT cookie (a valid internal session is also accepted). This area only
 *     ever serves margin-safe data, so it is safe to share with clients while
 *     the internal app stays locked down.
 * Only the two login endpoints + login pages (+ favicon) are fully open.
 */
import { COOKIE, CLIENT_COOKIE, verifyToken, getCookie } from './_shared.js';

// Fully open: login endpoints + login pages, favicon.
const OPEN_PATHS = new Set([
  '/login', '/login.html', '/favicon.ico',
  '/quote-login', '/quote-login.html',
]);
// Client area static assets (client cookie — or internal — required). These
// carry no cost/margin data. Everything else falls through to the internal gate.
const CLIENT_ASSETS = new Set(['/quote', '/quote.html', '/quote.js', '/styles.css']);

function unauth() {
  return new Response(JSON.stringify({ error: 'unauthenticated' }), {
    status: 401, headers: { 'content-type': 'application/json' },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const p = url.pathname;

  if (p === '/api/login' || p === '/api/health' || p === '/api/client/login' || OPEN_PATHS.has(p)) {
    return next();
  }

  // Client quote area — client cookie, or a valid internal session.
  if (p.startsWith('/api/client/') || CLIENT_ASSETS.has(p)) {
    const ok = (await verifyToken(env.SESSION_SECRET, getCookie(request, CLIENT_COOKIE)))
      || (await verifyToken(env.SESSION_SECRET, getCookie(request, COOKIE)));
    if (ok) return next();
    if (p.startsWith('/api/')) return unauth();
    return Response.redirect(`${url.origin}/quote-login?next=${encodeURIComponent(p)}`, 302);
  }

  // Internal app — staff session only.
  const authed = await verifyToken(env.SESSION_SECRET, getCookie(request, COOKIE));
  if (authed) return next();
  if (p.startsWith('/api/')) return unauth();
  return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(p)}`, 302);
}
