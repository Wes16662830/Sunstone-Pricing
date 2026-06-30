/*
 * Sunstone Pricing Engine — single source of truth for ALL calculations.
 *
 * Transcribed cell-for-cell from Sunstone_Pricing_Calculator.xlsx (verified
 * with openpyxl, data_only=False). Where the build spec disagreed with the
 * workbook, the workbook wins (see README "Discrepancies"). The most important
 * one: Fuel uses a 75% target GM (Config!C6 = 0.75 -> list R332), NOT 85%.
 *
 * This module is environment-agnostic: it runs unchanged in Node (test script
 * + server) and in the browser (UI). No DOM, no I/O. Keep it that way so the
 * numbers a client sees are the exact numbers the test script verifies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG  (mirror of the Config sheet)
  // ---------------------------------------------------------------------------

  // Product pricing. listPrice = marginalCost / (1 - targetGrossMargin).
  // stepThreshold / STEP_COST drive the advisory step-cost warning.
  // `key` is the stable id used across sheets; `quoteLabel` is what the client sees.
  const PRODUCTS = [
    { key: 'tracking',       name: 'Tracking',           quoteLabel: 'Tracking',        calcLabel: 'Tracking',            marginalCost: 83,  targetGM: 0.70, stepThreshold: 300 },
    { key: 'fuel',           name: 'Fuel',               quoteLabel: 'Fuel',            calcLabel: 'Fuel plus tracking',  marginalCost: 83,  targetGM: 0.75, stepThreshold: 300 },
    { key: 'routeBuilder',   name: 'Route Builder',      quoteLabel: 'Route Builder',   calcLabel: 'Route Builder',       marginalCost: 50,  targetGM: 0.75, stepThreshold: 500 },
    { key: 'digitalJourney', name: 'Digital Journey',    quoteLabel: 'Digital Journey', calcLabel: 'Digital Journey',     marginalCost: 83,  targetGM: 0.75, stepThreshold: 300 },
    { key: 'stockMaster',    name: 'Stock Master',       quoteLabel: 'Stock Master',    calcLabel: 'Stock Master',        marginalCost: 250, targetGM: 0.75, stepThreshold: 100 },
  ];
  const STEP_COST = 25000; // R/mo per step (Config!F5:F9)

  // Bundle discount schedule (Config!A14:C18). Keyed by count of selected products.
  const BUNDLE_SCHEDULE = { 1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.20 };

  // Volume discount cliff tiers (Config!A22:E26). Excel VLOOKUP approximate match
  // on Min Vehicles => pick the LAST tier whose min <= vehicles.
  const VOLUME_TIERS = [
    { min: 1,    max: 50,     name: 'SMB',        discount: 0.00 },
    { min: 51,   max: 200,    name: 'Mid-market', discount: 0.05 },
    { min: 201,  max: 500,    name: 'Upper mid',  discount: 0.10 },
    { min: 501,  max: 2000,   name: 'Large',      discount: 0.18 },
    { min: 2000, max: 999999, name: 'Enterprise', discount: 0.25 },
  ];

  // Hardware catalog (Config!A35:D42). sell = cost * (1 + markup).
  const HARDWARE_MARKUP = 0.25;
  const HARDWARE_CATALOG = {
    blackviewFort1: { sku: 'Blackview Fort 1',                                  cost: 3938, note: 'Handset option 1' },
    blackviewBV6200:{ sku: 'Blackview BV6200',                                  cost: 3999, note: 'Handset option 2' },
    oukitelG1S:     { sku: 'Oukitel G1S',                                       cost: 2973, note: 'Handset option 3' },
    urovoK419:      { sku: 'Urovo Printer K419 (incl. case + car charger)',     cost: 3606, note: 'Mobile thermal printer (DJ)' },
    teltonikaFMB125:{ sku: 'Teltonika FMB125',                                  cost: 639,  note: 'Vehicle GPS — 1 per vehicle' },
    queclinkGV620MG:{ sku: 'Queclink GV620MG',                                  cost: 1403, note: 'Trailer GPS — 1 per trailer' },
    omnicommLS4:    { sku: 'Omnicomm LS4',                                       cost: 1749, note: 'Fuel probe — 1 per tank' },
    streamax3cam:   { sku: 'Streamax 3 camera',                                 cost: 8712, note: 'Streamax 3 camera plus' },
  };
  // SKUs offered as the per-line handset dropdown (deliberate improvement over the
  // sheet's hardcoded one-VLOOKUP-per-row). Any of these three is valid for the
  // Digital Journey handset and the Stock Master handset rows.
  const HANDSET_OPTIONS = ['blackviewFort1', 'blackviewBV6200', 'oukitelG1S'];

  // Installation charges (Config!A46:B50). Advisory rates; the sheet auto-picks per scenario.
  const INSTALL_RATES = {
    gpsAlone: 800,      // GPS Tracking Unit alone (also used for trailer GPS)
    fuelKitSingle: 1600,// Combined GPS + Fuel install (single-tank)
    fuelKitDual: 2200,  // Combined GPS + Fuel install (dual-tank)
    trailerGps: 800,
  };

  const INTL_SHIPPING_SURCHARGE = 0.20; // Config!B53, hardware items only

  // Implementation rates (Config!B30:B31).
  const RATES = { consultant: 1000, senior: 1325 };

  // Default implementation activity list (Implementation sheet rows 10-21).
  // `product` ties a training row to a Calculator product: it only bills when selected.
  const IMPL_ACTIVITIES = [
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
  ];

  // Rental config (Config!B56:B59).
  const RENTAL = {
    costOfCapital: 0.13,
    financingMargin: 0.05,
    get annualRate() { return this.costOfCapital + this.financingMargin; }, // 0.18
    renewalSupportFeeMonthly: 0.0075, // % of hardware value / month, Pure Rental only
    terms: [12, 24, 36],
  };

  // ---------------------------------------------------------------------------
  // DERIVED CONFIG helpers
  // ---------------------------------------------------------------------------

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  function listPrice(p) { return p.marginalCost / (1 - p.targetGM); }
  function sellPrice(item) { return item.cost * (1 + HARDWARE_MARKUP); }

  function bundleMultiplier(count) {
    // IFERROR(VLOOKUP(count, schedule, 3, FALSE), 1) => default 1 if count not 1..5
    const disc = BUNDLE_SCHEDULE[count];
    return disc === undefined ? { discount: 0, multiplier: 1 } : { discount: disc, multiplier: 1 - disc };
  }

  function volumeTier(vehicles) {
    // VLOOKUP approximate match: last tier whose min <= vehicles (>=1 assumed).
    let match = VOLUME_TIERS[0];
    for (const t of VOLUME_TIERS) { if (t.min <= vehicles) match = t; }
    return { name: match.name, discount: match.discount, multiplier: 1 - match.discount };
  }

  // Excel PMT(rate, nper, pv) -> payment (positive here; Excel returns negative).
  function pmt(monthlyRate, nper, pv) {
    if (nper <= 0) return 0;
    if (monthlyRate === 0) return pv / nper;
    return (pv * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -nper));
  }

  // ---------------------------------------------------------------------------
  // SUBSCRIPTION  (Calculator sheet)
  // ---------------------------------------------------------------------------
  // input.vehicles : number
  // input.selected : { tracking:bool, fuel:bool, routeBuilder:bool, digitalJourney:bool, stockMaster:bool }
  function calcSubscription(input) {
    const vehicles = Number(input.vehicles) || 0;
    const selected = input.selected || {};

    const count = PRODUCTS.reduce((n, p) => n + (selected[p.key] ? 1 : 0), 0);
    const bundle = bundleMultiplier(count);
    const volume = volumeTier(vehicles);

    const lines = PRODUCTS.map((p) => {
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
    // selecting both is NOT blocked — both line items are still summed into the
    // total. We surface a warning and let the quote proceed, exactly like the sheet.
    const fuelTrackingConflict = !!(selected.tracking && selected.fuel);

    return {
      vehicles,
      productCount: count,
      bundle, volume,
      lines,
      totalMonthly,
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
  // HARDWARE  (Hardware sheet)
  // ---------------------------------------------------------------------------
  // input.vehicles, input.singleTank, input.dualTank, input.trailerQty
  // input.outsideSA : bool
  // input.items : { djHandsetSku, djHandsetInclude, smHandsetSku, smHandsetInclude,
  //                 printerInclude, vehicleGpsInclude, trailerGpsInclude,
  //                 fuelKitSingleInclude, fuelKitDualInclude }
  function calcHardware(input) {
    const vehicles = Number(input.vehicles) || 0;
    const single = Number(input.singleTank) || 0;
    const dual = Number(input.dualTank) || 0;
    const trailerQty = Number(input.trailerQty) || 0;
    const trackingOnlyQty = Math.max(vehicles - single - dual, 0);
    const it = input.items || {};

    const djSku = it.djHandsetSku || 'blackviewFort1';
    const smSku = it.smHandsetSku || 'oukitelG1S';
    const printerSell = sellPrice(HARDWARE_CATALOG.urovoK419);
    const gpsSell = sellPrice(HARDWARE_CATALOG.teltonikaFMB125);
    const trailerSell = sellPrice(HARDWARE_CATALOG.queclinkGV620MG);
    const probeSell = sellPrice(HARDWARE_CATALOG.omnicommLS4);
    const fuelKitSingleSell = gpsSell + probeSell;
    const fuelKitDualSell = gpsSell + 2 * probeSell;

    // Each row: include flag, qty, unit sell price.
    const rows = [
      { id: 'djHandset',  desc: `Digital Journey Handset (${HARDWARE_CATALOG[djSku].sku})`, include: !!it.djHandsetInclude, qty: vehicles,         unit: sellPrice(HARDWARE_CATALOG[djSku]) },
      { id: 'smHandset',  desc: `Stock Master Handset (${HARDWARE_CATALOG[smSku].sku})`,    include: !!it.smHandsetInclude, qty: vehicles,         unit: sellPrice(HARDWARE_CATALOG[smSku]) },
      { id: 'printer',    desc: HARDWARE_CATALOG.urovoK419.sku,                             include: !!it.printerInclude,   qty: vehicles,         unit: printerSell },
      { id: 'vehicleGps', desc: `Vehicle GPS Tracker (${HARDWARE_CATALOG.teltonikaFMB125.sku})`, include: !!it.vehicleGpsInclude, qty: trackingOnlyQty, unit: gpsSell },
      { id: 'trailerGps', desc: `Trailer GPS Tracker (${HARDWARE_CATALOG.queclinkGV620MG.sku})`, include: !!it.trailerGpsInclude, qty: trailerQty,    unit: trailerSell },
      { id: 'fuelKitSingle', desc: 'Fuel Probe Kit — Single-Tank (GPS + 1 probe)',          include: !!it.fuelKitSingleInclude, qty: single,       unit: fuelKitSingleSell },
      { id: 'fuelKitDual',   desc: 'Fuel Probe Kit — Dual-Tank (GPS + 2 probes)',           include: !!it.fuelKitDualInclude,   qty: dual,         unit: fuelKitDualSell },
    ].map((r) => ({ ...r, subtotal: (r.include ? 1 : 0) * r.qty * r.unit }));

    const hardwareSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
    const shippingSurcharge = input.outsideSA ? hardwareSubtotal * INTL_SHIPPING_SURCHARGE : 0;
    const hardwareTotal = hardwareSubtotal + shippingSurcharge;

    // Installation auto-computes from selections + fleet composition.
    const installRows = [
      { id: 'gpsInstall',        desc: 'GPS Tracking installation',                qty: it.vehicleGpsInclude ? trackingOnlyQty : 0, rate: INSTALL_RATES.gpsAlone },
      { id: 'fuelKitSingleInst', desc: 'Fuel Probe Kit installation — single-tank', qty: it.fuelKitSingleInclude ? single : 0,       rate: INSTALL_RATES.fuelKitSingle },
      { id: 'fuelKitDualInst',   desc: 'Fuel Probe Kit installation — dual-tank',   qty: it.fuelKitDualInclude ? dual : 0,           rate: INSTALL_RATES.fuelKitDual },
      { id: 'trailerInstall',    desc: 'Trailer GPS installation',                  qty: it.trailerGpsInclude ? trailerQty : 0,      rate: INSTALL_RATES.trailerGps },
    ].map((r) => ({ ...r, subtotal: r.qty * r.rate }));

    const installSubtotal = installRows.reduce((s, r) => s + r.subtotal, 0);

    return {
      vehicles, single, dual, trailerQty, trackingOnlyQty,
      outsideSA: !!input.outsideSA,
      rows, installRows,
      hardwareSubtotal, shippingSurcharge, hardwareTotal,
      installSubtotal,
      grandTotal: hardwareTotal + installSubtotal,
    };
  }

  // ---------------------------------------------------------------------------
  // IMPLEMENTATION  (Implementation sheet)
  // ---------------------------------------------------------------------------
  // input.activities : array matching IMPL_ACTIVITIES shape (hours, senior, discount, product)
  // input.selected   : product selection from subscription (training gating)
  function calcImplementation(input) {
    const selected = input.selected || {};
    const activities = input.activities || IMPL_ACTIVITIES;

    const lines = activities.map((a) => {
      const rate = a.senior ? RATES.senior : RATES.consultant;
      const productSelected = a.product ? !!selected[a.product] : true;
      // Training rows bill only if the matching product is selected (greyed otherwise).
      const billed = productSelected;
      const total = billed ? a.hours * rate * (1 - a.discount) : 0;
      return {
        desc: a.desc, hours: a.hours, senior: !!a.senior, rate,
        discount: a.discount, product: a.product || null,
        billed, total, note: a.note || null,
      };
    });

    const total = lines.reduce((s, l) => s + l.total, 0);
    const billableHours = lines.reduce((s, l) => s + (l.billed ? l.hours * (1 - l.discount) : 0), 0);

    return { lines, total, billableHours };
  }

  // ---------------------------------------------------------------------------
  // RENTAL  (Rental sheet)
  // ---------------------------------------------------------------------------
  // input.termMonths (12/24/36), input.mode ('Pure Rental' | 'Rent-to-Own')
  // input.vehicles, input.monthlySaaS, input.hardwareTotal, input.installTotal
  // input.implementationTotal (for purchase-model comparison)
  function calcRental(input) {
    const term = Number(input.termMonths) || 36;
    const mode = input.mode || 'Pure Rental';
    const vehicles = Number(input.vehicles) || 0;
    const monthlySaaS = Number(input.monthlySaaS) || 0;
    const hardwareTotal = Number(input.hardwareTotal) || 0;
    const installTotal = Number(input.installTotal) || 0;
    const implementationTotal = Number(input.implementationTotal) || 0;

    const annualRate = RENTAL.annualRate;
    const monthlyRate = annualRate / 12;
    const capital = hardwareTotal + installTotal;
    const monthlyFactor = pmt(monthlyRate, term, 1);
    const monthlyHardwareInstall = pmt(monthlyRate, term, capital);
    const totalMonthly = monthlySaaS + monthlyHardwareInstall;
    const perVehicle = vehicles ? totalMonthly / vehicles : 0;

    // Renewal options at end of term.
    const refreshPerVehicle = perVehicle; // same rate, new term
    const retainPerVehicle =
      (vehicles ? monthlySaaS / vehicles : 0) +
      (mode === 'Pure Rental' && vehicles ? (hardwareTotal * RENTAL.renewalSupportFeeMonthly) / vehicles : 0);
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
  // INTERNAL MARGIN  (Internal Margin sheet) — INTERNAL VIEW ONLY
  // ---------------------------------------------------------------------------
  function calcInternalMargin(subscription) {
    const vehicles = subscription.vehicles;
    const products = PRODUCTS;

    const rows = products.map((p, i) => {
      const line = subscription.lines[i];
      const revenue = line.monthly;
      const monthlyCost = line.selected ? p.marginalCost * vehicles : 0;
      const contribution = revenue - monthlyCost;
      const grossMargin = revenue ? contribution / revenue : 0;

      // Step-cost warning: advisory only, NOT added to price.
      let stepWarning = '—';
      let stepCount = 0;
      if (line.selected && vehicles >= p.stepThreshold) {
        stepCount = Math.floor(vehicles / p.stepThreshold);
        stepWarning = `⚠ ${stepCount} step(s) crossed: +R${(stepCount * STEP_COST).toLocaleString('en-ZA')}/mo cost`;
      } else if (line.selected) {
        stepWarning = 'ok';
      }

      // Margin floor check.
      const floor50 = p.marginalCost * 2;          // 50% GM floor
      const floor60 = p.marginalCost / 0.4;         // 60% GM floor
      let floorStatus;
      if (line.effectivePrice < floor50) floorStatus = '🚨 BELOW 50% FLOOR';
      else if (line.effectivePrice < floor60) floorStatus = '⚠ Below 60%';
      else floorStatus = '✓ Healthy';

      return {
        key: p.key, name: p.name, selected: line.selected,
        revenue, marginalCost: p.marginalCost, monthlyCost, contribution, grossMargin,
        stepCount, stepWarning,
        floor50, floor60, effectivePrice: line.effectivePrice, floorStatus,
      };
    });

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalCost = rows.reduce((s, r) => s + r.monthlyCost, 0);
    const totalContribution = totalRevenue - totalCost;

    // Discount walk-down.
    const grossListValue = subscription.lines.reduce(
      (s, l) => s + (l.selected ? l.listPrice * vehicles : 0), 0);
    const bundleDisc = -grossListValue * subscription.bundle.discount;
    const volumeDisc = -(grossListValue + bundleDisc) * subscription.volume.discount;
    const netSubscription = grossListValue + bundleDisc + volumeDisc;

    return {
      rows,
      totalRevenue, totalCost, totalContribution,
      totalGrossMargin: totalRevenue ? totalContribution / totalRevenue : 0,
      walkDown: {
        grossListValue, bundleDiscount: bundleDisc, volumeDiscount: volumeDisc,
        netSubscription,
        effectiveDiscount: grossListValue ? (grossListValue - netSubscription) / grossListValue : 0,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // CLIENT QUOTE PROJECTION  (Customer Quote sheet)
  // ---------------------------------------------------------------------------
  // Structural guarantee: this function whitelists client-safe fields only. It
  // never reads marginal cost, contribution, gross margin, or step-cost data.
  // The client Quote view renders ONLY from this object, so margin data cannot
  // leak there regardless of any UI toggle.
  function buildClientQuote(subscription, implementation, hardware) {
    const subscriptionItems = subscription.lines
      .filter((l) => l.selected)
      .map((l) => ({
        product: l.quoteLabel, vehicles: subscription.vehicles,
        pricePerVehicle: l.effectivePrice, monthly: l.monthly, annual: l.annual,
      }));

    const implementationItems = implementation.lines
      .filter((l) => l.total > 0)
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
      // No cost / margin / contribution / step data anywhere in this object.
      subscriptionItems,
      implementationItems,
      hardwareItems,
      subscriptionMonthly,
      subscriptionAnnual,
      implementationTotal,
      hardwareTotal,
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
  // FULL DEAL — convenience that wires the sheets together like the workbook.
  // ---------------------------------------------------------------------------
  function calcDeal(deal) {
    const subscription = calcSubscription({ vehicles: deal.vehicles, selected: deal.selected });
    const hardware = calcHardware({ ...(deal.hardware || {}), vehicles: deal.vehicles });
    const implementation = calcImplementation({
      activities: (deal.implementation && deal.implementation.activities) || IMPL_ACTIVITIES,
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
    // config (read-only references for the UI)
    PRODUCTS, STEP_COST, BUNDLE_SCHEDULE, VOLUME_TIERS,
    HARDWARE_CATALOG, HANDSET_OPTIONS, HARDWARE_MARKUP, INSTALL_RATES,
    INTL_SHIPPING_SURCHARGE, RATES, IMPL_ACTIVITIES, RENTAL,
    // helpers
    listPrice, sellPrice, bundleMultiplier, volumeTier, pmt, round2,
    // calculators
    calcSubscription, calcHardware, calcImplementation, calcRental,
    calcInternalMargin, buildClientQuote, calcDeal,
  };
});
