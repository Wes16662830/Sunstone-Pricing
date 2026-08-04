/* /api/client/catalog — sanitised product list for the client quote page.
 *
 * MARGIN-SAFE: returns only the per-unit LIST (sell) price the client would pay,
 * the billing basis, and discount eligibility. Marginal cost, target GM and step
 * cost are computed away server-side and never leave this endpoint. Auth is the
 * client (or internal) cookie, enforced by _middleware. */
import { json, applyActiveConfig } from '../../_shared.js';
import * as mod from '../../../public/pricing.js';

const Pricing = mod.default || mod.Pricing || mod;

export async function onRequestGet({ env }) {
  const active = await applyActiveConfig(env, Pricing);
  const products = active.products.map((p) => ({
    key: p.key,
    name: p.quoteLabel || p.name,
    billing: p.billing,
    billingLabel: p.billing === 'perUser' ? 'per user'
      : p.billing === 'flat' ? 'flat / month' : 'per vehicle',
    unitPrice: Pricing.listPrice(p),
    bundleEligible: p.bundleEligible,
    volumeEligible: p.volumeEligible,
  }));
  return json({ products, currency: { zarPerUnit: active.currency.zarPerUnit } });
}
