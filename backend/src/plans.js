// Plan catalogue. Prices are display values; the amount charged comes from the Stripe price.
// Enterprise is assigned by an administrator and has no self-serve checkout.
export const TRIAL_DAYS = 14;

export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Trial',
    price: 0,
    selfServe: false,
    blurb: `Evaluate the platform for ${TRIAL_DAYS} days.`,
    scansPerMonth: 10,
    maxPages: 5,
    viewports: ['desktop', 'mobile'],
    activeScans: 1,
    flows: false,
    ai: false,
    visual: false,
    retentionDays: 7,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 49,
    selfServe: true,
    blurb: 'For product teams shipping every week.',
    scansPerMonth: 300,
    maxPages: 50,
    viewports: ['desktop', 'laptop', 'tablet', 'mobile'],
    activeScans: 2,
    flows: true,
    ai: true,
    visual: true,
    retentionDays: 30,
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 199,
    selfServe: true,
    blurb: 'For agencies and companies with many sites.',
    scansPerMonth: 2000,
    maxPages: 200,
    viewports: ['desktop', 'laptop', 'tablet', 'mobile'],
    activeScans: 5,
    flows: true,
    ai: true,
    visual: true,
    retentionDays: 90,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    selfServe: false,
    blurb: 'Custom limits, onboarding and a dedicated contact.',
    scansPerMonth: 20000,
    maxPages: 1000,
    viewports: ['desktop', 'laptop', 'tablet', 'mobile'],
    activeScans: 10,
    flows: true,
    ai: true,
    visual: true,
    retentionDays: 365,
  },
};

export const PAID_PLANS = ['pro', 'business', 'enterprise'];

export const planFor = (user) => PLANS[user?.plan] || PLANS.trial;

export function trialEndsAt(user) {
  return new Date(Date.parse(user.created_at) + TRIAL_DAYS * 864e5).toISOString();
}

export const trialExpired = (user) => planFor(user).id === 'trial' && Date.now() > Date.parse(trialEndsAt(user));

export function planFeatures(plan) {
  return [
    `${plan.scansPerMonth.toLocaleString('en-US')} scans per ${plan.id === 'trial' ? 'trial' : 'month'}`,
    `Up to ${plan.maxPages.toLocaleString('en-US')} pages per scan`,
    `${plan.viewports.length} device sizes`,
    `${plan.activeScans} parallel scan${plan.activeScans > 1 ? 's' : ''}`,
    plan.flows ? 'User flows and login steps' : null,
    plan.visual ? 'Visual regression baselines' : null,
    plan.ai ? 'AI design review' : null,
    'REST API and CI integration',
    `Reports kept ${plan.retentionDays} days`,
    plan.id === 'enterprise' ? 'Onboarding and priority support' : null,
  ].filter(Boolean);
}

/** Public plan list for the pricing page and API. */
export const publicPlans = () => Object.values(PLANS).map((p) => ({
  id: p.id, name: p.name, price: p.price, selfServe: p.selfServe, blurb: p.blurb, features: planFeatures(p),
  limits: { scansPerMonth: p.scansPerMonth, maxPages: p.maxPages, viewports: p.viewports, activeScans: p.activeScans, flows: p.flows, ai: p.ai, visual: p.visual, retentionDays: p.retentionDays },
}));
