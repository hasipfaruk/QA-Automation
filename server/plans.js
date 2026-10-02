// Plan limits. Prices are display values; the amount actually charged comes from the Stripe price.
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    blurb: 'Try it on a personal project.',
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
    price: 19,
    blurb: 'For freelancers and small teams shipping every week.',
    scansPerMonth: 200,
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
    price: 79,
    blurb: 'For agencies and product teams with many sites.',
    scansPerMonth: 1500,
    maxPages: 200,
    viewports: ['desktop', 'laptop', 'tablet', 'mobile'],
    activeScans: 4,
    flows: true,
    ai: true,
    visual: true,
    retentionDays: 90,
  },
};

export const planFor = (user) => PLANS[user?.plan] || PLANS.free;

export function planFeatures(plan) {
  return [
    `${plan.scansPerMonth.toLocaleString('en-US')} scans per month`,
    `Up to ${plan.maxPages} pages per scan`,
    `${plan.viewports.length} device sizes`,
    `${plan.activeScans} scan${plan.activeScans > 1 ? 's' : ''} at a time`,
    plan.flows ? 'User flows and login steps' : null,
    plan.visual ? 'Visual regression baselines' : null,
    plan.ai ? 'AI design review' : null,
    'REST API and CI integration',
    `Reports kept ${plan.retentionDays} days`,
  ].filter(Boolean);
}
