/* Sunstone client quote page — self-service subscription pricing.
 *
 * MARGIN-SAFE: this script holds no pricing formulas and no cost constants. It
 * asks the server for a sanitised catalog (/api/client/catalog) and posts the
 * client's selections to /api/client/quote, which computes server-side and
 * returns only client-facing prices. Currency is a view-layer conversion using
 * the rates the catalog provides (all pricing is computed in ZAR). */
'use strict';

const CURRENCIES = {
  ZAR: { symbol: 'R', name: 'South African Rand' },
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  NGN: { symbol: '₦', name: 'Nigerian Naira' },
};

let catalog = { products: [], rates: { ZAR: 1 } };
let currency = 'ZAR';
try { currency = localStorage.getItem('sps_client_currency') || 'ZAR'; } catch (e) { /* none */ }

const state = { customerName: '', vehicles: 20, users: 0, selected: {} };

// --- formatting -------------------------------------------------------------
const fmt = (n, dp = 2) =>
  (n == null || Number.isNaN(n)) ? '—'
    : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: dp, maximumFractionDigits: dp });
function rate() { return currency === 'ZAR' ? 1 : (Number(catalog.rates[currency]) || 1); }
function sym() { return (CURRENCIES[currency] || { symbol: '' }).symbol; }
const cur = (n, dp = 2) => fmt((Number(n) || 0) / rate(), dp);
const curR = (n, dp = 2) => sym() + ' ' + cur(n, dp);
const pct = (n, dp = 0) => (n == null || Number.isNaN(n)) ? '—' : (n * 100).toFixed(dp) + '%';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- data -------------------------------------------------------------------
async function loadCatalog() {
  const res = await fetch('/api/client/catalog');
  if (res.status === 401) { location.href = '/quote-login'; return; }
  const data = await res.json();
  catalog.products = data.products || [];
  catalog.rates = (data.currency && data.currency.zarPerUnit) || { ZAR: 1 };
  renderCurrencyOptions();
  renderProducts();
  updateUsersVisibility();
  recompute();
}

let debounceTimer = null;
function recompute() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const res = await fetch('/api/client/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicles: state.vehicles, users: state.users, selected: state.selected }),
    });
    if (res.status === 401) { location.href = '/quote-login'; return; }
    renderResult(await res.json());
  }, 120);
}

// --- rendering --------------------------------------------------------------
function renderCurrencyOptions() {
  const sel = document.getElementById('currency');
  sel.innerHTML = Object.keys(CURRENCIES)
    .filter((c) => c === 'ZAR' || catalog.rates[c] != null)
    .map((c) => `<option value="${c}">${CURRENCIES[c].symbol} ${c}</option>`).join('');
  sel.value = currency;
}

function anyPerUser() { return catalog.products.some((p) => p.billing === 'perUser'); }
function updateUsersVisibility() {
  document.getElementById('field-users').style.display = anyPerUser() ? '' : 'none';
}

function renderProducts() {
  const host = document.getElementById('product-list');
  host.innerHTML = catalog.products.map((p) => {
    const basis = p.billing === 'perUser' ? '/ user / month'
      : p.billing === 'flat' ? '/ month (flat)' : '/ vehicle / month';
    return `
      <label class="prod">
        <input type="checkbox" data-key="${esc(p.key)}" ${state.selected[p.key] ? 'checked' : ''} />
        <span>
          <span class="pname">${esc(p.name)}</span><br>
          <span class="pmeta">${esc(p.billingLabel)}</span>
        </span>
        <span class="pprice">${curR(p.unitPrice)}<br><span class="pmeta">${basis}</span></span>
      </label>`;
  }).join('') || '<p class="pmeta">No products available.</p>';
}

let lastQuote = null;
function renderResult(q) {
  lastQuote = q;
  document.getElementById('r-monthly').innerHTML = `${curR(q.monthly)} <small>/mo</small>`;
  document.getElementById('r-permo-cur').textContent = `(${sym()} ${currency})`;
  document.getElementById('r-annual').textContent = curR(q.annual);
  document.getElementById('r-pervehicle').textContent = q.vehicles ? curR(q.perVehicle) : '—';

  const d = q.discounts || {};
  document.getElementById('r-disc').innerHTML = (d.blended > 0)
    ? `<div class="disc">Discounts applied automatically: multi-product bundle <strong>${pct(d.bundle)}</strong>, fleet volume <strong>${pct(d.volume)}</strong> — an effective <strong>${pct(d.blended)}</strong> off list.</div>`
    : '';
  document.getElementById('r-notes').innerHTML = (q.notes || [])
    .map((n) => `<p class="cnote note-warn">⚠ ${esc(n)}</p>`).join('');

  renderQuoteDoc(q);
}

function renderQuoteDoc(q) {
  const rows = (q.items || []).map((i) => `
    <tr><td>${esc(i.product)}</td><td>${esc(i.billingLabel)}</td><td class="num">${i.qty}</td>
        <td class="num">${cur(i.unitPrice)}</td><td class="num">${cur(i.monthly)}</td><td class="num">${cur(i.annual)}</td></tr>`).join('');
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('quote-doc').innerHTML = `
    <h2 style="font-size:19px;letter-spacing:1px;margin:0 0 2px;color:#1a1a1a">SUNSTONE LOGISTIC SYSTEMS</h2>
    <div style="color:#666;font-size:12px;margin-bottom:16px">Subscription Pricing Estimate</div>
    <div class="qmeta">
      <div><span>Prepared for:</span> <strong>${esc(state.customerName || '—')}</strong></div>
      <div><span>Date:</span> ${today}</div>
      <div><span>Fleet size:</span> ${q.vehicles} vehicles${q.users ? ` &nbsp;•&nbsp; Users: ${q.users}` : ''}</div>
    </div>
    <h3>Subscription</h3>
    <table>
      <thead><tr><th>Product</th><th>Basis</th><th class="num">Qty</th><th class="num">Unit/mo</th>
        <th class="num">Monthly ${currency}</th><th class="num">Annual ${currency}</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No products selected.</td></tr>'}
        <tr class="total"><td>Total (excl. VAT)</td><td></td><td></td><td></td>
          <td class="num">${cur(q.monthly)}</td><td class="num">${cur(q.annual)}</td></tr>
      </tbody>
    </table>
    ${(q.discounts && q.discounts.blended > 0) ? `<p style="font-size:12px;color:#555;margin-top:10px">Includes an effective ${pct(q.discounts.blended)} discount vs list (bundle ${pct(q.discounts.bundle)}, volume ${pct(q.discounts.volume)}).</p>` : ''}
    <ul style="font-size:11px;color:#777;margin-top:16px">
      <li>Subscription pricing is billed monthly in arrears. All prices exclude VAT.</li>
      <li>Hardware and implementation are quoted separately — please contact your Sunstone representative.</li>
      <li>Estimate valid for 30 days. Amounts in ${sym()} ${currency}${currency !== 'ZAR' ? ', converted from South African Rand at the current configured rate.' : '.'}</li>
    </ul>
    <p style="margin-top:14px;font-weight:600">Thank you for considering Sunstone Logistic Systems.</p>`;
}

// --- wiring -----------------------------------------------------------------
function wire() {
  document.getElementById('in-customer').addEventListener('input', (e) => {
    state.customerName = e.target.value; renderQuoteDocFromLast();
  });
  document.getElementById('in-vehicles').addEventListener('input', (e) => {
    state.vehicles = Math.max(0, Number(e.target.value) || 0); recompute();
  });
  document.getElementById('in-users').addEventListener('input', (e) => {
    state.users = Math.max(0, Number(e.target.value) || 0); recompute();
  });
  document.getElementById('product-list').addEventListener('change', (e) => {
    const key = e.target.dataset && e.target.dataset.key;
    if (key) { state.selected[key] = e.target.checked; recompute(); }
  });
  document.getElementById('currency').addEventListener('change', (e) => {
    currency = e.target.value;
    try { localStorage.setItem('sps_client_currency', currency); } catch (err) { /* none */ }
    renderProducts(); recompute();
  });
  document.getElementById('btn-print').addEventListener('click', printQuote);
  document.getElementById('signout').addEventListener('click', async () => {
    try { await fetch('/api/client/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
    location.href = '/quote-login';
  });
}

// Refresh only the printable doc (e.g. after a company-name edit) without a
// server round-trip, reusing the most recent quote.
function renderQuoteDocFromLast() { if (lastQuote) renderQuoteDoc(lastQuote); }

function printQuote() {
  const doc = document.getElementById('quote-doc');
  doc.style.display = 'block';
  const restore = () => { doc.style.display = 'none'; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
  setTimeout(restore, 1000);
}

document.addEventListener('DOMContentLoaded', () => { wire(); loadCatalog(); });
