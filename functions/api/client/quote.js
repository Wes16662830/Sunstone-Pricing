/* /api/client/quote — compute a client subscription quote server-side.
 *
 * The client posts { vehicles, users, selected{} }; the shared engine runs here
 * and only the whitelisted, margin-safe projection is returned (see
 * clientQuoteProjection). No cost/margin data is ever sent to the browser. */
import { json, applyActiveConfig, clientQuoteProjection } from '../../_shared.js';
import * as mod from '../../../public/pricing.js';

const Pricing = mod.default || mod.Pricing || mod;

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const vehicles = Math.max(0, Number(body.vehicles) || 0);
  const users = Math.max(0, Number(body.users) || 0);
  const selected = (body.selected && typeof body.selected === 'object') ? body.selected : {};

  await applyActiveConfig(env, Pricing);
  const sub = Pricing.calcSubscription({ vehicles, users, selected });
  const out = clientQuoteProjection(sub, vehicles, users);
  // Hardware is optional: absent when the client only wants subscription pricing.
  if (body.hardware && typeof body.hardware === 'object') {
    out.hardware = Pricing.clientHardwareProjection(
      Pricing.calcHardware(Pricing.clientHardwareInput(body.hardware)));
  }
  return json(out);
}
