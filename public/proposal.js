/* Sunstone Pricing Calculator — standard proposal template.
 *
 * This is a VERBATIM transcription of Sunstone's standard client proposal
 * (the "ControlHub — Integrated Logistics & Fleet Management Solution"
 * document). It is the template the team sends out, and the generator in
 * app.js renders it as-is.
 *
 * ONLY TWO THINGS VARY between one generated proposal and the next:
 *   1. the customer name — written as the {CLIENT} token wherever it appears;
 *   2. the products included and their pricing — product sections are shown
 *      for the products selected on the deal, and every figure in the Price
 *      List comes from the live pricing config.
 *
 * Everything else is fixed boilerplate. If the standard document changes,
 * change it HERE — do not special-case copy in app.js.
 *
 * Contains NO pricing, cost or margin data. All money on a generated proposal
 * comes from the client-safe projections in pricing.js.
 */
(function (root) {
  'use strict';

  var CLIENT_TOKEN = '{CLIENT}';

  var COMPANY = {
    name: 'Sunstone Logistic Systems',
    short: 'SLS',
    phone: '+27 11 482 4768',
    emails: 'info@sunstonels.com / sales@sunstonels.com',
    address: '43B Edward Rubenstein Drive, Sandown, Johannesburg, South Africa, 2031',
  };

  // --- Cover page ----------------------------------------------------------
  var COVER = {
    kicker: 'PROPOSAL',
    title: 'ControlHub',
    subtitle: 'Integrated Logistics & Fleet Management Solution',
    suite: 'The Sunstone Product Suite',
  };

  // --- Executive Summary ---------------------------------------------------
  var EXEC_SUMMARY = {
    paras: [
      'Sunstone Logistic Systems (SLS) is a logistics technology company with over a decade of delivery across 18 countries in sub-Saharan Africa and the Middle East, serving global FMCG brands, beverage distributors, cold chain operators and third-party logistics providers.',
      'This proposal presents the Sunstone product suite — five products covering the complete logistics and fleet lifecycle. Each delivers standalone value; all are natively API-connected through the Sunstone Control Hub. {CLIENT} can start with the products that address the most pressing cost or risk and expand across the suite without changing platform.',
    ],
    // Rows are filtered to the products actually proposed (see `keys`).
    head: ['Product', 'What It Does', 'Outcome'],
    rows: [
      { keys: ['routeBuilder'], cells: ['Route Builder (incl. Execution Manager)', 'AI route planning with live control tower', 'Up to 30% transport cost reduction; up to 22% distribution cost reduction'] },
      { keys: ['digitalJourney'], cells: ['Digital Journey', 'In-field driver app with ePOD', 'Paperless delivery, real-time credits and returns'] },
      { keys: ['tracking', 'fuel', 'fleetView'], cells: ['Fleet Pro (Track & Trace, Fuel Control, Fleet View)', 'Modular vehicle telematics — tracking, fuel management, AI driver safety, plus full fleet maintenance and lifecycle costing capability', 'Full fleet visibility, fuel loss eliminated, 98.7% seatbelt compliance improvement in field POC, controlled workshop spend'] },
      { keys: ['stockMaster'], cells: ['Stock Master', 'Mobile warehouse inventory management', 'Accurate stock, fewer picking errors'] },
      { keys: ['yardManager'], cells: ['Yard Manager', 'Live yard and gate operations', 'Reduced dwell time and late departures'] },
    ],
    footnote: "Route Builder includes Execution Manager, and Fleet Pro's Fuel Control module includes Track & Trace advanced tracking at no additional licence cost. Every Fleet Pro module reports live position to the Execution Manager control tower, so a mixed fleet is fully visible in one view.",
  };

  // --- The Control Hub Suite in a Day --------------------------------------
  var SUITE_IN_A_DAY = {
    title: 'The Control Hub Suite in a Day',
    intro: 'All products are natively connected through the Sunstone Control Hub. Data flows automatically between them — planning informs execution, execution informs analysis, analysis improves the next plan.',
    head: ['Stage', 'Products', 'What Happens'],
    rows: [
      { keys: ['stockMaster'], cells: ['Stock preparation', 'Stock Master', 'Warehouse teams count and pick stock against orders on mobile devices.'] },
      { keys: ['routeBuilder'], cells: ['Route planning', 'Route Builder', 'Orders optimised into executable routes accounting for capacity, time windows, driver hours, traffic and cost.'] },
      { keys: ['yardManager', 'digitalJourney'], cells: ['Yard and dispatch', 'Yard Manager, Digital Journey', 'Bays allocated, gate-out recorded, pre-trip inspections completed, routes received on device.'] },
      { keys: ['digitalJourney', 'tracking', 'fuel', 'fleetView'], cells: ['On the road', 'Digital Journey, Fleet Pro', 'Drivers navigate and deliver. Track & Trace reports position, Fuel Control monitors consumption, Fleet View monitors driver safety.'] },
      { keys: ['routeBuilder', 'tracking', 'fuel', 'fleetView'], cells: ['Live oversight', 'Execution Manager, Fleet Pro', 'Planned-versus-actual progress and exceptions monitored live. Every Fleet Pro product feeds live position to the control tower.'] },
      { keys: ['digitalJourney'], cells: ['At the customer', 'Digital Journey', 'Delivery confirmed, ePOD captured, credits and returns processed on the spot.'] },
      { keys: ['yardManager', 'digitalJourney', 'tracking', 'fuel', 'fleetView'], cells: ['Return and settle', 'Yard Manager, Digital Journey, Fleet Pro', 'Gate-in recorded, post-trip inspection completed, defects raised as maintenance jobs in Fleet Pro.'] },
      { keys: ['routeBuilder', 'tracking', 'fuel', 'fleetView'], cells: ['Analyse and improve', 'Route Builder, Fleet Pro', 'Performance, cost per kilometre and compliance data feeds the next planning cycle.'] },
    ],
    footnote: '{CLIENT} is not required to deploy the full suite. Each product stands alone; the ecosystem advantage compounds as more are added.',
  };

  // --- Product sections ----------------------------------------------------
  // One entry per narrative section in the standard document, in document
  // order. `keys` lists the config product keys that make the section
  // relevant; a section is included when any of them is selected. Sections are
  // renumbered 1..N so a partial suite still reads correctly.
  var SECTIONS = [
    {
      id: 'routeBuilder',
      keys: ['routeBuilder'],
      title: 'Route Builder',
      note: 'Includes Execution Manager',
      tagline: 'Plan smarter. See everything. Deliver cheaper.',
      intro: "Route Builder is Sunstone's AI-driven route planning and optimisation engine, supplied with Execution Manager — the real-time distribution control tower. Route Builder creates the plan; Execution Manager monitors execution against it live; the performance data improves the next plan. Manual planning cannot optimise across every constraint at once, and once trucks leave the gate most operations lose visibility entirely. This product closes both gaps.",
      blocks: [
        {
          heading: 'Planning — Route Builder',
          bullets: [
            'Automatic multi-stop, multi-vehicle optimisation via the Auto Scheduler',
            'Dynamic and same-day route adjustment based on live conditions',
            'Multi-depot, multi-day and multi-tier planning (primary and secondary distribution)',
            'Wave planning, batch scheduling and priority-based scheduling',
            'Load balancing with vehicle type and capacity constraints',
            'Delivery time window and driver working hour compliance',
            'Live traffic, weather and historical pattern integration via AI metrics',
            'Cost-based modelling — fixed, variable, driver and overtime costs',
            'Warehouse picking slip generation and driver trip sheets published to Digital Journey',
          ],
        },
        {
          heading: 'Live Execution — Execution Manager',
          bullets: [
            'Status Board: live dashboard showing planned and actual position, stop completion and ETA in real time.',
            'Planned vs. actual monitoring: instant identification of deviations, unauthorised stops and schedule slippage.',
            'Exception management: live alerts enabling intervention before the customer is failed.',
            'Automated notifications: customers and staff alerted on dispatch, delay and completion.',
            'KPI reporting: route adherence, customer hit rate, on-time delivery, cost per trip/km/truck day, vehicle utilisation, late departures, work hour compliance.',
          ],
        },
      ],
      outcome: 'Transport cost reductions of up to 30% through reduced kilometres and improved load utilisation; distribution cost reductions of up to 22% by eliminating unauthorised stops and enabling proactive exception management.',
    },
    {
      id: 'digitalJourney',
      keys: ['digitalJourney'],
      title: 'Digital Journey',
      tagline: 'Track faster, deliver smarter.',
      intro: 'Digital Journey guides drivers through every step of the delivery workflow on a single Android device — replacing lost dockets, disputed deliveries, manual credits processing and post-route admin with a structured digital process visible to the business in real time.',
      blocks: [
        {
          heading: 'The Four-Stage Driver Workflow',
          bullets: [
            'Pre-trip: driver clock-in and identity verification, load validation, configurable vehicle safety inspection with photo capture, manifest review, supervisor and security sign-off.',
            'On-route: turn-by-turn navigation with live traffic avoidance, live GPS tracking visible to dispatch, automated customer ETA notifications, two-way driver communication.',
            'At the customer: arrival confirmation with drive and offload timing, proforma invoice display, ePOD with customer and driver signature, photo capture, real-time credits, returns and refusals, barcode scanning, Rate My Service questionnaire, Bluetooth invoice printing.',
            'Post-trip: returns and route settlement, post-trip inspection, gate check-in, invoice verification and load reconciliation, supervisor sign-off.',
          ],
        },
        {
          heading: 'Key Capabilities',
          bullets: [
            "Customisable workflows: every step configured to {CLIENT}'s operational requirements.",
            'Offline capability: data captured offline and synchronised automatically when connectivity returns.',
            'Mobile Device Management: remote deployment, configuration, security policy enforcement and device monitoring.',
            'KPI dashboards: on-time delivery, route completion, customer hit rate, driver performance and satisfaction scores.',
            'Hardware: ruggedised Android devices, Bluetooth portable printers and barcode scanners.',
          ],
        },
      ],
      outcome: 'Paperless delivery execution, defensible proof of delivery, credits and returns processed at the point of delivery rather than days later, and real-time visibility of delivery progress across the fleet.',
    },
    {
      id: 'fleetPro',
      keys: ['tracking', 'fuel', 'fleetView'],
      title: 'Fleet Pro',
      tagline: 'One platform. Three modules. Total fleet control.',
      intro: "Fleet Pro is Sunstone's modular vehicle telematics platform. {CLIENT} selects the modules that match the fleet — every module runs on the same platform, reports live position to the Execution Manager control tower, and feeds the same reporting and cost management layer.",
      moduleTable: {
        head: ['Module', 'Tracking Tier', 'Core Capability'],
        rows: [
          { keys: ['tracking'], cells: ['Track & Trace', 'Advanced', 'Live tracking, trip history, driver behaviour and scoring, geofencing, vehicle security'] },
          { keys: ['fuel'], cells: ['Fuel Control (includes Track & Trace)', 'Advanced', 'Live fuel level, theft detection, refill verification, fuel cost per kilometre'] },
          { keys: ['fleetView'], cells: ['Fleet View', 'Basic', 'AI dashcam, DMS and ADAS driver safety, video evidence, escalation framework'] },
        ],
        footnote: 'Modules can be deployed independently or combined. Fuel Control is supplied as a package that includes the full Track & Trace advanced tracking capability at no additional licence cost.',
      },
      // Module blocks are filtered by their own key, so a Fuel-only deal does
      // not describe cameras it is not buying.
      blocks: [
        {
          keys: ['tracking'],
          heading: 'Module 1 — Track & Trace',
          intro: 'Advanced GPS tracking and driver behaviour monitoring — live location, full trip history, driver scoring, unlimited geofencing and vehicle security across the fleet.',
          bullets: [
            'Real-time tracking: live location and fleet map view with vehicle status (moving, stopped, idling).',
            'Trip history and route replay: full journey reconstruction for any vehicle and date range.',
            'Driver behaviour monitoring: harsh braking, acceleration, cornering, speeding and excessive idling.',
            'Driver scorecards: comparative safety rankings and behavioural trend reporting.',
            'Geofencing: unlimited custom geofences with entry, exit and after-hours movement alerting.',
            'Vehicle security: stolen vehicle recovery support, panic button, tow-away and battery disconnect alerts.',
            'Utilisation reporting: distance travelled, engine hours and idle time analysis.',
            'Hardware: GPS tracking unit with professional installation; optional driver identification tags (RFID/iButton).',
          ],
        },
        {
          keys: ['fuel'],
          heading: 'Module 2 — Fuel Control',
          intro: 'Fuel is typically the largest controllable cost in a transport operation and the most vulnerable to loss. Fuel Control provides near-perfect accuracy in live tank-level measurement, supplied with full Track & Trace advanced tracking so a fuel drop is always tied to where the vehicle was, who was driving and what it was doing.',
          bullets: [
            'Live fuel level monitoring: continuous tank-level measurement via fuel probe integration.',
            'Theft detection: sudden fuel drop detection with immediate alerting for unauthorised removal.',
            'Refill verification: confirms delivered volume matches invoiced volume.',
            'Consumption analytics: efficiency reporting, consumption trends and anomaly identification.',
            'Fuel cost per kilometre: CPK reporting per vehicle, route and driver.',
            'Custom alerting: configurable by vehicle, region or driver for irregular refuelling, rapid drops or overfills.',
            'ESG support: reduced fuel consumption and lower fuel-related emissions reporting.',
            'Hardware: fuel probe (single or dual tank) with professional installation, plus Track & Trace GPS unit.',
          ],
        },
        {
          keys: ['fleetView'],
          heading: 'Module 3 — Fleet View',
          intro: 'Traditional tracking tells you where a vehicle went. It cannot tell you whether the driver was fatigued, distracted, on the phone or wearing a seatbelt. Fleet View integrates HD forward- and driver-facing cameras with AI analysis, shifting safety management from investigating incidents to preventing them.',
          bullets: [
            'Driver Monitoring System (DMS): fatigue and drowsiness, distraction, mobile phone use, seatbelt non-compliance, driver absence and camera obstruction — with immediate in-cabin alerting.',
            'Advanced Driver Assistance (ADAS): forward collision warning, headway monitoring, lane departure warning, harsh driving and impact detection.',
            'Camera hardware: dual-facing HD system (5MP road, 1080P cabin) with infrared night vision, expandable to four channels.',
            'Basic GPS tracking included: live position and map view, basic trip history, vehicle status, speed, ignition and basic geofencing. Track & Trace can be added for the advanced tier.',
            'Secure video platform: AES256 encrypted storage, TLS 1.3 transmission, dual redundant SD up to 512GB with alarm-triggered lock, 4G LTE upload with Wi-Fi depot sync, forensic video export.',
            "Escalation framework: configurable severity thresholds and notification routing aligned to {CLIENT}'s governance policies.",
            'Reporting: driver risk scorecards, compliance trends, harsh driving heat maps, executive safety dashboards.',
          ],
          footnote: 'Proven impact: in a structured field proof of concept across two vehicles over 36 days, Fleet View captured 263 safety events. Seatbelt non-compliance fell 98.7% over the monitoring period — achieved through monitoring awareness alone, without policy change or disciplinary action.',
        },
        {
          heading: 'Fleet Management Capability',
          intro: 'Beyond tracking, fuel and safety, Fleet Pro carries full fleet management capability — the platform is able to handle the maintenance, workshop, compliance and lifecycle costing work that would otherwise sit in a separate system:',
          bullets: [
            'Preventative maintenance scheduling: service plans triggered by distance, engine hours or calendar interval, using odometer and engine hour data reported automatically by the platform.',
            'Job card management: workshop jobs from raise through parts issue, labour capture and completion sign-off.',
            'Tyre management: fitment, rotation, tread depth tracking and cost per kilometre by tyre position.',
            'Parts and workshop inventory: stock control, usage tracking and reorder management.',
            'Licensing and compliance: licence, roadworthy and permit expiry tracking with advance alerting.',
            'Accident and incident management: incident records with damage capture, repair tracking and insurance claim support — with Fleet View video evidence attached automatically where that module is deployed.',
            'Total cost per kilometre: full CPK incorporating fuel, maintenance, tyres, licensing and depreciation.',
            'Lifecycle analysis: asset ageing, whole-life cost and optimal replacement point modelling.',
          ],
          footnote: 'The more modules deployed, the more complete the cost picture becomes — Track & Trace automates odometer readings, Fuel Control completes the fuel component of CPK, and Fleet View attaches incident evidence directly to accident records.',
        },
      ],
      outcome: 'Complete fleet visibility, fuel loss identified and eliminated, measurably safer drivers, controlled workshop spend, and an accurate total cost per kilometre for every vehicle in the fleet.',
    },
    {
      id: 'stockMaster',
      keys: ['stockMaster'],
      title: 'Stock Master',
      tagline: 'Count once. Count right.',
      intro: 'Manual stock counts are slow, error-prone and immediately out of date. Discrepancies between physical and system stock create picking errors, delivery shortages and write-offs that are difficult to trace. Stock Master replaces count sheets and spreadsheet reconciliation with a barcode-driven digital counting process.',
      blocks: [
        {
          heading: 'Key Capabilities',
          bullets: [
            'Mobile stock counting: Android handheld counting with barcode and QR scanning.',
            'Cycle and full counts: rolling cycle counts, full stock takes and spot checks.',
            'Bin and location management: stock recorded by warehouse, zone, aisle and bin.',
            'Variance reporting: automatic comparison of counted against system stock with variance highlighting.',
            'Multi-user counting: several counters working simultaneously with consolidated results.',
            'Recount workflow: structured recount and supervisor verification for flagged variances.',
            'Batch and expiry tracking: batch number and expiry capture for traceability and FEFO management.',
            'Offline capability: counting continues without connectivity and syncs automatically.',
          ],
        },
        {
          heading: "What's Included",
          bullets: [
            'Stock Master mobile application with device deployment via MDM',
            'Cloud platform access for supervisors and management',
            'Warehouse and user licensing',
            'ERP and WMS integration via API for stock master data and count posting',
            'Variance, accuracy and count productivity reporting',
          ],
        },
      ],
      outcome: 'Accurate stock positions in real time, fewer picking errors and delivery shortages, and traceable variance root causes.',
    },
    {
      id: 'yardManager',
      keys: ['yardManager'],
      title: 'Yard Manager',
      tagline: 'From gate-in to gate-out, in full view.',
      intro: 'The yard is where hours disappear. Vehicles queue without visibility, bays sit idle while trucks wait, and nobody can say how long a vehicle has been on site or why. Delays in the yard cascade directly into late departures and missed delivery windows. Yard Manager turns the yard from a blind spot into a managed part of the chain.',
      blocks: [
        {
          heading: 'Key Capabilities',
          bullets: [
            'Gate-in and gate-out control: automated arrival and departure recording with timestamping.',
            'Bay scheduling and allocation: loading and offloading bay booking with live bay status.',
            'Dwell time monitoring: time on site measured per vehicle with threshold alerting.',
            'Live yard map: real-time view of vehicle position and status within the yard.',
            'Queue management: structured vehicle sequencing to reduce congestion and idle waiting.',
            'Trailer and asset tracking: BLE tag tracking of trailers and yard assets.',
            'Turnaround reporting: total turnaround analysis by vehicle, bay, shift and site.',
            'Late departure analysis: identification of chronic yard-driven delays affecting route start times.',
          ],
        },
        {
          heading: "What's Included",
          bullets: [
            'BLE gateway hardware (LTE enabled) per site with installation',
            'BLE tags or beacons per tracked vehicle, trailer or asset',
            'Cloud platform with live yard dashboard and configurable bay, zone and threshold setup',
            'Integration with Execution Manager so yard delays are visible in the control tower',
          ],
        },
      ],
      outcome: 'Reduced dwell and turnaround time, fewer late departures, and visibility of exactly where yard time is being lost.',
    },
  ];

  // --- Integration, Delivery and Support -----------------------------------
  var INTEGRATION = {
    title: 'Integration, Delivery and Support',
    heading: 'Integration',
    intro: "All Sunstone products are natively API-connected through the Sunstone Control Hub — no integration project is required between Sunstone products. Open REST/JSON APIs over HTTPS connect the suite to {CLIENT}'s existing and future ERP, WMS, order management, HR and finance systems. Where a system transition is underway, structured Excel or CSV exchange serves as an interim method with a defined upgrade path.",
    head: ['Integration', 'Description'],
    rows: [
      { keys: ['routeBuilder'], cells: ['Order ingestion', 'Sales orders and delivery instructions imported into Route Builder'] },
      { cells: ['Master data sync', 'Customers, products, vehicles and drivers from the source system of record'] },
      { keys: ['digitalJourney'], cells: ['Invoice and credit exchange', 'Digital Journey ePOD, credits and returns pushed to ERP for settlement'] },
      { keys: ['stockMaster'], cells: ['Stock synchronisation', 'Stock Master count results posted to WMS or ERP'] },
      { keys: ['tracking', 'fuel', 'fleetView'], cells: ['Telemetry export', 'Fleet Pro position, fuel and event data exposed via API'] },
      { keys: ['tracking', 'fuel', 'fleetView'], cells: ['Maintenance data', 'Fleet Pro service and cost records exchanged with finance systems'] },
    ],
    security: {
      heading: 'Security and Data Ownership',
      bullets: [
        'TLS 1.3 in transit, AES256 at rest; role-based access control with MFA support',
        'POPIA compliant handling of driver identity, biometric, customer and delivery data',
        'Server redundancy, disaster recovery and backup across the Sunstone cloud environment',
        'All data captured within the platform remains the property of {CLIENT}',
        'Cloud-hosted with high availability; self-hosting available at no additional software cost',
      ],
    },
  };

  // --- Implementation ------------------------------------------------------
  var IMPLEMENTATION = {
    title: 'Implementation',
    head: ['Phase', 'Activities'],
    rows: [
      ['1 – Initiation', 'Kick-off, stakeholder alignment, scope confirmation, data readiness assessment.'],
      ['2 – Configuration', 'Platform setup, master data load, workflow and rule configuration, user setup, API or file integration build.'],
      ['3 – Hardware', 'Where applicable: telematics, fuel probe, camera, BLE and mobile device installation, calibration and commissioning.'],
      ['4 – Testing & UAT', 'System testing, user acceptance testing with key stakeholders, formal configuration sign-off.'],
      ['5 – Training & Go-Live', 'Role-based training for planners, dispatchers, drivers, workshop, warehouse and management; parallel run; go-live.'],
      ['6 – Hypercare', 'Enhanced post-go-live support, threshold refinement, KPI baseline, handover to ongoing support.'],
    ],
    timeline: {
      heading: 'Implementation Timeline',
      intro: 'Typical implementation runs between 4 and 8 weeks, dependent on the size and complexity of the integration. A firm schedule is confirmed jointly during the initiation phase once scope, integration requirements and data readiness are established.',
      footnote: 'Fleet Pro is excluded from this guideline. Fleet Pro timelines are driven by hardware installation rather than software configuration, and are dependent on client asset availability for fitment, the size of the on-site technical team, and hardware lead time for delivery into country. A Fleet Pro deployment schedule is confirmed during scoping once fleet size, site locations and hardware quantities are known.',
    },
    support: {
      heading: 'Support',
      bullets: [
        '24/7 helpdesk for fault logging and remote technical support',
        'Defined SLA covering fault response and resolution times by severity',
        'Dedicated account management with scheduled performance reviews',
        'Scheduled software and remote firmware updates — no vehicle off-road time required',
        'Hardware replacement, preventative maintenance and warranty support',
        'Dedicated Project Manager and Implementation Consultant assigned for the duration of delivery',
      ],
    },
  };

  // --- Price List ----------------------------------------------------------
  // Headings and static copy only — every figure comes from the live config
  // via the client-safe price list projection.
  var PRICE_LIST = {
    title: 'Price List',
    intro: 'Standard list pricing and published discount levels. All amounts exclude VAT. Subscription is billed monthly; hardware and installation are once-off.',
    subscription: {
      heading: 'Software Subscription — Monthly',
      head: ['Product', 'Billing', 'Price / month', 'Discounts'],
      footnote: 'Prices are per the billing basis shown (per vehicle, per user, or a flat monthly fee).',
      onRequest: 'Price on Request',
    },
    bundle: {
      heading: 'Multi-Product Bundle Discount',
      intro: 'Applied automatically to eligible products, based on how many eligible products are taken together.',
      head: ['Eligible products selected', 'Discount off list'],
    },
    volume: {
      heading: 'Fleet Volume Discount',
      intro: 'Applied automatically to eligible products, based on fleet size.',
      head: ['Fleet size', 'Tier', 'Discount off list'],
      footnote: 'Bundle and volume discounts stack (multiplicatively) on products eligible for each.',
    },
    hardware: {
      heading: 'Hardware — Once-Off',
      head: ['Item', 'Unit price'],
      footnote: 'All hardware to be delivered outside of South Africa will carry a {INTL} international shipping surcharge.',
    },
    install: {
      heading: 'Installation — Once-Off',
      head: ['Service', 'Rate (per unit)'],
    },
    implementation: {
      heading: 'Implementation Cost',
      intro: 'Implementation and setup costs to be provided subject to scope and size of project.',
    },
    notes: {
      heading: 'Commercial Notes',
      bullets: [
        'Pricing is indicative and valid for 30 days from the date printed. For a tailored quote, contact your Sunstone representative for volume agreements.',
        'All pricing excludes VAT. Monthly costs charged pro rata from the go-live date.',
        'Subscription pricing is per vehicle, per user, or a flat monthly fee as shown, billed monthly in arrears.',
        'Hardware and installation are once-off charges, invoiced on purchase, delivery and commissioning.',
        'Hardware payment terms, 30% on order, 40% on delivery and 30% on completion of installation.',
        'Implementation is a once-off charge, payable per agreed milestones. Hours shown on any implementation quote are estimates; variance is reconciled at project close.',
        'Execution Manager is supplied with Route Builder and is not separately licensed.',
        'The Fleet Pro Track & Trace module is included with Fuel Control at no additional licence cost.',
        'Fleet management capability — maintenance, workshop, compliance and lifecycle costing — is available within Fleet Pro and is not separately licensed.',
        'SIM card, data bundle and monitoring costs are excluded and available on request.',
        'Hardware warranty is activated on professional installation by a Sunstone-certified technician.',
        'Self-hosting available at no additional software cost; all data remains the property of {CLIENT}.',
        'Contract term, escalation, cancellation and warranty periods confirmed during contracting.',
      ],
    },
  };

  // --- Conclusion ----------------------------------------------------------
  var CONCLUSION = {
    title: 'Conclusion',
    paras: [
      'The Sunstone suite covers the full logistics and fleet lifecycle within a single connected ecosystem — accurate stock in the warehouse, optimised routes with live control tower oversight built in, guided execution in the field, and a single Fleet Pro platform covering tracking, fuel, driver safety and full fleet maintenance — closing with a yard that runs to schedule.',
      'Every product delivers measurable value independently. {CLIENT} is under no obligation to deploy the full suite — the recommended approach is to begin with the products addressing the most pressing operational cost or risk, prove the return, and expand from a platform already in place.',
      'Sunstone develops, implements and supports every product directly. There are no third-party partners between {CLIENT} and the people who build the software.',
      'We look forward to the opportunity to partner with {CLIENT} and are available to arrange a demonstration of any or all products at your convenience.',
    ],
  };

  // Table of contents labels, in document order. Entries whose section is not
  // included are dropped by the renderer.
  var CONTENTS_TITLE = 'Contents';

  // Replace the client token throughout a string.
  function withClient(text, client) {
    return String(text == null ? '' : text).split(CLIENT_TOKEN).join(client);
  }

  root.ProposalTemplate = {
    CLIENT_TOKEN: CLIENT_TOKEN,
    COMPANY: COMPANY,
    COVER: COVER,
    EXEC_SUMMARY: EXEC_SUMMARY,
    SUITE_IN_A_DAY: SUITE_IN_A_DAY,
    SECTIONS: SECTIONS,
    INTEGRATION: INTEGRATION,
    IMPLEMENTATION: IMPLEMENTATION,
    PRICE_LIST: PRICE_LIST,
    CONCLUSION: CONCLUSION,
    CONTENTS_TITLE: CONTENTS_TITLE,
    withClient: withClient,
  };
}(typeof window !== 'undefined' ? window : this));
