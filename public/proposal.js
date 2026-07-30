/* Sunstone Pricing Calculator — proposal copy library.
 *
 * Client-facing marketing narrative used by the Proposal builder (app.js). This
 * file holds ONLY boilerplate prose — no pricing, cost or margin data. All money
 * on a generated proposal comes from the client-safe quote projection.
 *
 * Copy is derived from Sunstone's real past proposals (L&A Logistics, Frozen Food
 * Distributors, ABInBev Nigeria FleetView, Signal Hill) so a proposal generated
 * here reads like the documents the team already sends out. Each product is keyed
 * by its config product `key`; unknown / custom products fall back to a generic
 * template so newly-added products still produce a sensible section.
 */
(function (root) {
  'use strict';

  var COMPANY = {
    name: 'Sunstone Logistic Systems',
    short: 'SLS',
    about:
      'Sunstone Logistic Systems (SLS) is a technology company specialising in ' +
      'route optimisation, fleet telematics, execution management, in-field mobile ' +
      'delivery management and logistics software solutions tailored for complex ' +
      'distribution environments. Sunstone has delivered logistics technology ' +
      'solutions for over a decade across sub-Saharan Africa and the Middle East, ' +
      'operating in over 18 countries and supporting clients ranging from single-site ' +
      'regional operators to large, multi-depot national distribution networks.\n\n' +
      "Sunstone's platform suite covers the full distribution lifecycle — from order " +
      'ingestion and route planning, through live execution and driver management, to ' +
      'fleet telematics, fuel control, warehouse inventory management and yard ' +
      'operations. All products are natively API-connected within the Sunstone Control ' +
      'Hub ecosystem. Sunstone’s clients include global FMCG brands, national ' +
      'beverage distributors, cold-chain logistics operators and third-party logistics ' +
      'providers. Customer references are available on request.',
    workingTogether:
      'Every product proposed here is natively API-connected within the Sunstone ' +
      'Control Hub ecosystem. Rather than a collection of standalone systems, the ' +
      'solution operates as a single connected platform: planning feeds execution, ' +
      'execution feeds telematics and safety, and every module shares one operational ' +
      'picture. The result is end-to-end visibility from route planning through live ' +
      'execution, fleet safety and asset cost control — with a single point of ' +
      'integration into your existing and future enterprise systems.',
  };

  // Per-product client-facing copy, keyed by config product key.
  var PRODUCTS = {
    tracking: {
      brand: 'Fleet Pro – Track & Trace',
      tagline: 'Enterprise GPS tracking & telematics',
      user: 'Fleet Controllers / Operations',
      challenge:
        'Without continuous, real-time visibility of where vehicles are and how they ' +
        'are being driven, operations run blind between dispatch and return — unable ' +
        'to respond to deviations, recover stolen assets, or hold drivers accountable ' +
        'for unsafe behaviour.',
      solution:
        'Fleet Pro – Track & Trace delivers continuous, real-time vehicle ' +
        'location, driver-behaviour monitoring and configurable geofencing across the ' +
        'entire fleet, accessible via web and mobile and fully API-connected to the ' +
        'rest of the Sunstone ecosystem.',
      capabilities: [
        'Real-time GPS location and full trip history',
        'Driver-behaviour scorecards (speeding, harsh braking, cornering)',
        'Configurable geofencing and zone alerts',
        'Stolen-vehicle recovery support and panic-button capability',
        'Comprehensive reporting via web and mobile',
        'API-based integration to third-party systems',
      ],
    },
    fuel: {
      brand: 'Fleet Pro – Fuel Control',
      tagline: 'Fuel telemetry & theft detection',
      user: 'Fleet Managers / Cost Control',
      challenge:
        'Fuel is one of the largest and least-controlled costs in any fleet. Without ' +
        'probe-level monitoring, theft, drainage and unexplained consumption go ' +
        'undetected until they surface as budget overruns.',
      solution:
        'Fleet Pro – Fuel Control adds fuel-probe telemetry to the tracking ' +
        'platform — monitoring tank levels in real time, flagging sudden drops, and ' +
        'reconciling consumption against distance travelled and route completed.',
      capabilities: [
        'Fuel-probe based real-time tank monitoring',
        'Theft and sudden-drop alerts',
        'Fill-event and drainage detection',
        'Consumption reporting against distance and route',
        'Single- and dual-tank vehicle support',
      ],
    },
    routeBuilder: {
      brand: 'Route Builder',
      tagline: 'AI-driven route planning & optimisation',
      user: 'Route Planners / Operations Managers',
      challenge:
        'Manual route planning fails to optimise across all constraints ' +
        'simultaneously, leaving significant cost and efficiency on the table — while ' +
        'poor adherence, unauthorised stops, missed deliveries and fuel waste are only ' +
        'discovered after the fact.',
      solution:
        "Route Builder is Sunstone's AI-driven route planning and optimisation " +
        'engine. It ingests customers, orders, vehicles, drivers, depots, constraints ' +
        'and live traffic data, and applies constraint-based modelling and machine ' +
        'learning to generate optimised, executable route plans automatically. ' +
        'Clients have reported transport cost reductions of up to 30% through ' +
        'optimised routing.',
      capabilities: [
        'Automatic multi-stop, multi-vehicle route optimisation',
        'Dynamic and same-day route adjustments based on live conditions',
        'Multi-depot, multi-day and multi-tier distribution planning',
        'Wave planning, batch scheduling and priority-based scheduling',
        'Load balancing with vehicle type and capacity constraints',
        'Delivery time-window enforcement and service-level compliance',
        'Driver working-hour and no-drive-window management',
        'Live traffic, weather and historical-pattern integration via AI',
      ],
    },
    digitalJourney: {
      brand: 'Digital Journey',
      tagline: 'In-field driver mobile application',
      user: 'Drivers / Dispatchers',
      challenge:
        'Once a vehicle leaves the depot, paper-based processes leave drivers without ' +
        'guidance and management without live proof of what was delivered, when, and ' +
        'in what condition.',
      solution:
        "Digital Journey puts the plan in the driver's hand — guiding them through " +
        'every step of the delivery workflow, capturing electronic proof of delivery, ' +
        'and pushing live execution data back to the control tower so the full picture ' +
        'is always visible.',
      capabilities: [
        'Turn-by-turn navigation to each stop',
        'Guided pre-trip, on-route and at-customer workflow',
        'Electronic proof of delivery and signature capture',
        'Real-time trip and status updates',
        'Exception and failed-delivery capture',
        'Post-trip finalisation and reconciliation',
      ],
    },
    stockMaster: {
      brand: 'Stock Master',
      tagline: 'Mobile warehouse inventory & stock management',
      user: 'Warehouse / Inventory Teams',
      challenge:
        'Inaccurate stock counts and manual inventory processes create picking ' +
        'errors, stock-outs and reconciliation headaches that ripple straight through ' +
        'to delivery accuracy.',
      solution:
        'Stock Master provides mobile warehouse inventory and stock-counting ' +
        'management, giving warehouse teams accurate, real-time stock visibility that ' +
        'feeds directly into planning and dispatch.',
      capabilities: [
        'Mobile stock counting and cycle counts',
        'Real-time inventory visibility',
        'Picking and put-away support',
        'Stock reconciliation and variance reporting',
      ],
    },
  };

  // Fallback for any product not in the map above (e.g. custom products added in
  // Config). Produces a sensible generic section from the product's own name.
  function generic(name) {
    return {
      brand: name,
      tagline: 'Sunstone logistics module',
      user: 'Operations',
      challenge:
        'Operations that rely on manual, disconnected processes for this function ' +
        'lose visibility and control, driving up cost and effort.',
      solution:
        name +
        " is part of Sunstone's connected logistics ecosystem — delivered as a cloud " +
        'platform and natively API-connected to the rest of the suite.',
      capabilities: [
        'Cloud-based, accessible via web and mobile',
        'Natively API-connected within the Sunstone Control Hub ecosystem',
        'Configurable to your operational requirements',
        'Backed by Sunstone implementation and support',
      ],
    };
  }

  function copyFor(key, name) {
    if (key && PRODUCTS[key]) return PRODUCTS[key];
    return generic(name || key || 'Solution');
  }

  root.ProposalCopy = { COMPANY: COMPANY, PRODUCTS: PRODUCTS, copyFor: copyFor };
})(typeof window !== 'undefined' ? window : this);
