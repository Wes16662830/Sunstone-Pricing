/* Sunstone Pricing Calculator — UI controller (vanilla JS).
   All numbers come from the shared Pricing engine (pricing.js), the same module
   the verification test runs against. The UI never re-implements a formula. */
'use strict';
const P = window.Pricing;

// --- Internal passcode gate -------------------------------------------------
// Deliberately client-side and trivial. See README + the in-UI warning copy:
// this is a deterrent against over-the-shoulder viewing, NOT real security.
const INTERNAL_PASSCODE = 'sunstone';
let internalUnlocked = false;

const fmt = (n, dp = 2) =>
  (n === '' || n === null || n === undefined || Number.isNaN(n)) ? '—'
    : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtR = (n, dp = 2) => 'R ' + fmt(n, dp);
const pct = (n, dp = 1) => (n === '' || n == null || Number.isNaN(n)) ? '—' : (n * 100).toFixed(dp) + '%';

// --- Deal state -------------------------------------------------------------
function defaultDeal() {
  return {
    customerName: 'Zambia Sugar',
    quoteDate: new Date().toISOString().slice(0, 10),
    vehicles: 20,
    selected: { tracking: true, fuel: true, routeBuilder: true, digitalJourney: true, stockMaster: false },
    hardware: {
      singleTank: 0, dualTank: 0, trailerQty: 0, outsideSA: false,
      items: {
        djHandsetSku: 'blackviewFort1', djHandsetInclude: false,
        smHandsetSku: 'oukitelG1S', smHandsetInclude: false,
        printerInclude: false, vehicleGpsInclude: false, trailerGpsInclude: false,
        fuelKitSingleInclude: false, fuelKitDualInclude: false,
      },
    },
    implementation: { activities: P.IMPL_ACTIVITIES.map((a) => ({ ...a })) },
    rental: { termMonths: 36, mode: 'Pure Rental' },
  };
}

let deal = defaultDeal();
let currentId = null; // id of the loaded saved quote, if any
let result = null;

// --- Compute + render -------------------------------------------------------
function recompute() {
  result = P.calcDeal(deal);
  renderAll();
}

function renderAll() {
  renderSubscription();
  renderHardware();
  renderImplementation();
  renderRental();
  renderQuote();
  if (internalUnlocked) renderMargin();
}

// --- SUBSCRIPTION -----------------------------------------------------------
function renderSubscription() {
  const s = result.subscription;
  // Conflict banner (replicated bug: warn but DO NOT block).
  const banner = document.getElementById('conflict-banner');
  if (s.fuelTrackingConflict) {
    banner.classList.remove('hidden');
    banner.innerHTML = '⚠ <strong>Configuration warning:</strong> ' + s.configCheck +
      ' &nbsp;Fuel already includes Tracking — these are meant to be mutually exclusive. ' +
      'The quote is <strong>still being calculated and can still be saved with both counted</strong> ' +
      '(this matches the source workbook; it is a known double-counting issue, not silently fixed).';
  } else {
    banner.classList.add('hidden');
  }

  const tb = document.getElementById('sub-tbody');
  tb.innerHTML = '';
  s.lines.forEach((l) => {
    const tr = document.createElement('tr');
    if (!l.selected) tr.className = 'row-off';
    tr.innerHTML = `
      <td><input type="checkbox" data-prod="${l.key}" ${l.selected ? 'checked' : ''}></td>
      <td>${l.name}</td>
      <td class="num">${fmt(l.listPrice)}</td>
      <td class="num">${fmt(l.effectivePrice)}</td>
      <td class="num">${fmt(l.monthly)}</td>
      <td class="num">${fmt(l.annual)}</td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input[data-prod]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      deal.selected[e.target.dataset.prod] = e.target.checked;
      recompute();
    });
  });

  const sum = document.getElementById('sub-summary');
  sum.innerHTML = `
    <tr><td>Products in bundle</td><td>${s.productCount}</td></tr>
    <tr><td>Bundle multiplier (discount)</td><td>${fmt(s.bundle.multiplier, 2)} (${pct(s.bundle.discount)})</td></tr>
    <tr><td>Volume tier</td><td>${s.volume.name}</td></tr>
    <tr><td>Volume multiplier (discount)</td><td>${fmt(s.volume.multiplier, 2)} (${pct(s.volume.discount)})</td></tr>
    <tr class="subtle"><td>Effective blended discount</td><td>${pct(s.effectiveBlendedDiscount)}</td></tr>
    <tr class="total"><td>Total monthly revenue</td><td>${fmtR(s.totalMonthly)}</td></tr>
    <tr class="total"><td>Total annual revenue</td><td>${fmtR(s.totalAnnual)}</td></tr>`;

  document.getElementById('sub-headline').innerHTML =
    `<div class="lbl">Blended price per vehicle / month</div><div class="big">${fmtR(s.blendedPerVehicle)}</div>`;
}

// --- HARDWARE ---------------------------------------------------------------
function fillHandsetSelect(sel, current) {
  sel.innerHTML = '';
  P.HANDSET_OPTIONS.forEach((key) => {
    const o = document.createElement('option');
    o.value = key; o.textContent = P.HARDWARE_CATALOG[key].sku;
    if (key === current) o.selected = true;
    sel.appendChild(o);
  });
}

function renderHardware() {
  const h = result.hardware;
  document.getElementById('hw-total-veh').textContent = h.vehicles;
  document.getElementById('hw-trackonly').textContent = h.trackingOnlyQty;

  const tb = document.getElementById('hw-tbody');
  tb.innerHTML = '';
  // Map row id -> include flag key in deal.hardware.items
  const includeKey = {
    djHandset: 'djHandsetInclude', smHandset: 'smHandsetInclude', printer: 'printerInclude',
    vehicleGps: 'vehicleGpsInclude', trailerGps: 'trailerGpsInclude',
    fuelKitSingle: 'fuelKitSingleInclude', fuelKitDual: 'fuelKitDualInclude',
  };
  h.rows.forEach((r) => {
    const tr = document.createElement('tr');
    if (!r.include) tr.className = 'row-off';
    tr.innerHTML = `
      <td><input type="checkbox" data-inc="${includeKey[r.id]}" ${r.include ? 'checked' : ''}></td>
      <td>${r.desc}</td>
      <td class="num">${r.qty}</td>
      <td class="num">${fmt(r.unit)}</td>
      <td class="num">${fmt(r.subtotal)}</td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input[data-inc]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      deal.hardware.items[e.target.dataset.inc] = e.target.checked;
      recompute();
    });
  });

  document.getElementById('hw-totals').innerHTML = `
    <tr><td>Hardware subtotal</td><td>${fmtR(h.hardwareSubtotal)}</td></tr>
    <tr><td>International shipping &amp; customs${h.outsideSA ? ' (20%)' : ''}</td><td>${fmtR(h.shippingSurcharge)}</td></tr>
    <tr class="total"><td>Hardware total (incl. shipping)</td><td>${fmtR(h.hardwareTotal)}</td></tr>`;

  const itb = document.getElementById('hw-install-tbody');
  itb.innerHTML = '';
  h.installRows.forEach((r) => {
    const tr = document.createElement('tr');
    if (r.subtotal === 0) tr.className = 'row-off';
    tr.innerHTML = `<td>${r.desc}</td><td class="num">${r.qty}</td><td class="num">${fmt(r.rate)}</td><td class="num">${fmt(r.subtotal)}</td>`;
    itb.appendChild(tr);
  });
  document.getElementById('hw-grand').innerHTML = `
    <tr><td>Installation subtotal</td><td>${fmtR(h.installSubtotal)}</td></tr>
    <tr class="total"><td>GRAND TOTAL — Hardware + Installation</td><td>${fmtR(h.grandTotal)}</td></tr>`;
}

// --- IMPLEMENTATION ---------------------------------------------------------
function renderImplementation() {
  const im = result.implementation;
  const tb = document.getElementById('impl-tbody');
  tb.innerHTML = '';
  im.lines.forEach((l, i) => {
    const tr = document.createElement('tr');
    if (!l.billed) tr.className = 'row-off';
    const status = l.product
      ? (l.billed ? 'Billed (product selected)' : 'Not billed (product off)')
      : (l.note || '—');
    tr.innerHTML = `
      <td>${l.desc}</td>
      <td class="num"><input class="cell-input num" type="number" min="0" step="1" data-impl="${i}" data-f="hours" value="${l.hours}"></td>
      <td><input type="checkbox" data-impl="${i}" data-f="senior" ${l.senior ? 'checked' : ''}></td>
      <td class="num">${fmt(l.rate, 0)}</td>
      <td class="num"><input class="cell-input num" type="number" min="0" max="100" step="1" data-impl="${i}" data-f="discount" value="${Math.round(l.discount * 100)}"></td>
      <td class="num">${fmt(l.total)}</td>
      <td>${status}</td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('[data-impl]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.impl), f = e.target.dataset.f;
      const a = deal.implementation.activities[i];
      if (f === 'senior') a.senior = e.target.checked;
      else if (f === 'discount') a.discount = Math.max(0, Math.min(100, Number(e.target.value))) / 100;
      else if (f === 'hours') a.hours = Math.max(0, Number(e.target.value));
      recompute();
    });
  });
  document.getElementById('impl-totals').innerHTML = `
    <tr><td>Total billable hours (effective)</td><td>${fmt(im.billableHours, 1)}</td></tr>
    <tr class="total"><td>TOTAL ONE-TIME IMPLEMENTATION</td><td>${fmtR(im.total)}</td></tr>`;
}

// --- RENTAL -----------------------------------------------------------------
function renderRental() {
  const r = result.rental;
  document.getElementById('rent-rate').textContent = pct(r.annualRate);
  document.getElementById('rent-factor').textContent = fmt(r.monthlyFactor, 6);
  document.getElementById('rent-mode-note').textContent = r.mode === 'Pure Rental'
    ? 'MODE: Pure Rental — Sunstone retains ownership; typically an operating expense for the customer. Hardware is not contractually transferred.'
    : 'MODE: Rent-to-Own — customer owns the hardware at end of term; treated like a financed purchase. Renewal = software only on owned kit.';

  document.getElementById('rent-bundle').innerHTML = `
    <tr><td>Vehicles</td><td>${r.vehicles}</td></tr>
    <tr><td>Monthly SaaS (recurring software)</td><td>${fmtR(r.monthlySaaS)}</td></tr>
    <tr><td>Capital to finance (hardware + install)</td><td>${fmtR(r.capital)}</td></tr>
    <tr><td>Monthly hardware + install (amortised, PMT)</td><td>${fmtR(r.monthlyHardwareInstall)}</td></tr>
    <tr class="total"><td>TOTAL monthly rental bundle</td><td>${fmtR(r.totalMonthly)}</td></tr>
    <tr class="subtle"><td>Total payable over ${r.term}-month term</td><td>${fmtR(r.totalOverTerm)}</td></tr>
    <tr class="subtle"><td>Purchase-model upfront avoided (hw+install+impl)</td><td>${fmtR(r.purchaseModelUpfront)}</td></tr>`;

  document.getElementById('rent-headline').innerHTML =
    `<div class="lbl">All-inclusive per vehicle / month (${r.term}-mo • ${r.mode})</div><div class="big">${fmtR(r.perVehicle)}</div>`;

  const rn = r.renewal;
  document.getElementById('rent-renewal').innerHTML = `
    <tr><td>Refresh — new hardware, fresh term (per veh/mo)</td><td>${fmtR(rn.refreshPerVehicle)}</td></tr>
    <tr><td>Retain existing hardware (per veh/mo)${r.mode === 'Pure Rental' ? ' — SaaS + 0.75%/mo support' : ' — SaaS only'}</td><td>${fmtR(rn.retainPerVehicle)}</td></tr>
    <tr class="subtle"><td>Saving vs first term (retain route)</td><td>${pct(rn.retainSavingVsFirst)}</td></tr>`;
}

// --- CUSTOMER QUOTE (client-safe; renders ONLY from result.clientQuote) ------
function renderQuote() {
  const q = result.clientQuote;
  const subRows = q.subscriptionItems.map((i) => `
    <tr><td>${i.product}</td><td class="num">${i.vehicles}</td><td class="num">${fmt(i.pricePerVehicle)}</td><td class="num">${fmt(i.monthly)}</td><td class="num">${fmt(i.annual)}</td></tr>`).join('');
  const implRows = q.implementationItems.map((i) => `
    <tr><td>${i.desc}</td><td class="num">${i.hours}</td><td class="num">${fmt(i.rate, 0)}</td><td class="num">${i.discount ? pct(i.discount, 0) : ''}</td><td class="num">${fmt(i.total)}</td></tr>`).join('');
  const hwRows = q.hardwareItems.map((i) => `
    <tr><td>${i.desc}</td><td class="num">${i.qty ?? ''}</td><td class="num">${i.unit != null ? fmt(i.unit) : ''}</td><td class="num">${fmt(i.total)}</td></tr>`).join('');

  document.getElementById('quote-doc').innerHTML = `
    <h1>SUNSTONE LOGISTIC SYSTEMS</h1>
    <div class="q-sub">Solution Quotation — Subscription, Implementation &amp; Hardware</div>
    <div class="q-meta">
      <div><span>Prepared for:</span> <strong>${escapeHtml(deal.customerName || '—')}</strong></div>
      <div><span>Quote date:</span> ${deal.quoteDate}</div>
      <div><span>Fleet size:</span> ${deal.vehicles} vehicles</div>
    </div>

    <h3>Subscription Items</h3>
    <table>
      <thead><tr><th>Product</th><th class="num">Vehicles</th><th class="num">Price/veh/mo</th><th class="num">Monthly R</th><th class="num">Annual R</th></tr></thead>
      <tbody>${subRows || '<tr><td colspan="5">No subscription items selected.</td></tr>'}
        <tr class="q-total"><td>Total subscription value (excl. VAT)</td><td></td><td></td><td class="num">${fmt(q.subscriptionMonthly)}</td><td class="num">${fmt(q.subscriptionAnnual)}</td></tr>
      </tbody>
    </table>

    ${implRows ? `
    <h3>One-Time Implementation (Setup, Config &amp; Project Services)</h3>
    <table>
      <thead><tr><th>Description</th><th class="num">Hours</th><th class="num">Rate R/hr</th><th class="num">Disc</th><th class="num">Total R</th></tr></thead>
      <tbody>${implRows}
        <tr class="q-total"><td>Total one-time implementation (excl. VAT)</td><td></td><td></td><td></td><td class="num">${fmt(q.implementationTotal)}</td></tr>
      </tbody>
    </table>` : ''}

    ${hwRows ? `
    <h3>One-Time Hardware &amp; Installation</h3>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit R</th><th class="num">Total R</th></tr></thead>
      <tbody>${hwRows}
        <tr class="q-total"><td>Total hardware &amp; installation (excl. VAT)</td><td></td><td></td><td class="num">${fmt(q.hardwareTotal)}</td></tr>
      </tbody>
    </table>` : ''}

    <div class="q-grand">
      <div class="g-row"><span>YEAR-1 TOTAL (recurring + one-time)</span><span>${fmtR(q.year1Total)}</span></div>
      <div class="g-row sub"><span>Year 2 onwards (recurring subscription only)</span><span>${fmtR(q.year2Onwards)}</span></div>
    </div>

    <div class="q-disc">
      Pricing benefits included: multi-product bundle discount <strong>${pct(q.discounts.bundle)}</strong>,
      fleet volume discount <strong>${pct(q.discounts.volume)}</strong>,
      effective blended discount on list <strong>${pct(q.discounts.blended)}</strong>.
    </div>

    <ul class="q-notes">
      <li>Subscription pricing is per vehicle per month, billed monthly in arrears.</li>
      <li>Implementation is a once-off charge, payable per agreed milestones at the start of the project.</li>
      <li>Hardware and installation are once-off charges, invoiced on delivery / commissioning.</li>
      <li>Hours shown on each implementation line are estimates; variance is reconciled at project close.</li>
      <li>Quote valid for 30 days from the date shown above. All prices exclude VAT.</li>
    </ul>
    <p style="margin-top:14px;font-weight:600;">Thank you for considering Sunstone Logistic Systems.</p>`;
}

// --- INTERNAL MARGIN --------------------------------------------------------
function renderMargin() {
  const m = result.internalMargin;
  const tb = document.getElementById('margin-tbody');
  tb.innerHTML = '';
  m.rows.forEach((r) => {
    const tr = document.createElement('tr');
    if (!r.selected) tr.className = 'row-off';
    const warnColor = r.stepWarning.startsWith('⚠') ? 'color:var(--warn)' : '';
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${r.selected ? '☑' : '☐'}</td>
      <td class="num">${fmt(r.revenue)}</td>
      <td class="num">${fmt(r.marginalCost, 0)}</td>
      <td class="num">${fmt(r.monthlyCost)}</td>
      <td class="num">${fmt(r.contribution)}</td>
      <td class="num">${pct(r.grossMargin)}</td>
      <td style="${warnColor}">${r.stepWarning}</td>`;
    tb.appendChild(tr);
  });
  document.getElementById('margin-totals').innerHTML = `
    <tr class="total"><td>TOTAL revenue</td><td>${fmtR(m.totalRevenue)}</td></tr>
    <tr><td>TOTAL cost</td><td>${fmtR(m.totalCost)}</td></tr>
    <tr><td>TOTAL contribution</td><td>${fmtR(m.totalContribution)}</td></tr>
    <tr class="total"><td>Blended gross margin</td><td>${pct(m.totalGrossMargin)}</td></tr>`;

  const w = m.walkDown;
  document.getElementById('margin-walkdown').innerHTML = `
    <tr><td>Gross list value (no discounts)</td><td>${fmtR(w.grossListValue)}</td></tr>
    <tr><td>Less: Bundle discount</td><td>${fmtR(w.bundleDiscount)}</td></tr>
    <tr><td>Less: Volume discount</td><td>${fmtR(w.volumeDiscount)}</td></tr>
    <tr class="total"><td>Net subscription revenue (monthly)</td><td>${fmtR(w.netSubscription)}</td></tr>
    <tr class="subtle"><td>Effective discount vs list</td><td>${pct(w.effectiveDiscount)}</td></tr>`;

  const ftb = document.getElementById('margin-floor-tbody');
  ftb.innerHTML = '';
  m.rows.forEach((r) => {
    let color = 'var(--good)';
    if (r.floorStatus.includes('50%')) color = 'var(--bad)';
    else if (r.floorStatus.includes('60%')) color = 'var(--warn)';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.name}</td>
      <td class="num">${fmt(r.marginalCost, 0)}</td>
      <td class="num">${fmt(r.floor50)}</td>
      <td class="num">${fmt(r.floor60)}</td>
      <td class="num">${fmt(r.effectivePrice)}</td>
      <td style="color:${color}">${r.floorStatus}</td>`;
    ftb.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Sync DOM inputs from deal (after load) ---------------------------------
function syncInputsFromDeal() {
  document.getElementById('in-customer').value = deal.customerName || '';
  document.getElementById('in-vehicles').value = deal.vehicles;
  document.getElementById('in-date').value = deal.quoteDate;
  document.getElementById('hw-single').value = deal.hardware.singleTank;
  document.getElementById('hw-dual').value = deal.hardware.dualTank;
  document.getElementById('hw-trailer').value = deal.hardware.trailerQty;
  document.getElementById('hw-intl').checked = deal.hardware.outsideSA;
  fillHandsetSelect(document.getElementById('hw-dj-sku'), deal.hardware.items.djHandsetSku);
  fillHandsetSelect(document.getElementById('hw-sm-sku'), deal.hardware.items.smHandsetSku);
  document.getElementById('rent-term').value = String(deal.rental.termMonths);
  document.getElementById('rent-mode').value = deal.rental.mode;
}

// --- Wire up static inputs --------------------------------------------------
function wireInputs() {
  document.getElementById('in-customer').addEventListener('input', (e) => { deal.customerName = e.target.value; renderQuote(); });
  document.getElementById('in-vehicles').addEventListener('input', (e) => { deal.vehicles = Math.max(0, Number(e.target.value) || 0); recompute(); });
  document.getElementById('in-date').addEventListener('input', (e) => { deal.quoteDate = e.target.value; renderQuote(); });

  document.getElementById('hw-single').addEventListener('input', (e) => { deal.hardware.singleTank = Math.max(0, Number(e.target.value) || 0); recompute(); });
  document.getElementById('hw-dual').addEventListener('input', (e) => { deal.hardware.dualTank = Math.max(0, Number(e.target.value) || 0); recompute(); });
  document.getElementById('hw-trailer').addEventListener('input', (e) => { deal.hardware.trailerQty = Math.max(0, Number(e.target.value) || 0); recompute(); });
  document.getElementById('hw-intl').addEventListener('change', (e) => { deal.hardware.outsideSA = e.target.checked; recompute(); });
  document.getElementById('hw-dj-sku').addEventListener('change', (e) => { deal.hardware.items.djHandsetSku = e.target.value; recompute(); });
  document.getElementById('hw-sm-sku').addEventListener('change', (e) => { deal.hardware.items.smHandsetSku = e.target.value; recompute(); });

  document.getElementById('rent-term').addEventListener('change', (e) => { deal.rental.termMonths = Number(e.target.value); recompute(); });
  document.getElementById('rent-mode').addEventListener('change', (e) => { deal.rental.mode = e.target.value; recompute(); });

  // Tabs
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      if (t.dataset.tab === 'margin' && !internalUnlocked) { /* still show locked panel */ }
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector(`.panel[data-panel="${t.dataset.tab}"]`).classList.add('active');
    });
  });

  // Internal gate
  document.getElementById('btn-internal').addEventListener('click', () => {
    document.querySelector('.tab[data-tab="margin"]').click();
    document.getElementById('gate-pass').focus();
  });
  document.getElementById('gate-submit').addEventListener('click', tryUnlock);
  document.getElementById('gate-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
}

function tryUnlock() {
  const val = document.getElementById('gate-pass').value;
  const msg = document.getElementById('gate-msg');
  if (val === INTERNAL_PASSCODE) {
    internalUnlocked = true;
    document.getElementById('margin-locked').classList.add('hidden');
    document.getElementById('margin-content').classList.remove('hidden');
    document.getElementById('tab-margin').classList.remove('locked');
    document.getElementById('tab-margin').classList.add('unlocked');
    document.getElementById('tab-margin').textContent = 'Internal Margin 🔓';
    const badge = document.getElementById('view-badge');
    badge.textContent = 'INTERNAL VIEW'; badge.className = 'view-badge internal';
    renderMargin();
  } else {
    msg.textContent = 'Incorrect passcode.'; msg.className = 'gate-msg err';
  }
}

// --- Persistence (REST) -----------------------------------------------------
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function refreshQuoteList() {
  const list = document.getElementById('quote-list');
  try {
    const quotes = await api('GET', '/api/quotes');
    list.innerHTML = '';
    if (!quotes.length) { list.innerHTML = '<li style="cursor:default;border:none">No saved quotes yet.</li>'; return; }
    quotes.forEach((q) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="q-name">${escapeHtml(q.name)}${currentId === q.id ? ' •' : ''}</div>
        <div class="q-info"><span>${escapeHtml(q.customer || '')} · ${q.deal.vehicles} veh</span>
        <span><span class="q-load">load</span> · <span class="q-del" data-id="${q.id}">del</span></span></div>`;
      li.querySelector('.q-load').addEventListener('click', () => loadQuote(q));
      li.querySelector('.q-name').addEventListener('click', () => loadQuote(q));
      li.querySelector('.q-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${q.name}"?`)) return;
        await api('DELETE', '/api/quotes/' + q.id);
        if (currentId === q.id) currentId = null;
        refreshQuoteList();
      });
      list.appendChild(li);
    });
  } catch (e) {
    list.innerHTML = `<li style="cursor:default;border:none;color:var(--bad)">Server offline — persistence unavailable. (${escapeHtml(e.message)})</li>`;
  }
}

function loadQuote(q) {
  // Merge over a fresh default so older saved shapes stay valid.
  const d = defaultDeal();
  deal = Object.assign(d, q.deal);
  deal.hardware = Object.assign(d.hardware, q.deal.hardware || {});
  deal.hardware.items = Object.assign(d.hardware.items, (q.deal.hardware || {}).items || {});
  deal.implementation = { activities: ((q.deal.implementation || {}).activities || P.IMPL_ACTIVITIES).map((a) => ({ ...a })) };
  deal.rental = Object.assign(d.rental, q.deal.rental || {});
  deal.selected = Object.assign(d.selected, q.deal.selected || {});
  currentId = q.id;
  syncInputsFromDeal();
  recompute();
  setSaveStatus(`Loaded "${q.name}".`);
  refreshQuoteList();
}

function setSaveStatus(text, isErr) {
  const el = document.getElementById('save-status');
  el.textContent = text;
  el.style.color = isErr ? 'var(--bad)' : 'var(--good)';
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
}

async function saveCurrent() {
  const name = prompt('Quote name:', deal.customerName || 'Untitled quote');
  if (name === null) return;
  try {
    let saved;
    if (currentId) saved = await api('PUT', '/api/quotes/' + currentId, { name, deal });
    else saved = await api('POST', '/api/quotes', { name, deal });
    currentId = saved.id;
    setSaveStatus(`Saved "${saved.name}".`);
    refreshQuoteList();
  } catch (e) {
    setSaveStatus('Save failed: ' + e.message, true);
  }
}

// --- Init -------------------------------------------------------------------
function init() {
  wireInputs();
  syncInputsFromDeal();
  recompute();

  document.getElementById('drawer-toggle').addEventListener('click', () => {
    document.getElementById('drawer').classList.toggle('open'); refreshQuoteList();
  });
  document.getElementById('drawer-close').addEventListener('click', () => document.getElementById('drawer').classList.remove('open'));
  document.getElementById('btn-save').addEventListener('click', saveCurrent);
  document.getElementById('btn-new').addEventListener('click', () => {
    deal = defaultDeal(); currentId = null; internalUnlocked = internalUnlocked; // keep unlock state
    syncInputsFromDeal(); recompute(); setSaveStatus('New quote started.');
  });

  refreshQuoteList();
}

document.addEventListener('DOMContentLoaded', init);
