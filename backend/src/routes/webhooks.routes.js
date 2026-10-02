import express from 'express';

/** Payment provider webhooks. The raw body is required for signature verification. */
export function webhookRoutes({ billing }) {
  const router = express.Router();
  router.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const result = await billing.handleWebhook(req.body, req.get('stripe-signature'));
    res.json({ received: true, ...result });
  });
  return router;
}
