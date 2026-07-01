/*
 * Verification harness. Runs known scenarios that already have computed values
 * sitting in Sunstone_Pricing_Calculator.xlsx and asserts the engine reproduces
 * them. This is how transcription errors get caught before a client quote.
 *
 * Run: node test/verify.js
 */
const P = require('../public/pricing.js');

let pass = 0, fail = 0;
const APPROX = 1e-6;

function check(label, got, want, tol = APPROX) {
  const ok = (typeof want === 'number' && typeof got === 'number')
    ? Math.abs(got - want) <= Math.max(tol, Math.abs(want) * 1e-9)
    : got === want;
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}\n        got:  ${got}\n        want: ${want}`); }
}

// ---------------------------------------------------------------------------
// Scenario 1: Zambia Sugar (Calculator sheet example)
// 20 vehicles, Tracking + Fuel + Route Builder + Digital Journey selected.
// ---------------------------------------------------------------------------
console.log('\n[Scenario] Zambia Sugar — Calculator/Quote/Implementation/Margin sheets');
{
  const selected = { tracking: true, fuel: true, routeBuilder: true, digitalJourney: true, stockMaster: false };
  const sub = P.calcSubscription({ vehicles: 20, selected });

  // Config-derived list prices (Config!D5:D9)
  check('Tracking list price = 276.6667', sub.lines[0].listPrice, 276.66666666666663);
  check('Fuel list price = 332', sub.lines[1].listPrice, 332);
  check('Route Builder list price = 200', sub.lines[2].listPrice, 200);
  check('Digital Journey list price = 332', sub.lines[3].listPrice, 332);
  check('Stock Master list price = 1000', sub.lines[4].listPrice, 1000);

  // Discount summary (Calculator!B18:B21)
  check('Products in bundle = 4 (bug: Tracking+Fuel both count)', sub.productCount, 4);
  check('Bundle multiplier = 0.85', sub.bundle.multiplier, 0.85);
  check('Bundle discount = 0.15', sub.bundle.discount, 0.15);
  check('Volume tier = SMB', sub.volume.name, 'SMB');
  check('Volume multiplier = 1', sub.volume.multiplier, 1);

  // Effective prices (Calculator!D10:D14)
  check('Tracking effective = 235.1667', sub.lines[0].effectivePrice, 235.16666666666663);
  check('Fuel effective = 282.2', sub.lines[1].effectivePrice, 282.2);
  check('Route Builder effective = 170', sub.lines[2].effectivePrice, 170);
  check('Digital Journey effective = 282.2', sub.lines[3].effectivePrice, 282.2);

  // Monthly per product (Calculator!E10:E14)
  check('Tracking monthly = 4703.333', sub.lines[0].monthly, 4703.333333333332);
  check('Fuel monthly = 5644', sub.lines[1].monthly, 5644);
  check('Route Builder monthly = 3400', sub.lines[2].monthly, 3400);
  check('Digital Journey monthly = 5644', sub.lines[3].monthly, 5644);
  check('Stock Master monthly = 0 (not selected)', sub.lines[4].monthly, 0);

  // Totals (Calculator!E23/F23/A27/E24)
  check('Total monthly revenue = 19391.333', sub.totalMonthly, 19391.333333333332);
  check('Total annual revenue = 232696', sub.totalAnnual, 232696);
  check('Blended price/vehicle = 969.5667', sub.blendedPerVehicle, 969.5666666666666);
  check('Effective blended discount = 0.15', sub.effectiveBlendedDiscount, 0.15000000000000002);

  // The replicated bug: both selected => conflict flagged but calc still proceeds.
  check('Fuel+Tracking conflict flagged', sub.fuelTrackingConflict, true);
  check('Config check text matches sheet', sub.configCheck, 'INVALID: Fuel already includes Tracking. Please deselect one.');

  // Implementation (Implementation!F23/F24)
  const impl = P.calcImplementation({ activities: P.IMPL_ACTIVITIES, selected });
  check('Implementation total = 139125', impl.total, 139125);
  check('Implementation billable hours = 105', impl.billableHours, 105);
  check('Project Management line = 39750', impl.lines[0].total, 39750);
  check('Go Live (100% disc) = 0', impl.lines[11].total, 0);
  check('Training — Stock Master not billed (product off)', impl.lines[10].billed, false);
  check('Training — Tracking billed', impl.lines[6].billed, true);

  // Hardware (Zambia: no hardware selected => 0)  (Hardware!F35)
  const hw = P.calcHardware({ vehicles: 20, items: {} });
  check('Hardware grand total = 0', hw.grandTotal, 0);
  check('Tracking-only qty = 20', hw.trackingOnlyQty, 20);

  // Customer Quote (Customer Quote!E55/E56)
  const quote = P.buildClientQuote(sub, impl, hw);
  check('Year-1 total = 371821', quote.year1Total, 371821);
  check('Year-2 onwards = 232696', quote.year2Onwards, 232696);
  check('Quote subscription items = 4', quote.subscriptionItems.length, 4);
  check('Quote has NO margin fields', JSON.stringify(quote).match(/margin|contribution|marginal/i), null);

  // Internal Margin (Internal Margin!C11/E11/F11/G11 + walk-down)
  const im = P.calcInternalMargin(sub);
  check('IM total revenue = 19391.333', im.totalRevenue, 19391.333333333332);
  check('IM total cost = 5980', im.totalCost, 5980);
  check('IM total contribution = 13411.333', im.totalContribution, 13411.333333333332);
  check('IM total gross margin = 0.69161', im.totalGrossMargin, 0.6916148107401932);
  check('IM Tracking GM = 0.64706', im.rows[0].grossMargin, 0.6470588235294117);
  check('IM Fuel GM = 0.70588', im.rows[1].grossMargin, 0.7058823529411765);
  check('IM gross list value = 22813.333', im.walkDown.grossListValue, 22813.333333333332);
  check('IM bundle discount = -3422', im.walkDown.bundleDiscount, -3421.9999999999995);
  check('IM net subscription = 19391.333', im.walkDown.netSubscription, 19391.333333333332);
  check('IM Tracking floor status Healthy', im.rows[0].floorStatus, '✓ Healthy');
  check('IM Tracking step warning ok (20 < 300)', im.rows[0].stepWarning, 'ok');

  // Rental (Rental sheet) — vehicles linked to deal (20), SaaS 19391.33, no hardware.
  const rent = P.calcRental({
    termMonths: 36, mode: 'Pure Rental', vehicles: 20,
    monthlySaaS: sub.totalMonthly, hardwareTotal: 0, installTotal: 0,
    implementationTotal: impl.total,
  });
  check('Rental annual rate = 0.18', rent.annualRate, 0.18);
  check('Rental monthly factor (36mo) = 0.0361524', rent.monthlyFactor, 0.03615239553591684);
  check('Rental monthly hardware/install = 0', rent.monthlyHardwareInstall, 0);
  check('Rental total monthly = SaaS = 19391.333', rent.totalMonthly, 19391.333333333332);
  check('Rental purchase-model upfront = 139125', rent.purchaseModelUpfront, 139125);
}

// ---------------------------------------------------------------------------
// Scenario 2-4: Scenarios sheet (A/B/C) — subscription revenue & margin.
// These use the Config list prices directly; Scenario A has Tracking only, etc.
// NB: the Scenarios sheet has NO Fuel+Tracking double-count (only one of each
// is selected), so it is a clean cross-check of the discount math.
// ---------------------------------------------------------------------------
console.log('\n[Scenario] Scenarios sheet A/B/C — subscription revenue & GM');
{
  // Scenario A: Tracking-only Entry, 50 vehicles
  const A = P.calcSubscription({ vehicles: 50, selected: { tracking: true } });
  check('A bundle multiplier = 1', A.bundle.multiplier, 1);
  check('A volume tier = SMB', A.volume.name, 'SMB');
  check('A monthly subscription = 13833.333', A.totalMonthly, 13833.333333333332);
  check('A annual = 166000', A.totalAnnual, 166000);
  check('A blended/veh = 276.6667', A.blendedPerVehicle, 276.66666666666663);
  const imA = P.calcInternalMargin(A);
  check('A monthly marginal cost = 4150', imA.totalCost, 4150);
  check('A monthly contribution = 9683.333', imA.totalContribution, 9683.333333333332);
  check('A effective GM = 0.70', imA.totalGrossMargin, 0.7);

  // Scenario B: Fuel + Route Builder + DJ, 250 vehicles
  const B = P.calcSubscription({ vehicles: 250, selected: { fuel: true, routeBuilder: true, digitalJourney: true } });
  check('B products = 3', B.productCount, 3);
  check('B bundle multiplier = 0.9', B.bundle.multiplier, 0.9);
  check('B volume tier = Upper mid', B.volume.name, 'Upper mid');
  check('B volume multiplier = 0.9', B.volume.multiplier, 0.9);
  check('B effective discount = 0.19', B.effectiveBlendedDiscount, 0.18999999999999995);
  check('B monthly subscription = 174960', B.totalMonthly, 174960);
  check('B annual = 2099520', B.totalAnnual, 2099520);
  check('B blended/veh = 699.84', B.blendedPerVehicle, 699.84);
  const imB = P.calcInternalMargin(B);
  check('B monthly marginal cost = 54000', imB.totalCost, 54000);
  check('B monthly contribution = 120960', imB.totalContribution, 120960);
  check('B effective GM = 0.691358', imB.totalGrossMargin, 0.691358024691358);

  // Scenario C: Full Suite Enterprise (4-prod: Fuel+RB+DJ+SM), 1200 vehicles
  const C = P.calcSubscription({ vehicles: 1200, selected: { fuel: true, routeBuilder: true, digitalJourney: true, stockMaster: true } });
  check('C products = 4', C.productCount, 4);
  check('C bundle multiplier = 0.85', C.bundle.multiplier, 0.85);
  check('C volume tier = Large', C.volume.name, 'Large');
  check('C volume multiplier = 0.82', C.volume.multiplier, 0.8200000000000001);
  check('C effective discount = 0.303', C.effectiveBlendedDiscount, 0.30299999999999994);
  check('C monthly subscription = 1559049.6', C.totalMonthly, 1559049.6);
  check('C annual = 18708595.2', C.totalAnnual, 18708595.200000003);
  check('C blended/veh = 1299.208', C.blendedPerVehicle, 1299.208);
  const imC = P.calcInternalMargin(C);
  check('C monthly marginal cost = 559200', imC.totalCost, 559200);
  check('C monthly contribution = 999849.6', imC.totalContribution, 999849.6000000001);
  check('C effective GM = 0.64132', imC.totalGrossMargin, 0.6413199426111909);
}

// ---------------------------------------------------------------------------
// Scenario 5: Hardware + Rental amortization cross-check (synthetic but exact).
// Verifies sell prices, fuel-kit composition, install auto-compute, PMT.
// ---------------------------------------------------------------------------
console.log('\n[Scenario] Hardware sell prices, kit composition, install & PMT');
{
  check('Teltonika GPS sell = 798.75', P.sellPrice(P.HARDWARE_CATALOG.teltonikaFMB125), 798.75);
  check('Omnicomm probe sell = 2186.25', P.sellPrice(P.HARDWARE_CATALOG.omnicommLS4), 2186.25);
  check('Blackview Fort 1 sell = 4922.5', P.sellPrice(P.HARDWARE_CATALOG.blackviewFort1), 4922.5);

  // Fleet: 100 vehicles, 10 single-tank, 5 dual-tank, 3 trailers.
  const hw = P.calcHardware({
    vehicles: 100, singleTank: 10, dualTank: 5, trailerQty: 3, outsideSA: false,
    items: { vehicleGpsInclude: true, fuelKitSingleInclude: true, fuelKitDualInclude: true, trailerGpsInclude: true },
  });
  check('Tracking-only qty = 85 (100-10-5)', hw.trackingOnlyQty, 85);
  // Fuel kit single sell = 798.75 + 2186.25 = 2985 ; dual = 798.75 + 2*2186.25 = 5171.25
  const fuelSingleRow = hw.rows.find((r) => r.id === 'fuelKitSingle');
  const fuelDualRow = hw.rows.find((r) => r.id === 'fuelKitDual');
  check('Fuel kit single unit = 2985', fuelSingleRow.unit, 2985);
  check('Fuel kit dual unit = 5171.25', fuelDualRow.unit, 5171.25);
  check('Vehicle GPS subtotal = 85*798.75 = 67893.75', hw.rows.find(r=>r.id==='vehicleGps').subtotal, 67893.75);
  // Install: GPS 85*800 + single 10*1600 + dual 5*2200 + trailer 3*800
  check('Install subtotal = 85*800+10*1600+5*2200+3*800 = 91400', hw.installSubtotal, 85*800 + 10*1600 + 5*2200 + 3*800);

  // International shipping: 20% on hardware subtotal only, not install.
  const hwIntl = P.calcHardware({
    vehicles: 100, singleTank: 10, dualTank: 5, trailerQty: 3, outsideSA: true,
    items: { vehicleGpsInclude: true, fuelKitSingleInclude: true, fuelKitDualInclude: true, trailerGpsInclude: true },
  });
  check('Intl surcharge = 20% of hardware subtotal', hwIntl.shippingSurcharge, hw.hardwareSubtotal * 0.20);
  check('Intl install unchanged (no surcharge on labour)', hwIntl.installSubtotal, hw.installSubtotal);

  // PMT cross-check: amortize R100000 over 36mo at 18%/yr.
  const factor = P.pmt(0.18 / 12, 36, 1);
  check('PMT factor (18%/12, 36) = 0.0361524', factor, 0.03615239553591684);
  check('PMT(100000) = 100000*factor', P.pmt(0.18 / 12, 36, 100000), 100000 * factor);
}

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail ? 1 : 0);
