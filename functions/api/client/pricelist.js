/* /api/client/pricelist — sanitised, margin-safe price list for the client
 * price-list page: subscription list prices, published discount levels (bundle +
 * volume), hardware sell prices and installation rates. No cost / margin data.
 * Auth is the client (or internal) cookie, enforced by _middleware. */
import { json, applyActiveConfig, clientPriceList } from '../../_shared.js';
import * as mod from '../../../public/pricing.js';

const Pricing = mod.default || mod.Pricing || mod;

export async function onRequestGet({ env }) {
  const active = await applyActiveConfig(env, Pricing);
  return json(clientPriceList(active, Pricing));
}
