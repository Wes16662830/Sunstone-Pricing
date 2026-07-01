/* Sunstone Pricing Calculator — UI controller (vanilla JS).
   All numbers come from the shared Pricing engine (pricing.js), the same module
   the verification test runs against. The UI never re-implements a formula. */
'use strict';
const P = window.Pricing;

// --- Presentation mode ------------------------------------------------------
// The REAL access gate is the server-side site login (see server.js / functions/).
// Everyone in the app is authenticated internal staff, so margins are visible by
// default. "Presentation mode" is purely an on-screen over-the-shoulder deterrent
// for client meetings: it hides the Internal Margin tab and forces the Quote view.
// It is NOT security — it changes nothing about what the server sends.
let presentationMode = false;

const fmt = (n, dp = 2) =>
  (n === '' || n === null || n === undefined || Number.isNaN(n)) ? '—'
    : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const pct = (n, dp = 1) => (n === '' || n == null || Number.isNaN(n)) ? '—' : (n * 100).toFixed(dp) + '%';

// --- Display currency -------------------------------------------------------
// ALL pricing is computed in Rands (ZAR). Display currency is a view-layer
// conversion: value_in_currency = randValue / zarPerUnit[currency]. `cur` formats
// a money value in the active display currency (no symbol); `fmtR` adds the symbol
// (used for every total/headline, so those convert automatically). Non-money
// numbers (hours, qty, multipliers, factors, %) keep using `fmt`.
const CURRENCIES = {
  ZAR: { symbol: 'R',  name: 'South African Rand' },
  USD: { symbol: '$',  name: 'US Dollar' },
  EUR: { symbol: '€',  name: 'Euro' },
  GBP: { symbol: '£',  name: 'British Pound' },
  NGN: { symbol: '₦',  name: 'Nigerian Naira' },
};
let displayCurrency = 'ZAR';
try { displayCurrency = localStorage.getItem('sps_currency') || 'ZAR'; } catch (e) { /* no localStorage */ }
let fxRates = { ZAR: 1, USD: 18.5, EUR: 20, GBP: 23.5, NGN: 0.0113 }; // zarPerUnit, refreshed from config
function fxDivisor() { return displayCurrency === 'ZAR' ? 1 : (Number(fxRates[displayCurrency]) || 1); }
function curSym() { return (CURRENCIES[displayCurrency] || { symbol: '' }).symbol; }
const cur = (n, dp = 2) => fmt((Number(n) || 0) / fxDivisor(), dp);
const fmtR = (n, dp = 2) => curSym() + ' ' + cur(n, dp);

// --- Deal state -------------------------------------------------------------
function defaultDeal() {
  return {
    customerName: 'Zambia Sugar',
    quoteDate: new Date().toISOString().slice(0, 10),
    vehicles: 20,
    users: 0,
    selected: { tracking: true, fuel: true, routeBuilder: true, digitalJourney: true, stockMaster: false },
    hardware: {
      singleTank: 0, dualTank: 0, trailerQty: 0, outsideSA: false,
      items: {
        djHandsetSku: 'blackviewFort1', djHandsetInclude: false,
        smHandsetSku: 'oukitelG1S', smHandsetInclude: false,
        printerInclude: false, vehicleGpsInclude: false, trailerGpsInclude: false,
        fuelKitSingleInclude: false, fuelKitDualInclude: false,
        extra: {},         // catalog items shown as rows: { [key]: { include, qty } }
        installSel: {},    // installation items shown as rows: { [key]: { include, qty } }
        custom: [],        // legacy one-off catalogued items (older quotes)
        customInstall: [], // one-off installation lines: [{ desc, qty, rate }]
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
  renderMargin();
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
    const excl = [!l.bundleEligible ? 'no bundle' : '', !l.volumeEligible ? 'no volume' : ''].filter(Boolean).join(', ');
    tr.innerHTML = `
      <td><input type="checkbox" data-prod="${l.key}" ${l.selected ? 'checked' : ''}></td>
      <td>${l.name}${excl ? ` <span class="note" style="margin:0">(${excl})</span>` : ''}</td>
      <td>${l.billingLabel}</td>
      <td class="num">${l.qty}</td>
      <td class="num">${cur(l.listPrice)}</td>
      <td class="num">${cur(l.effectivePrice)}</td>
      <td class="num">${cur(l.monthly)}</td>
      <td class="num">${cur(l.annual)}</td>`;
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
    <tr class="total"><td>Total monthly cost</td><td>${fmtR(s.totalMonthly)}</td></tr>
    <tr class="total"><td>Total annual cost</td><td>${fmtR(s.totalAnnual)}</td></tr>`;

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
  const cfg = P.getConfig();
  const catOpts = (selKey) => Object.keys(cfg.hardwareCatalog)
    .map((k) => `<option value="${k}" ${k === selKey ? 'selected' : ''}>${escapeHtml(cfg.hardwareCatalog[k].sku)}</option>`).join('');
  h.rows.forEach((r) => {
    const tr = document.createElement('tr');
    if (r.catalogItem) {
      // A catalogued item (auto-listed): include checkbox + editable qty.
      if (!r.include) tr.className = 'row-off';
      tr.innerHTML = `
        <td><input type="checkbox" data-extra-key="${r.catalogKey}" ${r.include ? 'checked' : ''}></td>
        <td>${r.desc}</td>
        <td class="num"><input class="cell-input num" type="number" min="0" data-extra-qty="${r.catalogKey}" value="${r.qty}"></td>
        <td class="num">${cur(r.unit)}</td>
        <td class="num">${cur(r.subtotal)}</td>`;
    } else if (r.custom) {
      const i = Number(r.id.split(':')[1]);
      tr.innerHTML = `
        <td><button class="btn cfg-del" data-custom-del="${i}" title="Remove">✕</button></td>
        <td><select class="cell-input" data-custom-key="${i}" style="min-width:180px">${catOpts(r.catalogKey)}</select> <span class="note" style="margin:0">one-off</span></td>
        <td class="num"><input class="cell-input num" type="number" min="0" data-custom-qty="${i}" value="${r.qty}"></td>
        <td class="num">${cur(r.unit)}</td>
        <td class="num">${cur(r.subtotal)}</td>`;
    } else {
      if (!r.include) tr.className = 'row-off';
      tr.innerHTML = `
        <td><input type="checkbox" data-inc="${includeKey[r.id]}" ${r.include ? 'checked' : ''}></td>
        <td>${r.desc}</td>
        <td class="num">${r.qty}</td>
        <td class="num">${cur(r.unit)}</td>
        <td class="num">${cur(r.subtotal)}</td>`;
    }
    tb.appendChild(tr);
  });
  const ensureExtra = (k) => (deal.hardware.items.extra[k] = deal.hardware.items.extra[k] || { include: false, qty: deal.vehicles || 0 });
  tb.querySelectorAll('input[data-inc]').forEach((cb) => {
    cb.addEventListener('change', (e) => { deal.hardware.items[e.target.dataset.inc] = e.target.checked; recompute(); });
  });
  tb.querySelectorAll('[data-extra-key]').forEach((cb) => {
    cb.addEventListener('change', (e) => { const k = e.target.dataset.extraKey; ensureExtra(k).include = e.target.checked; recompute(); });
  });
  tb.querySelectorAll('[data-extra-qty]').forEach((el) => {
    el.addEventListener('change', (e) => { const k = e.target.dataset.extraQty; ensureExtra(k).qty = Math.max(0, Number(e.target.value) || 0); recompute(); });
  });
  tb.querySelectorAll('[data-custom-key]').forEach((el) => {
    el.addEventListener('change', (e) => { deal.hardware.items.custom[+e.target.dataset.customKey].key = e.target.value; recompute(); });
  });
  tb.querySelectorAll('[data-custom-qty]').forEach((el) => {
    el.addEventListener('change', (e) => { deal.hardware.items.custom[+e.target.dataset.customQty].qty = Math.max(0, Number(e.target.value) || 0); recompute(); });
  });
  tb.querySelectorAll('[data-custom-del]').forEach((el) => {
    el.addEventListener('click', (e) => { deal.hardware.items.custom.splice(+e.target.dataset.customDel, 1); recompute(); });
  });

  document.getElementById('hw-totals').innerHTML = `
    <tr><td>Hardware subtotal</td><td>${fmtR(h.hardwareSubtotal)}</td></tr>
    <tr><td>International shipping &amp; customs${h.outsideSA ? ' (20%)' : ''}</td><td>${fmtR(h.shippingSurcharge)}</td></tr>
    <tr class="total"><td>Hardware total (incl. shipping)</td><td>${fmtR(h.hardwareTotal)}</td></tr>`;

  const itb = document.getElementById('hw-install-tbody');
  itb.innerHTML = '';
  h.installRows.forEach((r) => {
    const tr = document.createElement('tr');
    if (r.installItem) {
      // A configured installation item (auto-listed): include checkbox + qty.
      if (!r.include) tr.className = 'row-off';
      tr.innerHTML = `
        <td><input type="checkbox" data-instsel-key="${r.installKey}" ${r.include ? 'checked' : ''}> ${r.desc}</td>
        <td class="num"><input class="cell-input num" type="number" min="0" data-instsel-qty="${r.installKey}" value="${r.qty}"></td>
        <td class="num">${cur(r.rate)}</td>
        <td class="num">${cur(r.subtotal)}</td>`;
    } else if (r.custom) {
      const i = Number(r.id.split(':')[1]);
      tr.innerHTML = `
        <td><button class="btn cfg-del" data-cinst-del="${i}" title="Remove">✕</button>
            <input class="cell-input" type="text" data-cinst-desc="${i}" value="${escapeHtml(r.desc)}" style="width:220px"> <span class="note" style="margin:0">one-off</span></td>
        <td class="num"><input class="cell-input num" type="number" min="0" data-cinst-qty="${i}" value="${r.qty}"></td>
        <td class="num"><input class="cell-input num" type="number" min="0" data-cinst-rate="${i}" value="${r.rate}"></td>
        <td class="num">${cur(r.subtotal)}</td>`;
    } else {
      if (r.subtotal === 0) tr.className = 'row-off';
      tr.innerHTML = `<td>${r.desc}</td><td class="num">${r.qty}</td><td class="num">${cur(r.rate)}</td><td class="num">${cur(r.subtotal)}</td>`;
    }
    itb.appendChild(tr);
  });
  const ensureInst = (k) => (deal.hardware.items.installSel[k] = deal.hardware.items.installSel[k] || { include: false, qty: deal.vehicles || 0 });
  itb.querySelectorAll('[data-instsel-key]').forEach((cb) => cb.addEventListener('change', (e) => { ensureInst(e.target.dataset.instselKey).include = e.target.checked; recompute(); }));
  itb.querySelectorAll('[data-instsel-qty]').forEach((el) => el.addEventListener('change', (e) => { ensureInst(e.target.dataset.instselQty).qty = Math.max(0, Number(e.target.value) || 0); recompute(); }));
  itb.querySelectorAll('[data-cinst-desc]').forEach((el) => el.addEventListener('change', (e) => { deal.hardware.items.customInstall[+e.target.dataset.cinstDesc].desc = e.target.value; recompute(); }));
  itb.querySelectorAll('[data-cinst-qty]').forEach((el) => el.addEventListener('change', (e) => { deal.hardware.items.customInstall[+e.target.dataset.cinstQty].qty = Math.max(0, Number(e.target.value) || 0); recompute(); }));
  itb.querySelectorAll('[data-cinst-rate]').forEach((el) => el.addEventListener('change', (e) => { deal.hardware.items.customInstall[+e.target.dataset.cinstRate].rate = Math.max(0, Number(e.target.value) || 0); recompute(); }));
  itb.querySelectorAll('[data-cinst-pick]').forEach((el) => el.addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === '') return;
    const item = (P.getConfig().installItems || [])[+v];
    if (!item) return;
    const row = deal.hardware.items.customInstall[+e.target.dataset.cinstPick];
    row.desc = item.name; row.rate = item.rate;
    recompute();
  }));
  itb.querySelectorAll('[data-cinst-del]').forEach((el) => el.addEventListener('click', (e) => { deal.hardware.items.customInstall.splice(+e.target.dataset.cinstDel, 1); recompute(); }));
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
    const status = !l.enabled
      ? 'Off (excluded)'
      : (l.product ? (l.billed ? 'Billed (product selected)' : 'Not billed (product off)') : (l.note || '—'));
    tr.innerHTML = `
      <td style="text-align:center"><input type="checkbox" data-impl="${i}" data-f="enabled" ${l.enabled ? 'checked' : ''} title="Include this activity"></td>
      <td>${l.desc}</td>
      <td class="num"><input class="cell-input num" type="number" min="0" step="1" data-impl="${i}" data-f="hours" value="${l.hours}"></td>
      <td><input type="checkbox" data-impl="${i}" data-f="senior" ${l.senior ? 'checked' : ''}></td>
      <td class="num">${cur(l.rate, 0)}</td>
      <td class="num"><input class="cell-input num" type="number" min="0" max="100" step="1" data-impl="${i}" data-f="discount" value="${Math.round(l.discount * 100)}"></td>
      <td class="num">${cur(l.total)}</td>
      <td>${status}</td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('[data-impl]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.impl), f = e.target.dataset.f;
      const a = deal.implementation.activities[i];
      if (f === 'senior') a.senior = e.target.checked;
      else if (f === 'enabled') a.enabled = e.target.checked;
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
    <thead><tr><th>Component</th><th class="num">Monthly (total)</th><th class="num">Per vehicle / mo</th></tr></thead>
    <tbody>
      <tr><td>Software subscription (SaaS)</td><td class="num">${fmtR(r.monthlySaaS)}</td><td class="num">${fmtR(r.saasPerVehicle)}</td></tr>
      <tr><td>Hardware + installation (amortised over ${r.term} mo)</td><td class="num">${fmtR(r.monthlyHardwareInstall)}</td><td class="num">${fmtR(r.hardwareInstallPerVehicle)}</td></tr>
      <tr class="total"><td>TOTAL monthly (all-inclusive)</td><td class="num">${fmtR(r.totalMonthly)}</td><td class="num">${fmtR(r.perVehicle)}</td></tr>
      <tr class="subtle"><td>Vehicles: ${r.vehicles} • Capital financed (hardware + install)</td><td class="num">${fmtR(r.capital)}</td><td></td></tr>
      <tr class="subtle"><td>Total payable over ${r.term}-month term</td><td class="num">${fmtR(r.totalOverTerm)}</td><td></td></tr>
      <tr class="subtle"><td>Upfront avoided vs purchase (hw+install+impl)</td><td class="num">${fmtR(r.purchaseModelUpfront)}</td><td></td></tr>
    </tbody>`;

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
    <tr><td>${i.product}</td><td>${i.billingLabel}</td><td class="num">${i.qty}</td><td class="num">${cur(i.unitPrice)}</td><td class="num">${cur(i.monthly)}</td><td class="num">${cur(i.annual)}</td></tr>`).join('');
  const implRows = q.implementationItems.map((i) => `
    <tr><td>${i.desc}</td><td class="num">${i.hours}</td><td class="num">${cur(i.rate, 0)}</td><td class="num">${i.discount ? pct(i.discount, 0) : ''}</td><td class="num">${cur(i.total)}</td></tr>`).join('');
  const hwRows = q.hardwareItems.map((i) => `
    <tr><td>${i.desc}</td><td class="num">${i.qty ?? ''}</td><td class="num">${i.unit != null ? cur(i.unit) : ''}</td><td class="num">${cur(i.total)}</td></tr>`).join('');

  document.getElementById('quote-doc').innerHTML = `
    <h1>SUNSTONE LOGISTIC SYSTEMS</h1>
    <div class="q-sub">Solution Quotation — Subscription, Implementation &amp; Hardware</div>
    <div class="q-meta">
      <div><span>Prepared for:</span> <strong>${escapeHtml(deal.customerName || '—')}</strong></div>
      <div><span>Quote date:</span> ${deal.quoteDate}</div>
      <div><span>Fleet size:</span> ${deal.vehicles} vehicles${deal.users ? ` &nbsp;•&nbsp; <span>Users:</span> ${deal.users}` : ''}</div>
    </div>

    <h3>Subscription Items</h3>
    <table>
      <thead><tr><th>Product</th><th>Basis</th><th class="num">Qty</th><th class="num">Unit/mo</th><th class="num">Monthly ${displayCurrency}</th><th class="num">Annual ${displayCurrency}</th></tr></thead>
      <tbody>${subRows || '<tr><td colspan="6">No subscription items selected.</td></tr>'}
        <tr class="q-total"><td>Total subscription value (excl. VAT)</td><td></td><td></td><td></td><td class="num">${cur(q.subscriptionMonthly)}</td><td class="num">${cur(q.subscriptionAnnual)}</td></tr>
      </tbody>
    </table>

    ${implRows ? `
    <h3>One-Time Implementation (Setup, Config &amp; Project Services)</h3>
    <table>
      <thead><tr><th>Description</th><th class="num">Hours</th><th class="num">Rate/hr ${displayCurrency}</th><th class="num">Disc</th><th class="num">Total ${displayCurrency}</th></tr></thead>
      <tbody>${implRows}
        <tr class="q-total"><td>Total one-time implementation (excl. VAT)</td><td></td><td></td><td></td><td class="num">${cur(q.implementationTotal)}</td></tr>
      </tbody>
    </table>` : ''}

    ${hwRows ? `
    <h3>One-Time Hardware &amp; Installation</h3>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit ${displayCurrency}</th><th class="num">Total ${displayCurrency}</th></tr></thead>
      <tbody>${hwRows}
        <tr class="q-total"><td>Total hardware &amp; installation (excl. VAT)</td><td></td><td></td><td class="num">${cur(q.hardwareTotal)}</td></tr>
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
      <li>All amounts are shown in ${curSym()} ${displayCurrency}${displayCurrency !== 'ZAR' ? ' — converted from South African Rand at the exchange rate configured at time of quoting; final invoicing may differ with prevailing rates.' : '.'}</li>
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
      <td class="num">${cur(r.revenue)}</td>
      <td class="num">${cur(r.marginalCost, 0)}</td>
      <td class="num">${cur(r.monthlyCost)}</td>
      <td class="num">${cur(r.contribution)}</td>
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
      <td class="num">${cur(r.marginalCost, 0)}</td>
      <td class="num">${cur(r.floor50)}</td>
      <td class="num">${cur(r.floor60)}</td>
      <td class="num">${cur(r.effectivePrice)}</td>
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
  document.getElementById('in-users').value = deal.users || 0;
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
  document.getElementById('in-users').addEventListener('input', (e) => { deal.users = Math.max(0, Number(e.target.value) || 0); recompute(); });
  document.getElementById('in-date').addEventListener('input', (e) => { deal.quoteDate = e.target.value; renderQuote(); });

  document.getElementById('hw-single').addEventListener('input', (e) => { deal.hardware.singleTank = Math.max(0, Number(e.target.value) || 0); recompute(); });
  document.getElementById('hw-dual').addEventListener('input', (e) => { deal.hardware.dualTank = Math.max(0, Number(e.target.value) || 0); recompute(); });
  document.getElementById('hw-trailer').addEventListener('input', (e) => { deal.hardware.trailerQty = Math.max(0, Number(e.target.value) || 0); recompute(); });
  document.getElementById('hw-intl').addEventListener('change', (e) => { deal.hardware.outsideSA = e.target.checked; recompute(); });
  document.getElementById('hw-dj-sku').addEventListener('change', (e) => { deal.hardware.items.djHandsetSku = e.target.value; recompute(); });
  document.getElementById('hw-sm-sku').addEventListener('change', (e) => { deal.hardware.items.smHandsetSku = e.target.value; recompute(); });
  document.getElementById('hw-add-install').addEventListener('click', () => {
    if (!deal.hardware.items.customInstall) deal.hardware.items.customInstall = [];
    deal.hardware.items.customInstall.push({ desc: 'Installation', qty: deal.vehicles || 1, rate: 0 });
    recompute();
    document.querySelector('.tab[data-tab="hardware"]').click();
  });

  document.getElementById('rent-term').addEventListener('change', (e) => { deal.rental.termMonths = Number(e.target.value); recompute(); });
  document.getElementById('rent-mode').addEventListener('change', (e) => { deal.rental.mode = e.target.value; recompute(); });

  // Tabs
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector(`.panel[data-panel="${t.dataset.tab}"]`).classList.add('active');
    });
  });

  // Presentation mode toggle (on-screen deterrent only — see comment at top).
  document.getElementById('btn-present').addEventListener('click', () => setPresentationMode(!presentationMode));

  // Sign out
  document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch {}
    location.href = '/login';
  });
}

function setPresentationMode(on) {
  presentationMode = on;
  const internalTabs = ['tab-margin', 'tab-config'];
  const badge = document.getElementById('view-badge');
  const btn = document.getElementById('btn-present');
  if (on) {
    internalTabs.forEach((id) => document.getElementById(id).classList.add('hidden'));
    // If currently on an internal tab, bounce to the client Quote.
    const active = document.querySelector('.tab.active');
    if (active && (active.dataset.tab === 'margin' || active.dataset.tab === 'config')) {
      document.querySelector('.tab[data-tab="quote"]').click();
    }
    badge.textContent = 'CLIENT VIEW'; badge.className = 'view-badge client';
    btn.textContent = '👁 Presentation: ON';
  } else {
    internalTabs.forEach((id) => document.getElementById(id).classList.remove('hidden'));
    badge.textContent = 'INTERNAL VIEW'; badge.className = 'view-badge internal';
    btn.textContent = '👁 Presentation mode';
  }
}

// --- Persistence (REST) -----------------------------------------------------
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); throw new Error('unauthenticated'); }
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

// --- CONFIG EDITOR ----------------------------------------------------------
// editCfg is a working copy of the global config. Save writes it to the server
// (shared) and applies it to the live engine; every quote recomputes from it.
let editCfg = P.getConfig();

async function loadConfig() {
  try {
    const res = await api('GET', '/api/config');
    if (res && res.config) P.setConfig(res.config); // else keep built-in defaults
  } catch (e) { /* offline → defaults */ }
  editCfg = P.getConfig();
  refreshFx();
}

// Pull the active exchange rates (zarPerUnit) into the view-layer formatter.
function refreshFx() {
  const c = P.getConfig().currency || {};
  fxRates = Object.assign({ ZAR: 1, USD: 18.5, EUR: 20, GBP: 23.5, NGN: 0.0113 }, c.zarPerUnit || {}, { ZAR: 1 });
}

function initCurrencySelector() {
  const sel = document.getElementById('currency-select');
  if (!CURRENCIES[displayCurrency]) displayCurrency = 'ZAR';
  sel.innerHTML = Object.keys(CURRENCIES)
    .map((c) => `<option value="${c}" ${c === displayCurrency ? 'selected' : ''}>${CURRENCIES[c].symbol} ${c}</option>`).join('');
  sel.addEventListener('change', (e) => {
    displayCurrency = e.target.value;
    try { localStorage.setItem('sps_currency', displayCurrency); } catch (_) { /* ignore */ }
    if (result) renderAll();
  });
}

// Fetch live ZAR exchange rates into the config editor (user still Saves to apply).
async function fetchLiveRates() {
  const msg = document.getElementById('fx-fetch-msg');
  if (msg) { msg.textContent = 'Fetching…'; msg.style.color = 'var(--text-dim)'; }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/ZAR');
    const data = await res.json();
    if (!data || !data.rates) throw new Error('no rates in response');
    ['USD', 'EUR', 'GBP', 'NGN'].forEach((code) => {
      const r = Number(data.rates[code]);
      if (r > 0) editCfg.currency.zarPerUnit[code] = 1 / r;
    });
    editCfg.currency.zarPerUnit.ZAR = 1;
    editCfg.currency.updatedAt = new Date().toISOString();
    renderConfig();
    const m2 = document.getElementById('fx-fetch-msg');
    if (m2) { m2.textContent = 'Live rates loaded — click Save configuration to apply.'; m2.style.color = 'var(--good)'; }
  } catch (e) {
    const m2 = document.getElementById('fx-fetch-msg');
    if (m2) { m2.textContent = 'Fetch failed (' + e.message + '). Enter rates manually.'; m2.style.color = 'var(--bad)'; }
  }
}

const getPath = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
function setPath(o, path, v) {
  const ks = path.split('.'); let x = o;
  for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]];
  x[ks[ks.length - 1]] = v;
}
function numIn(path, kind) {
  const raw = getPath(editCfg, path);
  const shown = kind === 'pct' ? Math.round(Number(raw) * 1000) / 10 : raw;
  return `<input class="cell-input num" type="number" step="any" data-path="${path}" data-kind="${kind}" value="${shown}">`;
}
function textIn(path, width) {
  return `<input class="cell-input" type="text" data-path="${path}" data-kind="text" value="${escapeHtml(getPath(editCfg, path) || '')}" style="width:${width || 160}px">`;
}
function boolIn(path) {
  return `<input type="checkbox" data-path="${path}" data-kind="bool" ${getPath(editCfg, path) ? 'checked' : ''}>`;
}

function renderConfig() {
  const c = editCfg;
  const productOpts = (sel) => '<option value="">— none —</option>' +
    c.products.map((p) => `<option value="${p.key}" ${sel && sel === p.key ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');

  const billingSel = (i, val) => `<select class="cell-input" data-path="products.${i}.billing" data-kind="text" style="min-width:110px">
      <option value="perVehicle" ${val === 'perVehicle' ? 'selected' : ''}>Per vehicle</option>
      <option value="perUser" ${val === 'perUser' ? 'selected' : ''}>Per user</option>
      <option value="flat" ${val === 'flat' ? 'selected' : ''}>Flat / month</option>
    </select>`;
  const productRows = c.products.map((p, i) => `
    <tr>
      <td>${textIn(`products.${i}.name`, 150)}</td>
      <td class="num">${numIn(`products.${i}.marginalCost`, 'money')}</td>
      <td class="num">${numIn(`products.${i}.targetGM`, 'pct')}</td>
      <td class="num">${numIn(`products.${i}.stepThreshold`, 'num')}</td>
      <td>${billingSel(i, p.billing)}</td>
      <td style="text-align:center">${boolIn(`products.${i}.bundleEligible`)}</td>
      <td style="text-align:center">${boolIn(`products.${i}.volumeEligible`)}</td>
      <td class="num" data-derived="plist:${i}"></td>
      <td><button class="btn cfg-del" data-del="products:${i}">✕</button></td>
    </tr>`).join('');

  const volRows = c.volumeTiers.map((t, i) => `
    <tr>
      <td class="num">${numIn(`volumeTiers.${i}.min`, 'num')}</td>
      <td class="num">${numIn(`volumeTiers.${i}.max`, 'num')}</td>
      <td>${textIn(`volumeTiers.${i}.name`, 120)}</td>
      <td class="num">${numIn(`volumeTiers.${i}.discount`, 'pct')}</td>
      <td><button class="btn cfg-del" data-del="volumeTiers:${i}">✕</button></td>
    </tr>`).join('');

  const bundleKeys = Object.keys(c.bundleSchedule).sort((a, b) => a - b);
  const bundleRows = bundleKeys.map((k) => `
    <tr><td class="num">${k}</td><td class="num">${numIn(`bundleSchedule.${k}`, 'pct')}</td>
    <td><button class="btn cfg-del" data-del="bundleSchedule:${k}">✕</button></td></tr>`).join('');

  const catKeys = Object.keys(c.hardwareCatalog);
  const catRows = catKeys.map((k) => `
    <tr>
      <td><code>${k}</code></td>
      <td>${textIn(`hardwareCatalog.${k}.sku`, 240)}</td>
      <td class="num">${numIn(`hardwareCatalog.${k}.cost`, 'money')}</td>
      <td class="num" data-derived="hsell:${k}"></td>
      <td style="text-align:center">${c.handsetOptions.indexOf(k) > -1 ? '☑' : ''}
        <input type="checkbox" data-handset="${k}" ${c.handsetOptions.indexOf(k) > -1 ? 'checked' : ''}></td>
      <td><button class="btn cfg-del" data-del="hardwareCatalog:${k}">✕</button></td>
    </tr>`).join('');

  const instRows = c.installItems.map((it, i) => `
    <tr>
      <td>${textIn(`installItems.${i}.name`, 240)}</td>
      <td class="num">${numIn(`installItems.${i}.rate`, 'money')}</td>
      <td><button class="btn cfg-del" data-del="installItems:${i}">✕</button></td>
    </tr>`).join('');

  const actRows = c.implActivities.map((a, i) => `
    <tr>
      <td>${textIn(`implActivities.${i}.desc`, 200)}</td>
      <td class="num">${numIn(`implActivities.${i}.hours`, 'num')}</td>
      <td style="text-align:center">${boolIn(`implActivities.${i}.senior`)}</td>
      <td class="num">${numIn(`implActivities.${i}.discount`, 'pct')}</td>
      <td><select class="cell-input" data-path="implActivities.${i}.product" data-kind="text">${productOpts(a.product)}</select></td>
      <td><button class="btn cfg-del" data-del="implActivities:${i}">✕</button></td>
    </tr>`).join('');

  document.getElementById('config-root').innerHTML = `
    <div class="card">
      <h2>Products <button class="btn cfg-add" data-add="product">＋ Add product</button></h2>
      <table class="data">
        <thead><tr><th>Name</th><th class="num">Marginal Cost R</th><th class="num">Target GM %</th><th class="num">Step Threshold</th><th>Billing</th><th title="Eligible for bundle discount">Bundle?</th><th title="Eligible for volume discount">Volume?</th><th class="num">List Price R (auto)</th><th></th></tr></thead>
        <tbody>${productRows}</tbody>
      </table>
      <table class="kv compact"><tr><td>Step cost (R/mo per step)</td><td>${numIn('stepCost', 'money')}</td></tr></table>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2>Bundle Discount (by # products) <button class="btn cfg-add" data-add="bundle">＋</button></h2>
        <table class="data"><thead><tr><th># Products</th><th class="num">Discount %</th><th></th></tr></thead><tbody>${bundleRows}</tbody></table>
      </div>
      <div class="card">
        <h2>Volume Tiers <button class="btn cfg-add" data-add="volume">＋ Add tier</button></h2>
        <table class="data"><thead><tr><th class="num">Min Veh</th><th class="num">Max Veh</th><th>Name</th><th class="num">Discount %</th><th></th></tr></thead><tbody>${volRows}</tbody></table>
      </div>
    </div>

    <div class="card">
      <h2>Hardware Catalog <button class="btn cfg-add" data-add="hardware">＋ Add item</button></h2>
      <table class="data">
        <thead><tr><th>Key</th><th>SKU / description</th><th class="num">Cost R</th><th class="num">Sell R (auto)</th><th>Handset option?</th><th></th></tr></thead>
        <tbody>${catRows}</tbody>
      </table>
      <table class="kv compact">
        <tr><td>Hardware markup %</td><td>${numIn('hardwareMarkup', 'pct')}</td></tr>
        <tr><td>International shipping surcharge %</td><td>${numIn('intlShippingSurcharge', 'pct')}</td></tr>
        <tr><td>Install — GPS only (R)</td><td>${numIn('installRates.gpsAlone', 'money')}</td></tr>
        <tr><td>Install — Fuel Kit single-tank (R)</td><td>${numIn('installRates.fuelKitSingle', 'money')}</td></tr>
        <tr><td>Install — Fuel Kit dual-tank (R)</td><td>${numIn('installRates.fuelKitDual', 'money')}</td></tr>
        <tr><td>Install — Trailer GPS (R)</td><td>${numIn('installRates.trailerGps', 'money')}</td></tr>
      </table>
      <h2 style="margin-top:16px">Installation Items <button class="btn cfg-add" data-add="installItem">＋ Add installation item</button></h2>
      <table class="data">
        <thead><tr><th>Name</th><th class="num">Rate R</th><th></th></tr></thead>
        <tbody>${instRows}</tbody>
      </table>
      <p class="note">Reusable installation charges. On the Hardware tab, “＋ Add installation” lets you pick one of these (auto-filling its rate) or type a one-off. (The four rates above are the auto-computed scenarios and stay separate.)</p>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2>Implementation Activities <button class="btn cfg-add" data-add="activity">＋ Add activity</button></h2>
        <table class="data">
          <thead><tr><th>Description</th><th class="num">Hours</th><th>Senior?</th><th class="num">Disc %</th><th>Bills w/ product</th><th></th></tr></thead>
          <tbody>${actRows}</tbody>
        </table>
        <table class="kv compact">
          <tr><td>Consultant rate (R/hr)</td><td>${numIn('rates.consultant', 'money')}</td></tr>
          <tr><td>Senior Consultant rate (R/hr)</td><td>${numIn('rates.senior', 'money')}</td></tr>
        </table>
      </div>
      <div class="card">
        <h2>Rental</h2>
        <table class="kv">
          <tr><td>Cost of capital (annual %)</td><td>${numIn('rental.costOfCapital', 'pct')}</td></tr>
          <tr><td>Financing margin (annual %)</td><td>${numIn('rental.financingMargin', 'pct')}</td></tr>
          <tr><td>Rental annual rate (auto)</td><td class="num" data-derived="rate:0"></td></tr>
          <tr><td>Renewal support fee (%/mo of hardware)</td><td>${numIn('rental.renewalSupportFeeMonthly', 'pct')}</td></tr>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Currency &amp; Exchange Rates</h2>
      <table class="kv compact">
        <tr><td>Rate mode</td><td>
          <label><input type="radio" name="curmode" value="manual" ${c.currency.mode !== 'auto' ? 'checked' : ''}> Manual</label>
          <label style="margin-left:14px"><input type="radio" name="curmode" value="auto" ${c.currency.mode === 'auto' ? 'checked' : ''}> Auto (live)</label>
          <button class="btn" id="cfg-fetch-fx" type="button" style="margin-left:14px">↻ Fetch live rates now</button>
          <span id="fx-fetch-msg" class="note" style="margin:0 0 0 8px"></span>
        </td></tr>
        ${c.currency.updatedAt ? `<tr class="subtle"><td>Rates last fetched</td><td>${new Date(c.currency.updatedAt).toLocaleString()}</td></tr>` : ''}
      </table>
      <table class="data">
        <thead><tr><th>Currency</th><th class="num">1 unit = R (Rand)</th><th class="num">≈ per R1</th></tr></thead>
        <tbody>
          ${['USD', 'EUR', 'GBP', 'NGN'].map((code) => `
            <tr>
              <td>${CURRENCIES[code].symbol} ${code} — ${CURRENCIES[code].name}</td>
              <td class="num">${numIn('currency.zarPerUnit.' + code, 'num')}</td>
              <td class="num" data-derived="fx:${code}"></td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="note">Base currency is Rand (ZAR = 1). Enter how many Rand one unit of each currency is worth, or click “Fetch live rates”. The display-currency toggle (top-right) converts every figure across the app using these rates. Rates are shared and saved with the configuration.</p>
    </div>`;

  refreshDerived();
}

function refreshDerived() {
  document.querySelectorAll('#config-root [data-derived]').forEach((el) => {
    const [type, idx] = el.dataset.derived.split(':');
    if (type === 'plist') { const p = editCfg.products[+idx]; el.textContent = fmt(p.targetGM < 1 ? p.marginalCost / (1 - p.targetGM) : 0); }
    else if (type === 'hsell') { const it = editCfg.hardwareCatalog[idx]; el.textContent = fmt((it.cost || 0) * (1 + editCfg.hardwareMarkup)); }
    else if (type === 'rate') { el.textContent = pct(editCfg.rental.costOfCapital + editCfg.rental.financingMargin); }
    else if (type === 'fx') { const z = Number(editCfg.currency.zarPerUnit[idx]); el.textContent = z > 0 ? (CURRENCIES[idx].symbol + ' ' + (1 / z).toFixed(4)) : '—'; }
  });
}

function wireConfig() {
  const root = document.getElementById('config-root');

  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.handset !== undefined) {
      const key = el.dataset.handset;
      const arr = editCfg.handsetOptions;
      const at = arr.indexOf(key);
      if (el.checked && at === -1) arr.push(key);
      if (!el.checked && at > -1) arr.splice(at, 1);
      return;
    }
    if (el.name === 'curmode') { editCfg.currency.mode = el.value; return; }
    const path = el.dataset.path;
    if (!path) return;
    const kind = el.dataset.kind;
    let v;
    if (kind === 'text') v = el.value;
    else if (kind === 'bool') v = el.checked;
    else { v = Number(el.value) || 0; if (kind === 'pct') v = v / 100; }
    setPath(editCfg, path, v);
    refreshDerived();
  });

  root.addEventListener('click', (e) => {
    if (e.target.id === 'cfg-fetch-fx') { fetchLiveRates(); return; }
    const add = e.target.dataset.add;
    const del = e.target.dataset.del;
    if (add) {
      if (add === 'product') editCfg.products.push({ key: 'p' + Math.random().toString(36).slice(2, 8), name: 'New Product', marginalCost: 0, targetGM: 0.75, stepThreshold: 300, billing: 'perVehicle', bundleEligible: true, volumeEligible: true });
      else if (add === 'volume') editCfg.volumeTiers.push({ min: 0, max: 999999, name: 'New Tier', discount: 0 });
      else if (add === 'bundle') { const next = Object.keys(editCfg.bundleSchedule).length + 1; editCfg.bundleSchedule[next] = 0; }
      else if (add === 'hardware') { const k = P.slug('item ' + (Object.keys(editCfg.hardwareCatalog).length + 1)); editCfg.hardwareCatalog[k] = { sku: 'New Item', cost: 0, note: '' }; }
      else if (add === 'installItem') editCfg.installItems.push({ key: 'ii' + Math.random().toString(36).slice(2, 8), name: 'New Installation', rate: 0 });
      else if (add === 'activity') editCfg.implActivities.push({ desc: 'New Activity', hours: 0, senior: true, discount: 0 });
      renderConfig();
    } else if (del) {
      const [kind, id] = del.split(':');
      if (kind === 'products') editCfg.products.splice(+id, 1);
      else if (kind === 'volumeTiers') editCfg.volumeTiers.splice(+id, 1);
      else if (kind === 'implActivities') editCfg.implActivities.splice(+id, 1);
      else if (kind === 'bundleSchedule') delete editCfg.bundleSchedule[id];
      else if (kind === 'hardwareCatalog') delete editCfg.hardwareCatalog[id];
      else if (kind === 'installItems') editCfg.installItems.splice(+id, 1);
      renderConfig();
    }
  });

  document.getElementById('cfg-save').addEventListener('click', async () => {
    try {
      // Normalise through the engine (assigns product keys, coerces types), then persist.
      const normalized = P.setConfig(editCfg);
      await api('PUT', '/api/config', { config: normalized });
      editCfg = P.getConfig();
      refreshFx(); // pick up any changed exchange rates
      // Rebuild the current deal's product selection/activities against the new config,
      // preserving existing selections where the product still exists.
      reconcileDealWithConfig();
      renderConfig();
      recompute();
      setConfigStatus('Configuration saved — applied to all quotes.');
    } catch (e) {
      setConfigStatus('Save failed: ' + e.message, true);
    }
  });

  document.getElementById('cfg-reload').addEventListener('click', async () => {
    await loadConfig();
    renderConfig();
    setConfigStatus('Reloaded saved configuration.');
  });

  document.getElementById('cfg-reset').addEventListener('click', () => {
    if (!confirm('Reset the editor to the built-in workbook defaults? (Not saved until you click Save.)')) return;
    editCfg = P.getDefaultConfig();
    renderConfig();
    setConfigStatus('Editor reset to workbook defaults — click Save to apply.');
  });
}

function setConfigStatus(text, isErr) {
  const el = document.getElementById('config-status');
  el.textContent = text;
  el.style.color = isErr ? 'var(--bad)' : 'var(--good)';
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 5000);
}

// Keep the open deal consistent when products change: drop selections/handsets for
// products that no longer exist; leave everything else intact.
function reconcileDealWithConfig() {
  const keys = new Set(P.getConfig().products.map((p) => p.key));
  Object.keys(deal.selected).forEach((k) => { if (!keys.has(k)) delete deal.selected[k]; });
}

// --- Init -------------------------------------------------------------------
async function init() {
  await loadConfig();          // apply shared config (incl. FX rates) before first render
  deal = defaultDeal();        // build defaults from the (now loaded) config
  initCurrencySelector();
  wireInputs();
  wireConfig();
  syncInputsFromDeal();
  renderConfig();
  recompute();

  document.getElementById('drawer-toggle').addEventListener('click', () => {
    document.getElementById('drawer').classList.toggle('open'); refreshQuoteList();
  });
  document.getElementById('drawer-close').addEventListener('click', () => document.getElementById('drawer').classList.remove('open'));
  document.getElementById('btn-save').addEventListener('click', saveCurrent);
  document.getElementById('btn-new').addEventListener('click', () => {
    deal = defaultDeal(); currentId = null;
    syncInputsFromDeal(); recompute(); setSaveStatus('New quote started.');
  });

  refreshQuoteList();
}

document.addEventListener('DOMContentLoaded', init);
