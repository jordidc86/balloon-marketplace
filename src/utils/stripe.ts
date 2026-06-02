import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is missing');
  }

  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    appInfo: {
      name: 'AeroTrade Marketplace',
      version: '1.0.0',
    },
  });

  return stripeClient;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, property, receiver) {
    return Reflect.get(getStripe(), property, receiver);
  },
});
