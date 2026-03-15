import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is missing');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10', // Always use a stable recent API version
  appInfo: {
    name: 'AeroTrade Marketplace',
    version: '1.0.0',
  },
});
