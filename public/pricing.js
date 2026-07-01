/*
 * Sunstone Pricing Engine — single source of truth for ALL calculations.
 *
 * Transcribed cell-for-cell from Sunstone_Pricing_Calculator.xlsx (verified
 * with openpyxl, data_only=False). Where the build spec disagreed with the
 * workbook, the workbook wins (see README "Discrepancies"). The most important
 * one: Fuel uses a 75% target GM (Config!C6 = 0.75 -> list R332), NOT 85%.
 *
 * CONFIG IS NOW DATA, NOT CODE. DEFAULT_CONFIG below matches the workbook exactly
 * (so the verification suite still passes). At runtime the active config can be
 * replaced via setConfig() — the Config page saves an edited config to the server
 * (D1 / SQLite) and every calculation reads from the active config, so pricing
 * changes and new products apply everywhere at once.
 *
 * This module is environment-agnostic: it runs unchanged in Node (test script
 * + server) and in the browser (UI). No DOM, no I/O.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DEFAULT CONFIG  (mirror of the Config sheet — the workbook baseline)
  // ---------------------------------------------------------------------------
  const DEFAULT_CONFIG = {
    // Product pricing. listPrice = marginalCost / (1 - targetGM).
    // `key` is the stable id used across sheets; `quoteLabel` is what the client sees.
    products: [
      { key: 'tracking',       name: 'Tracking',        quoteLabel: 'Tracking',        calcLabel: 'Tracking',           marginalCost: 83,  targetGM: 0.70, stepThreshold: 300 },
      { key: 'fuel',           name: 'Fuel',            quoteLabel: 'Fuel',            calcLabel: 'Fuel plus tracking', marginalCost: 83,  targetGM: 0.75, stepThreshold: 300 },
      { key: 'routeBuilder',   name: 'Route Builder',   quoteLabel: 'Route Builder',   calcLabel: 'Route Builder',      marginalCost: 50,  targetGM: 0.75, stepThreshold: 500 },
      { key: 'digitalJourney', name: 'Digital Journey', quoteLabel: 'Digital Journey', calcLabel: 'Digital Journey',    marginalCost: 83,  targetGM: 0.75, stepThreshold: 300 },
      { key: 'stockMaster',    name: 'Stock Master',    quoteLabel: 'Stock Master',    calcLabel: 'Stock Master',       marginalCost: 250, targetGM: 0.75, stepThreshold: 100 },
    ],
    stepCost: 25000, // R/mo per step (advisory)

    // Bundle discount schedule, keyed by count of selected products.
    bundleSchedule: { 1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.20 },

    // Volume cliff tiers. Excel VLOOKUP approx: pick the LAST tier whose min <= vehicles.
    volumeTiers: [
      { min: 1,    max: 50,     name: 'SMB',        discount: 0.00 },
      { min: 51,   max: 200,    name: 'Mid-market', discount: 0.05 },
      { min: 201,  max: 500,    name: 'Upper mid',  discount: 0.10 },
      { min: 501,  max: 2000,   name: 'Large',      discount: 0.18 },
      { min: 2000, max: 999999, name: 'Enterprise', discount: 0.25 },
    ],

    // Hardware catalog. sell = cost * (1 + hardwareMarkup).
    hardwareMarkup: 0.25,
    hardwareCatalog: {
      blackviewFort1:  { sku: 'Blackview Fort 1',                              cost: 3938, note: 'Handset option 1' },
      blackviewBV6200: { sku: 'Blackview BV6200',                              cost: 3999, note: 'Handset option 2' },
      oukitelG1S:      { sku: 'Oukitel G1S',                                   cost: 2973, note: 'Handset option 3' },
      urovoK419:       { sku: 'Urovo Printer K419 (incl. case + car charger)', cost: 3606, note: 'Mobile thermal printer (DJ)' },
      teltonikaFMB125: { sku: 'Teltonika FMB125',                              cost: 639,  note: 'Vehicle GPS — 1 per vehicle' },
      queclinkGV620MG: { sku: 'Queclink GV620MG',                              cost: 1403, note: 'Trailer GPS — 1 per trailer' },
      omnicommLS4:     { sku: 'Omnicomm LS4',                                  cost: 1749, note: 'Fuel probe — 1 per tank' },
      streamax3cam:    { sku: 'Streamax 3 camera',                             cost: 8712, note: 'Streamax 3 camera plus' },
    },
    handsetOptions: ['blackviewFort1', 'blackviewBV6200', 'oukitelG1S'],

    // Installation charges (advisory rates; auto-picked per scenario).
    installRates: { gpsAlone: 800, fuelKitSingle: 1600, fuelKitDual: 2200, trailerGps: 800 },
    // Reusable named installation items, addable in Config and pickable when
    // adding an installation line on the Hardware tab: [{ key, name, rate }].
    installItems: [
      { key: 'cameraInstall', name: 'Camera installation', rate: 1500 },
    ],
    intlShippingSurcharge: 0.20, // hardware items only

    // Implementation rates.
    rates: { consultant: 1000, senior: 1325 },
    // Default implementation activities. `product` ties a training row to a product.
    implActivities: [
      { desc: 'Project Management',            hours: 30, senior: true,  discount: 0 },
      { desc: 'Design and Integration',        hours: 15, senior: true,  discount: 0 },
      { desc: 'MasterData and Database setup', hours: 10, senior: true,  discount: 0 },
      { desc: 'Reporting setup',               hours: 5,  senior: true,  discount: 0 },
      { desc: 'Testing',                       hours: 10, senior: true,  discount: 0 },
      { desc: 'User Acceptance Testing',       hours: 5,  senior: true,  discount: 0 },
      { desc: 'Training — Tracking',           hours: 5,  senior: true,  discount: 0, product: 'tracking' },
      { desc: 'Training — Fuel',               hours: 5,  senior: true,  discount: 0, product: 'fuel' },
      { desc: 'Training — Route Builder',      hours: 10, senior: true,  discount: 0, product: 'routeBuilder' },
      { desc: 'Training — Digital Journey',    hours: 10, senior: true,  discount: 0, product: 'digitalJourney' },
      { desc: 'Training — Stock Master',       hours: 10, senior: false, discount: 0, product: 'stockMaster' },
      { desc: 'Go Live and Hypercare',         hours: 40, senior: true,  discount: 1, note: 'Default 100% discount (value-add)' },
    ],

    // Rental config. annualRate = costOfCapital + financingMargin.
    rental: { costOfCapital: 0.13, financingMargin: 0.05, renewalSupportFeeMonthly: 0.0075, terms: [12, 24, 36] },

    // Display currency. Base of ALL pricing is ZAR; these are display conversions.
    // zarPerUnit = how many Rand 1 unit of the currency is worth (ZAR is always 1).
    // mode 'manual' = rates entered by hand; 'auto' = fetched from a live source.
    // Placeholder rates below are approximate — set them manually or fetch live.
    currency: {
      mode: 'manual',
      zarPerUnit: { ZAR: 1, USD: 18.5, EUR: 20, GBP: 23.5, NGN: 0.0113 },
      updatedAt: null,
    },
  };
  const CURRENCY_DEFAULTS = { ZAR: 1, USD: 18.5, EUR: 20, GBP: 23.5, NGN: 0.0113 };

  // ---------------------------------------------------------------------------
  // ACTIVE CONFIG + accessors
  // ---------------------------------------------------------------------------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const num = (v, d) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? d : Number(v));

  function slug(s) {
    const base = String(s || '').trim().replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ')
      .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('');
    return base || ('product' + Math.random().toString(36).slice(2, 7));
  }

  function normalizeProduct(p, idx) {
    const name = p.name || p.key || ('Product ' + (idx + 1));
    return {
      key: p.key || slug(name),
      name,
      quoteLabel: p.quoteLabel || name,
      calcLabel: p.calcLabel || name,
      marginalCost: num(p.marginalCost, 0),
      targetGM: num(p.targetGM, 0.75),
      stepThreshold: num(p.stepThreshold, 300),
    };
  }

  // Merge a (possibly partial / user-edited) config over the defaults so missing
  // pieces always fall back to the workbook baseline and stay well-formed.
  function mergeConfig(cfg) {
    cfg = cfg || {};
    const d = DEFAULT_CONFIG;
    return {
      products: (Array.isArray(cfg.products) && cfg.products.length ? cfg.products : d.products).map(normalizeProduct),
      stepCost: num(cfg.stepCost, d.stepCost),
      bundleSchedule: (cfg.bundleSchedule && Object.keys(cfg.bundleSchedule).length) ? cfg.bundleSchedule : clone(d.bundleSchedule),
      volumeTiers: (Array.isArray(cfg.volumeTiers) && cfg.volumeTiers.length ? cfg.volumeTiers : clone(d.volumeTiers))
        .map((t) => ({ min: num(t.min, 1), max: num(t.max, 999999), name: t.name || 'Tier', discount: num(t.discount, 0) })),
      hardwareMarkup: num(cfg.hardwareMarkup, d.hardwareMarkup),
      // Keep the wired keys present (calc references them), overlaying user edits.
      hardwareCatalog: Object.assign(clone(d.hardwareCatalog), cfg.hardwareCatalog || {}),
      handsetOptions: (Array.isArray(cfg.handsetOptions) && cfg.handsetOptions.length) ? cfg.handsetOptions : clone(d.handsetOptions),
      installRates: Object.assign({}, d.installRates, cfg.installRates || {}),
      installItems: Array.isArray(cfg.installItems) ? cfg.installItems.map((x, i) => ({
        key: x.key || ('ii' + i), name: x.name || 'Installation', rate: num(x.rate, 0),
      })) : clone(d.installItems),
      intlShippingSurcharge: num(cfg.intlShippingSurcharge, d.intlShippingSurcharge),
      rates: Object.assign({}, d.rates, cfg.rates || {}),
      implActivities: Array.isArray(cfg.implActivities) ? cfg.implActivities.map((a) => ({
        desc: a.desc || 'Activity', hours: num(a.hours, 0), senior: !!a.senior,
        discount: num(a.discount, 0), product: a.product || undefined, note: a.note || undefined,
      })) : clone(d.implActivities),
      rental: Object.assign({}, d.rental, cfg.rental || {}),
      currency: {
        mode: (cfg.currency && cfg.currency.mode) === 'auto' ? 'auto' : 'manual',
        zarPerUnit: Object.assign({}, CURRENCY_DEFAULTS, (cfg.currency && cfg.currency.zarPerUnit) || {}, { ZAR: 1 }),
        updatedAt: (cfg.currency && cfg.currency.updatedAt) || null,
      },
    };
  }

  let activeConfig = mergeConfig(clone(DEFAULT_CONFIG));
  function setConfig(cfg) { activeConfig = mergeConfig(cfg || {}); return getConfig(); }
  function getConfig() { return clone(activeConfig); }
  function getDefaultConfig() { return clone(DEFAULT_CONFIG); }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  function listPrice(p) { return p.marginalCost / (1 - p.targetGM); }
  function sellPrice(item, markup) {
    const m = markup === undefined ? activeConfig.hardwareMarkup : markup;
    return (item ? item.cost : 0) * (1 + m);
  }

  function bundleMultiplier(count) {
    const disc = activeConfig.bundleSchedule[count];
    return disc === undefined ? { discount: 0, multiplier: 1 } : { discount: disc, multiplier: 1 - disc };
  }

  function volumeTier(vehicles) {
    const tiers = activeConfig.volumeTiers;
    let match = tiers[0];
    for (const t of tiers) { if (t.min <= vehicles) match = t; }
    return { name: match.name, discount: match.discount, multiplier: 1 - match.discount };
  }

  // Excel PMT(rate, nper, pv) -> payment (positive here; Excel returns negative).
  function pmt(monthlyRate, nper, pv) {
    if (nper <= 0) return 0;
    if (monthlyRate === 0) return pv / nper;
    return (pv * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -nper));
  }

  // ---------------------------------------------------------------------------
  // SUBSCRIPTION
  // ---------------------------------------------------------------------------
  function calcSubscription(input) {
    const vehicles = Number(input.vehicles) || 0;
    const selected = input.selected || {};
    const products = activeConfig.products;

    const count = products.reduce((n, p) => n + (selected[p.key] ? 1 : 0), 0);
    const bundle = bundleMultiplier(count);
    const volume = volumeTier(vehicles);

    const lines = products.map((p) => {
      const list = listPrice(p);
      const effective = list * bundle.multiplier * volume.multiplier;
      const isSel = !!selected[p.key];
      const monthly = isSel ? effective * vehicles : 0;
      return {
        key: p.key, name: p.name, quoteLabel: p.quoteLabel, calcLabel: p.calcLabel,
        selected: isSel, listPrice: list, effectivePrice: effective,
        monthly, annual: monthly * 12,
      };
    });

    const totalMonthly = lines.reduce((s, l) => s + l.monthly, 0);

    // KNOWN BUG (replicated, not fixed): Fuel already includes Tracking, but
    // selecting both is NOT blocked — both line items are still summed. We warn
    // and let the quote proceed, exactly like the sheet. (Only checked when both
    // the 'tracking' and 'fuel' product keys still exist.)
    const fuelTrackingConflict = !!(selected.tracking && selected.fuel);

    return {
      vehicles, productCount: count, bundle, volume, lines, totalMonthly,
      totalAnnual: totalMonthly * 12,
      blendedPerVehicle: vehicles ? totalMonthly / vehicles : 0,
      effectiveBlendedDiscount: 1 - bundle.multiplier * volume.multiplier,
      fuelTrackingConflict,
      configCheck: fuelTrackingConflict
        ? 'INVALID: Fuel already includes Tracking. Please deselect one.'
        : 'Configuration is valid.',
    };
  }

  // ---------------------------------------------------------------------------
  // HARDWARE
  // ---------------------------------------------------------------------------
  function calcHardware(input) {
    const vehicles = Number(input.vehicles) || 0;
    const single = Number(input.singleTank) || 0;
    const dual = Number(input.dualTank) || 0;
    const trailerQty = Number(input.trailerQty) || 0;
    const trackingOnlyQty = Math.max(vehicles - single - dual, 0);
    const it = input.items || {};

    const cat = activeConfig.hardwareCatalog;
    const item = (k) => cat[k] || { sku: k, cost: 0 };
    const opts = activeConfig.handsetOptions;

    const djSku = it.djHandsetSku || opts[0] || 'blackviewFort1';
    const smSku = it.smHandsetSku || opts[opts.length - 1] || 'oukitelG1S';
    const printerSell = sellPrice(item('urovoK419'));
    const gpsSell = sellPrice(item('teltonikaFMB125'));
    const trailerSell = sellPrice(item('queclinkGV620MG'));
    const probeSell = sellPrice(item('omnicommLS4'));
    const fuelKitSingleSell = gpsSell + probeSell;
    const fuelKitDualSell = gpsSell + 2 * probeSell;
    const ir = activeConfig.installRates;

    const baseRows = [
      { id: 'djHandset',  desc: `Digital Journey Handset (${item(djSku).sku})`, include: !!it.djHandsetInclude, qty: vehicles,        unit: sellPrice(item(djSku)) },
      { id: 'smHandset',  desc: `Stock Master Handset (${item(smSku).sku})`,    include: !!it.smHandsetInclude, qty: vehicles,        unit: sellPrice(item(smSku)) },
      { id: 'printer',    desc: item('urovoK419').sku,                          include: !!it.printerInclude,   qty: vehicles,        unit: printerSell },
      { id: 'vehicleGps', desc: `Vehicle GPS Tracker (${item('teltonikaFMB125').sku})`, include: !!it.vehicleGpsInclude, qty: trackingOnlyQty, unit: gpsSell },
      { id: 'trailerGps', desc: `Trailer GPS Tracker (${item('queclinkGV620MG').sku})`, include: !!it.trailerGpsInclude, qty: trailerQty,      unit: trailerSell },
      { id: 'fuelKitSingle', desc: 'Fuel Probe Kit — Single-Tank (GPS + 1 probe)', include: !!it.fuelKitSingleInclude, qty: single, unit: fuelKitSingleSell },
      { id: 'fuelKitDual',   desc: 'Fuel Probe Kit — Dual-Tank (GPS + 2 probes)',  include: !!it.fuelKitDualInclude,   qty: dual,   unit: fuelKitDualSell },
    ];

    // Additional hardware items: any catalogued SKU (including ones created in
    // Config) added to this quote with a manual quantity. Always "included".
    (it.custom || []).forEach((cu, i) => {
      const c = item(cu.key);
      baseRows.push({ id: 'custom:' + i, custom: true, catalogKey: cu.key, desc: c.sku, include: true, qty: Number(cu.qty) || 0, unit: sellPrice(c) });
    });

    const rows = baseRows.map((r) => ({ ...r, subtotal: (r.include ? 1 : 0) * r.qty * r.unit }));

    const hardwareSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
    const shippingSurcharge = input.outsideSA ? hardwareSubtotal * activeConfig.intlShippingSurcharge : 0;
    const hardwareTotal = hardwareSubtotal + shippingSurcharge;

    const baseInstall = [
      { id: 'gpsInstall',        desc: 'GPS Tracking installation',                 qty: it.vehicleGpsInclude ? trackingOnlyQty : 0, rate: ir.gpsAlone },
      { id: 'fuelKitSingleInst', desc: 'Fuel Probe Kit installation — single-tank', qty: it.fuelKitSingleInclude ? single : 0,       rate: ir.fuelKitSingle },
      { id: 'fuelKitDualInst',   desc: 'Fuel Probe Kit installation — dual-tank',   qty: it.fuelKitDualInclude ? dual : 0,           rate: ir.fuelKitDual },
      { id: 'trailerInstall',    desc: 'Trailer GPS installation',                  qty: it.trailerGpsInclude ? trailerQty : 0,      rate: ir.trailerGps },
    ];

    // Manually-added installation lines: [{ desc, qty, rate }].
    (it.customInstall || []).forEach((ci, i) => {
      baseInstall.push({ id: 'customInstall:' + i, custom: true, desc: ci.desc || 'Installation', qty: Number(ci.qty) || 0, rate: Number(ci.rate) || 0 });
    });

    const installRows = baseInstall.map((r) => ({ ...r, subtotal: r.qty * r.rate }));

    const installSubtotal = installRows.reduce((s, r) => s + r.subtotal, 0);

    return {
      vehicles, single, dual, trailerQty, trackingOnlyQty,
      outsideSA: !!input.outsideSA, rows, installRows,
      hardwareSubtotal, shippingSurcharge, hardwareTotal, installSubtotal,
      grandTotal: hardwareTotal + installSubtotal,
    };
  }

  // ---------------------------------------------------------------------------
  // IMPLEMENTATION
  // ---------------------------------------------------------------------------
  function calcImplementation(input) {
    const selected = input.selected || {};
    const activities = input.activities || activeConfig.implActivities;
    const rates = activeConfig.rates;

    const lines = activities.map((a) => {
      const rate = a.senior ? rates.senior : rates.consultant;
      const enabled = a.enabled !== false; // per-quote on/off toggle (default on)
      const productSelected = a.product ? !!selected[a.product] : true;
      const billed = enabled && productSelected;
      const total = billed ? a.hours * rate * (1 - a.discount) : 0;
      return {
        desc: a.desc, hours: a.hours, senior: !!a.senior, rate,
        discount: a.discount, product: a.product || null, enabled, billed, total, note: a.note || null,
      };
    });

    const total = lines.reduce((s, l) => s + l.total, 0);
    const billableHours = lines.reduce((s, l) => s + (l.billed ? l.hours * (1 - l.discount) : 0), 0);
    return { lines, total, billableHours };
  }

  // ---------------------------------------------------------------------------
  // RENTAL
  // ---------------------------------------------------------------------------
  function calcRental(input) {
    const term = Number(input.termMonths) || 36;
    const mode = input.mode || 'Pure Rental';
    const vehicles = Number(input.vehicles) || 0;
    const monthlySaaS = Number(input.monthlySaaS) || 0;
    const hardwareTotal = Number(input.hardwareTotal) || 0;
    const installTotal = Number(input.installTotal) || 0;
    const implementationTotal = Number(input.implementationTotal) || 0;
    const rc = activeConfig.rental;

    const annualRate = rc.costOfCapital + rc.financingMargin;
    const monthlyRate = annualRate / 12;
    const capital = hardwareTotal + installTotal;
    const monthlyFactor = pmt(monthlyRate, term, 1);
    const monthlyHardwareInstall = pmt(monthlyRate, term, capital);
    const totalMonthly = monthlySaaS + monthlyHardwareInstall;
    const perVehicle = vehicles ? totalMonthly / vehicles : 0;

    const refreshPerVehicle = perVehicle;
    const retainPerVehicle =
      (vehicles ? monthlySaaS / vehicles : 0) +
      (mode === 'Pure Rental' && vehicles ? (hardwareTotal * rc.renewalSupportFeeMonthly) / vehicles : 0);
    const retainSavingVsFirst = perVehicle ? 1 - retainPerVehicle / perVehicle : 0;

    return {
      term, mode, vehicles, annualRate, monthlyFactor,
      monthlySaaS, hardwareTotal, installTotal, capital,
      monthlyHardwareInstall, totalMonthly, perVehicle,
      totalOverTerm: totalMonthly * term,
      purchaseModelUpfront: capital + implementationTotal,
      renewal: { refreshPerVehicle, retainPerVehicle, retainSavingVsFirst },
    };
  }

  // ---------------------------------------------------------------------------
  // INTERNAL MARGIN — INTERNAL VIEW ONLY
  // ---------------------------------------------------------------------------
  function calcInternalMargin(subscription) {
    const vehicles = subscription.vehicles;
    const products = activeConfig.products;
    const stepCost = activeConfig.stepCost;

    const rows = products.map((p, i) => {
      const line = subscription.lines[i];
      const revenue = line.monthly;
      const monthlyCost = line.selected ? p.marginalCost * vehicles : 0;
      const contribution = revenue - monthlyCost;
      const grossMargin = revenue ? contribution / revenue : 0;

      let stepWarning = '—';
      let stepCount = 0;
      if (line.selected && vehicles >= p.stepThreshold) {
        stepCount = Math.floor(vehicles / p.stepThreshold);
        stepWarning = `⚠ ${stepCount} step(s) crossed: +R${(stepCount * stepCost).toLocaleString('en-ZA')}/mo cost`;
      } else if (line.selected) {
        stepWarning = 'ok';
      }

      const floor50 = p.marginalCost * 2;
      const floor60 = p.marginalCost / 0.4;
      let floorStatus;
      if (line.effectivePrice < floor50) floorStatus = '🚨 BELOW 50% FLOOR';
      else if (line.effectivePrice < floor60) floorStatus = '⚠ Below 60%';
      else floorStatus = '✓ Healthy';

      return {
        key: p.key, name: p.name, selected: line.selected,
        revenue, marginalCost: p.marginalCost, monthlyCost, contribution, grossMargin,
        stepCount, stepWarning, floor50, floor60, effectivePrice: line.effectivePrice, floorStatus,
      };
    });

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalCost = rows.reduce((s, r) => s + r.monthlyCost, 0);
    const totalContribution = totalRevenue - totalCost;

    const grossListValue = subscription.lines.reduce(
      (s, l) => s + (l.selected ? l.listPrice * vehicles : 0), 0);
    const bundleDisc = -grossListValue * subscription.bundle.discount;
    const volumeDisc = -(grossListValue + bundleDisc) * subscription.volume.discount;
    const netSubscription = grossListValue + bundleDisc + volumeDisc;

    return {
      rows, totalRevenue, totalCost, totalContribution,
      totalGrossMargin: totalRevenue ? totalContribution / totalRevenue : 0,
      walkDown: {
        grossListValue, bundleDiscount: bundleDisc, volumeDiscount: volumeDisc, netSubscription,
        effectiveDiscount: grossListValue ? (grossListValue - netSubscription) / grossListValue : 0,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // CLIENT QUOTE PROJECTION — client-safe whitelist (no cost/margin data)
  // ---------------------------------------------------------------------------
  function buildClientQuote(subscription, implementation, hardware) {
    const subscriptionItems = subscription.lines.filter((l) => l.selected).map((l) => ({
      product: l.quoteLabel, vehicles: subscription.vehicles,
      pricePerVehicle: l.effectivePrice, monthly: l.monthly, annual: l.annual,
    }));

    const implementationItems = implementation.lines.filter((l) => l.total > 0)
      .map((l) => ({ desc: l.desc, hours: l.hours, rate: l.rate, discount: l.discount, total: l.total }));

    const hardwareItems = [];
    hardware.rows.filter((r) => r.subtotal > 0).forEach((r) => {
      hardwareItems.push({ desc: r.desc, qty: r.qty, unit: r.unit, total: r.subtotal });
    });
    if (hardware.shippingSurcharge > 0) {
      hardwareItems.push({ desc: 'International shipping & customs (20%)', qty: null, unit: null, total: hardware.shippingSurcharge });
    }
    hardware.installRows.filter((r) => r.subtotal > 0).forEach((r) => {
      hardwareItems.push({ desc: r.desc, qty: r.qty, unit: r.rate, total: r.subtotal });
    });

    const subscriptionMonthly = subscription.totalMonthly;
    const subscriptionAnnual = subscription.totalAnnual;
    const implementationTotal = implementation.total;
    const hardwareTotal = hardware.grandTotal;

    return {
      subscriptionItems, implementationItems, hardwareItems,
      subscriptionMonthly, subscriptionAnnual, implementationTotal, hardwareTotal,
      year1Total: subscriptionAnnual + implementationTotal + hardwareTotal,
      year2Onwards: subscriptionAnnual,
      discounts: {
        bundle: subscription.bundle.discount,
        volume: subscription.volume.discount,
        blended: subscription.effectiveBlendedDiscount,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // FULL DEAL
  // ---------------------------------------------------------------------------
  function calcDeal(deal) {
    const subscription = calcSubscription({ vehicles: deal.vehicles, selected: deal.selected });
    const hardware = calcHardware({ ...(deal.hardware || {}), vehicles: deal.vehicles });
    const implementation = calcImplementation({
      activities: (deal.implementation && deal.implementation.activities) || activeConfig.implActivities,
      selected: deal.selected,
    });
    const rental = calcRental({
      termMonths: (deal.rental && deal.rental.termMonths) || 36,
      mode: (deal.rental && deal.rental.mode) || 'Pure Rental',
      vehicles: deal.vehicles,
      monthlySaaS: subscription.totalMonthly,
      hardwareTotal: hardware.hardwareTotal,
      installTotal: hardware.installSubtotal,
      implementationTotal: implementation.total,
    });
    const internalMargin = calcInternalMargin(subscription);
    const clientQuote = buildClientQuote(subscription, implementation, hardware);
    return { subscription, hardware, implementation, rental, internalMargin, clientQuote };
  }

  return {
    // live config accessors (reflect the active config)
    get PRODUCTS() { return activeConfig.products; },
    get STEP_COST() { return activeConfig.stepCost; },
    get BUNDLE_SCHEDULE() { return activeConfig.bundleSchedule; },
    get VOLUME_TIERS() { return activeConfig.volumeTiers; },
    get HARDWARE_CATALOG() { return activeConfig.hardwareCatalog; },
    get HANDSET_OPTIONS() { return activeConfig.handsetOptions; },
    get HARDWARE_MARKUP() { return activeConfig.hardwareMarkup; },
    get INSTALL_RATES() { return activeConfig.installRates; },
    get INTL_SHIPPING_SURCHARGE() { return activeConfig.intlShippingSurcharge; },
    get RATES() { return activeConfig.rates; },
    get IMPL_ACTIVITIES() { return activeConfig.implActivities; },
    get RENTAL() { return activeConfig.rental; },
    // config management
    getConfig, setConfig, getDefaultConfig, mergeConfig, slug,
    // helpers
    listPrice, sellPrice, bundleMultiplier, volumeTier, pmt, round2,
    // calculators
    calcSubscription, calcHardware, calcImplementation, calcRental,
    calcInternalMargin, buildClientQuote, calcDeal,
  };
});
