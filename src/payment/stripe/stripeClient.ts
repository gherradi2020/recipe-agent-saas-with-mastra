import Stripe from 'stripe';
import { requireNodeEnvVar } from '../../server/utils';

let stripe: Stripe | undefined;

// Only payment requests need a key; importing the server must also work without one.
export function getStripe(): Stripe {
  return stripe ??= new Stripe(requireNodeEnvVar('STRIPE_API_KEY'), {
    // Keep this API version aligned with the installed Stripe SDK.
    apiVersion: '2025-04-30.basil',
  });
}
