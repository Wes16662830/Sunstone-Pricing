/* Sunstone client price-list page — read-only reference pricing.
 *
 * MARGIN-SAFE: no pricing formulas or cost constants here. It fetches the
 * sanitised price list from /api/client/pricelist (list/sell prices + published
 * discount levels only) and renders it. Currency is a view-layer conversion using
 * the rates the endpoint provides (all pricing is computed in ZAR). */
'use strict';

const CURRENCIES = {
  ZAR: { symbol: 'R', name: 'South African Rand' },
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  NGN: { symbol: '₦', name: 'Nigerian Naira' },
};

let data = null;
let rates = { ZAR: 1 };
let currency = 'ZAR';
try { currency = localStorage.getItem('sps_client_currency') || 'ZAR'; } catch (e) { /* none */ }

const fmt = (n, dp = 2) =>
  (n == null || Number.isNaN(n)) ? '—'
    : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: dp, maximumFractionDigits: dp });
function rate() { return currency === 'ZAR' ? 1 : (Number(rates[currency]) || 1); }
function sym() { return (CURRENCIES[currency] || { symbol: '' }).symbol; }
const money = (n, dp = 2) => sym() + ' ' + fmt((Number(n) || 0) / rate(), dp);
const pct = (n, dp = 0) => (n == null || Number.isNaN(n)) ? '—' : (n * 100).toFixed(dp) + '%';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function load() {
  const res = await fetch('/api/client/pricelist');
  if (res.status === 401) { location.href = '/quote-login'; return; }
  data = await res.json();
  rates = (data.currency && data.currency.zarPerUnit) || { ZAR: 1 };
  renderCurrencyOptions();
  render();
}

function renderCurrencyOptions() {
  const sel = document.getElementById('currency');
  sel.innerHTML = Object.keys(CURRENCIES)
    .filter((c) => c === 'ZAR' || rates[c] != null)
    .map((c) => `<option value="${c}">${CURRENCIES[c].symbol} ${c}</option>`).join('');
  sel.value = currency;
}

function render() {
  document.getElementById('cur-note').textContent =
    currency === 'ZAR' ? '' : `Shown in ${sym()} ${currency}, converted from South African Rand at the current rate.`;

  document.getElementById('tbl-products').innerHTML = (data.products || []).map((p) => {
    const tags = [
      p.bundleEligible ? '<span class="tag">bundle</span>' : '<span class="tag no">no bundle</span>',
      p.volumeEligible ? '<span class="tag">volume</span>' : '<span class="tag no">no volume</span>',
    ].join(' ');
    return `<tr><td>${esc(p.name)}</td><td>${esc(p.billingLabel)}</td>
      <td class="num">${money(p.unitPrice)}</td><td>${tags}</td></tr>`;
  }).join('') || '<tr><td colspan="4">No products.</td></tr>';

  document.getElementById('tbl-bundle').innerHTML = (data.bundle || [])
    .filter((b) => b.count >= 1)
    .map((b) => `<tr><td>${b.count} product${b.count === 1 ? '' : 's'}</td>
      <td class="num">${b.discount ? pct(b.discount) : '—'}</td></tr>`).join('') || '<tr><td colspan="2">—</td></tr>';

  document.getElementById('tbl-volume').innerHTML = (data.volume || []).map((v) => {
    const range = (v.max >= 999999 || v.max == null) ? `${v.min}+ vehicles` : `${v.min}–${v.max} vehicles`;
    return `<tr><td>${esc(range)}</td><td>${esc(v.name || '')}</td>
      <td class="num">${v.discount ? pct(v.discount) : '—'}</td></tr>`;
  }).join('') || '<tr><td colspan="3">—</td></tr>';

  const hw = data.hardware || [];
  document.getElementById('card-hardware').style.display = hw.length ? '' : 'none';
  document.getElementById('tbl-hardware').innerHTML = hw
    .map((h) => `<tr><td>${esc(h.name)}</td><td class="num">${money(h.price)}</td></tr>`).join('');

  const inst = (data.install || []).filter((i) => i.rate != null);
  document.getElementById('card-install').style.display = inst.length ? '' : 'none';
  document.getElementById('tbl-install').innerHTML = inst
    .map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${money(i.rate)}</td></tr>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('currency').addEventListener('change', (e) => {
    currency = e.target.value;
    try { localStorage.setItem('sps_client_currency', currency); } catch (err) { /* none */ }
    renderCurrencyOptions(); render();
  });
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('signout').addEventListener('click', async () => {
    try { await fetch('/api/client/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
    location.href = '/quote-login';
  });
  load();
});
