import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is missing');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-02-25.clover' as any, // Bypass strict typing just in case, or use the exact string
  appInfo: {
    name: 'AeroTrade Marketplace',
    version: '1.0.0',
  },
});
