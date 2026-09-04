/*
 * Shared helpers for the Cloudflare Pages Functions (auth + responses).
 * Underscore-prefixed: imported by the route handlers, never routed itself.
 * Uses Web Crypto (available in the Workers runtime) — mirrors the HMAC scheme
 * in the local Node server.js so both backends issue interchangeable sessions.
 */
export const COOKIE = 'sps_session';         // internal staff session
export const CLIENT_COOKIE = 'sps_client';   // external client (quote page) session
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

const enc = new TextEncoder();

// URL-safe token for a client access link — long and random enough that it's
// the credential itself (no separate password). 48 hex chars = 192 bits.
export function newLinkToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function rowToClientLink(r) {
  return { id: r.id, token: r.token, label: r.label, createdAt: r.created_at, revoked: !!r.revoked };
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Sessions are AUDIENCE-BOUND: the audience ("staff" / "client") is part of the
// signed message, so a client token cannot be renamed into the staff cookie to
// escalate privileges (and vice-versa). Without this both cookies are signed
// identically and are interchangeable — a client could read cost/margin data.
export const AUD_STAFF = 'staff';
export const AUD_CLIENT = 'client';

export async function makeToken(secret, aud) {
  const expiry = Date.now() + SESSION_TTL_MS;
  return `${expiry}.${await hmacHex(secret, `${aud}:${expiry}`)}`;
}

export async function verifyToken(secret, token, aud) {
  if (!secret || !token || !token.includes('.')) return false;
  const [expiry, mac] = token.split('.');
  if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;
  const expected = await hmacHex(secret, `${aud}:${expiry}`);
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
  return cookieFor(COOKIE, request, token);
}

// Client (external) session cookie — same signing scheme, different name so a
// client token can never satisfy the internal-only gate (and vice-versa).
export function clientCookie(request, token) {
  return cookieFor(CLIENT_COOKIE, request, token);
}

function cookieFor(name, request, token) {
  const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
  const maxAge = token ? SESSION_TTL_MS / 1000 : 0;
  return `${name}=${token || ''}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge};${secure}`;
}

// Load the saved global pricing config (single D1 row) into the shared engine,
// falling back to workbook defaults. Call immediately before a synchronous
// compute so the module-global active config is the one this request wants.
export async function applyActiveConfig(env, Pricing) {
  let cfg = Pricing.getDefaultConfig();
  try {
    const row = await env.DB.prepare('SELECT data_json FROM config WHERE id = 1').first();
    if (row && row.data_json) cfg = JSON.parse(row.data_json);
  } catch (e) { /* no DB / no row -> defaults */ }
  return Pricing.setConfig(cfg);
}

// Whitelisted, margin-safe projection of a subscription result for the client
// quote page. Contains ONLY prices the client would pay — never marginal cost,
// target GM, or step cost. Shared by both backends' /api/client/quote.
export function clientQuoteProjection(sub, vehicles, users) {
  const items = sub.lines.filter((l) => l.selected).map((l) => ({
    product: l.quoteLabel, billing: l.billing, billingLabel: l.billingLabel,
    qty: l.qty, unitPrice: l.effectivePrice, monthly: l.monthly, annual: l.annual,
  }));
  const notes = [];
  if (sub.fuelTrackingConflict) {
    notes.push('Fuel monitoring already includes Tracking — you may not need both selected.');
  }
  return {
    vehicles, users, items,
    monthly: sub.totalMonthly, annual: sub.totalAnnual,
    perVehicle: sub.blendedPerVehicle,
    discounts: {
      bundle: sub.bundle.discount, volume: sub.volume.discount,
      blended: sub.effectiveBlendedDiscount,
    },
    notes,
  };
}

function billingLabel(b) {
  return b === 'perUser' ? 'per user' : b === 'flat' ? 'flat / month' : 'per vehicle';
}

// Margin-safe price-list projection: list (sell) prices + published discount
// levels only. No cost, target GM or step cost. Shared by both backends'
// /api/client/pricelist. `active` is the merged config; Pricing supplies the
// list/sell price helpers (config already applied).
export function clientPriceList(active, Pricing) {
  const products = active.products.map((p) => ({
    name: p.quoteLabel || p.name,
    billing: p.billing,
    billingLabel: billingLabel(p.billing),
    unitPrice: Pricing.listPrice(p),
    bundleEligible: p.bundleEligible,
    volumeEligible: p.volumeEligible,
  }));
  const bundle = Object.keys(active.bundleSchedule || {})
    .map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
    .map((count) => ({ count, discount: active.bundleSchedule[count] }));
  const volume = (active.volumeTiers || []).map((t) => ({
    min: t.min, max: t.max, name: t.name, discount: t.discount,
  }));
  const hardware = Object.keys(active.hardwareCatalog || {}).map((k) => ({
    name: active.hardwareCatalog[k].sku, price: Pricing.sellPrice(active.hardwareCatalog[k]),
  }));
  const r = active.installRates || {};
  const install = [
    { name: 'GPS tracking installation', rate: r.gpsAlone },
    { name: 'Fuel probe kit installation — single-tank', rate: r.fuelKitSingle },
    { name: 'Fuel probe kit installation — dual-tank', rate: r.fuelKitDual },
    { name: 'Trailer GPS installation', rate: r.trailerGps },
    ...(active.installItems || []).map((ii) => ({ name: ii.name, rate: ii.rate })),
  ];
  return { products, bundle, volume, hardware, install, currency: { zarPerUnit: active.currency.zarPerUnit } };
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
