import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_AI_MODEL, aiApiKey } from '../scanner/checks/ai-review.js';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Load KEY=VALUE pairs from a .env file into process.env (existing variables win). */
export function loadDotEnv(file = path.join(ROOT_DIR, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const bool = (v, fallback) => (v === undefined || v === '' ? fallback : /^(1|true|yes|on)$/i.test(v));
const int = (v, fallback) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = int(env.PORT, 3000);
  const appUrl = (env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const dataDir = path.resolve(ROOT_DIR, env.DATA_DIR || 'data');

  return {
    production,
    port,
    host: env.HOST || '0.0.0.0',
    appUrl,
    secureCookies: appUrl.startsWith('https://'),
    trustProxy: bool(env.TRUST_PROXY, false),
    dataDir,
    dbFile: path.join(dataDir, 'app.db'),
    reportsDir: path.join(dataDir, 'reports'),
    baselinesDir: path.join(dataDir, 'baselines'),
    frontendDir: path.join(ROOT_DIR, 'frontend'),
    role: env.ROLE || 'all', // web | worker | all
    workerConcurrency: int(env.WORKER_CONCURRENCY, 2),
    // Scanning private/internal addresses is only safe on your own machine.
    allowPrivateUrls: bool(env.ALLOW_PRIVATE_URLS, !production),
    signupsOpen: bool(env.SIGNUPS_OPEN, true),
    // Demo accounts are for local evaluation only and are never created in production by default.
    seedDemoUsers: bool(env.SEED_DEMO_USERS, !production),
    salesEmail: env.SALES_EMAIL || 'sales@example.com',
    supportEmail: env.SUPPORT_EMAIL || 'support@example.com',
    aiAvailable: Boolean(env.AI_API_KEY || aiApiKey()),
    aiModel: env.AI_MODEL || DEFAULT_AI_MODEL,
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || '',
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
      prices: { pro: env.STRIPE_PRICE_PRO || '', business: env.STRIPE_PRICE_BUSINESS || '' },
    },
    // Lets you switch plans without Stripe while developing. Never enabled in production.
    devPlanSwitch: !production && !env.STRIPE_SECRET_KEY,
  };
}
