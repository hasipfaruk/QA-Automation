import Stripe from 'stripe';
import { PLANS } from './plans.js';
import { HttpError } from './auth.js';

// Subscription states that keep the paid plan active. past_due gives the customer time to fix their card.
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function createBilling({ db, config, audit }) {
  const { secretKey, webhookSecret, prices } = config.stripe;
  const stripe = secretKey ? new Stripe(secretKey) : null;
  const enabled = Boolean(stripe && prices.pro && prices.business);
  const planByPrice = new Map(Object.entries(prices).filter(([, price]) => price).map(([plan, price]) => [price, plan]));

  const q = {
    setCustomer: db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    byCustomer: db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?'),
    setPlan: db.prepare('UPDATE users SET plan = ?, subscription_status = ?, stripe_subscription_id = ? WHERE id = ?'),
    seenEvent: db.prepare('INSERT OR IGNORE INTO stripe_events (id) VALUES (?)'),
  };

  async function ensureCustomer(user) {
    if (user.stripe_customer_id) return user.stripe_customer_id;
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId: String(user.id) },
    });
    q.setCustomer.run(customer.id, user.id);
    return customer.id;
  }

  /** Returns the Stripe Checkout URL for upgrading to a paid plan. */
  async function checkoutUrl(user, planId) {
    if (!enabled) throw new HttpError(503, 'Billing is not configured on this server.');
    const price = prices[planId];
    if (!price || !PLANS[planId]?.selfServe) throw new HttpError(422, 'This plan cannot be purchased online. Contact sales.');
    if (user.stripe_subscription_id && ACTIVE_STATUSES.has(user.subscription_status)) {
      // Existing subscribers change plans in the billing portal so proration is handled by Stripe.
      return portalUrl(user);
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: await ensureCustomer(user),
      client_reference_id: String(user.id),
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { userId: String(user.id) } },
      success_url: `${config.appUrl}/app/billing?checkout=success`,
      cancel_url: `${config.appUrl}/app/billing?checkout=cancelled`,
    });
    return session.url;
  }

  async function portalUrl(user) {
    if (!stripe) throw new HttpError(503, 'Billing is not configured on this server.');
    if (!user.stripe_customer_id) throw new HttpError(422, 'There is no billing account yet. Choose a plan first.');
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${config.appUrl}/app/billing`,
    });
    return session.url;
  }

  function applySubscription(subscription, { deleted = false } = {}) {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    let user = customerId ? q.byCustomer.get(customerId) : null;
    if (!user && subscription.metadata?.userId) user = q.byId.get(Number(subscription.metadata.userId));
    if (!user) return;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const paidPlan = planByPrice.get(priceId);
    const active = !deleted && ACTIVE_STATUSES.has(subscription.status) && paidPlan;
    const newPlan = active ? paidPlan : 'trial';
    q.setPlan.run(newPlan, deleted ? 'canceled' : subscription.status, deleted ? null : subscription.id, user.id);
    if (newPlan !== user.plan) {
      audit?.record(null, 'billing.plan_changed', { actor: { id: null, email: 'stripe' }, targetType: 'user', targetId: user.id, details: { from: user.plan, to: newPlan, status: subscription.status } });
    }
  }

  /** Verify and process a Stripe webhook. rawBody must be the exact bytes Stripe sent. */
  async function handleWebhook(rawBody, signature) {
    if (!stripe || !webhookSecret) throw new HttpError(503, 'Stripe webhooks are not configured.');
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      throw new HttpError(400, `Webhook signature verification failed: ${err.message}`);
    }
    // Stripe retries deliveries; process each event once.
    if (q.seenEvent.run(event.id).changes === 0) return { duplicate: true };

    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription') break;
        const userId = Number(obj.client_reference_id);
        if (userId && obj.customer) q.setCustomer.run(obj.customer, userId);
        if (obj.subscription) {
          const sub = typeof obj.subscription === 'string' ? await stripe.subscriptions.retrieve(obj.subscription) : obj.subscription;
          applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        applySubscription(obj);
        break;
      case 'customer.subscription.deleted':
        applySubscription(obj, { deleted: true });
        break;
      default:
        break;
    }
    return { type: event.type };
  }

  /** Development helper: change plan without Stripe. Disabled in production. */
  function devSwitch(user, planId) {
    if (!config.devPlanSwitch) throw new HttpError(403, 'Plan switching without Stripe is only available in development.');
    if (!PLANS[planId]) throw new HttpError(422, 'Unknown plan.');
    q.setPlan.run(planId, planId === 'trial' ? null : 'dev', null, user.id);
  }

  return { enabled, stripe, checkoutUrl, portalUrl, handleWebhook, devSwitch };
}
