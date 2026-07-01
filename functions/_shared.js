/*
 * Shared helpers for the Cloudflare Pages Functions (auth + responses).
 * Underscore-prefixed: imported by the route handlers, never routed itself.
 * Uses Web Crypto (available in the Workers runtime) — mirrors the HMAC scheme
 * in the local Node server.js so both backends issue interchangeable sessions.
 */
export const COOKIE = 'sps_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

const enc = new TextEncoder();

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makeToken(secret) {
  const expiry = Date.now() + SESSION_TTL_MS;
  return `${expiry}.${await hmacHex(secret, String(expiry))}`;
}

export async function verifyToken(secret, token) {
  if (!secret || !token || !token.includes('.')) return false;
  const [expiry, mac] = token.split('.');
  if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;
  const expected = await hmacHex(secret, expiry);
  if (mac.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookie(request, token) {
  const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
  const maxAge = token ? SESSION_TTL_MS / 1000 : 0;
  return `${COOKIE}=${token || ''}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge};${secure}`;
}

export function json(obj, status = 200, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(extraHeaders || {}) },
  });
}

export function rowToQuote(r) {
  return {
    id: r.id, name: r.name, customer: r.customer,
    deal: JSON.parse(r.deal_json), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
