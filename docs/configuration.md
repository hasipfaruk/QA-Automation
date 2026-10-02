# Configuration

All settings are environment variables, read from the process environment or a `.env` file in the repository root. See [`.env.example`](../.env.example).

## Application

| Variable | Default | Description |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Public URL, used for report links and payment redirects |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Set to `production` on servers |
| `DATA_DIR` | `data` | Database, reports and visual baselines |
| `ROLE` | `all` | `web` (API and frontend), `worker` (scanner) or `all` |
| `WORKER_CONCURRENCY` | `2` | Scans run in parallel per worker process |
| `TRUST_PROXY` | `false` | Enable behind a reverse proxy or load balancer |
| `SIGNUPS_OPEN` | `true` | Allow new sign-ups |
| `SALES_EMAIL` | `sales@example.com` | Shown on Enterprise "Contact sales" links |
| `SUPPORT_EMAIL` | `support@example.com` | Shown on support links |

## Security

| Variable | Default | Description |
|---|---|---|
| `ALLOW_PRIVATE_URLS` | `true` in development, `false` in production | Allow scans of localhost and private networks |
| `SEED_DEMO_USERS` | `true` in development, `false` in production | Create the demo accounts on start |

## AI design review

| Variable | Description |
|---|---|
| `AI_API_KEY` | API key for the AI provider. The feature is disabled when empty |
| `AI_MODEL` | Optional model override |

## Billing

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Secret API key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint |
| `STRIPE_PRICE_PRO` | Monthly price id for the Pro plan |
| `STRIPE_PRICE_BUSINESS` | Monthly price id for the Business plan |

Without these values billing runs in development mode, where plans can be switched freely.

## Plans

Plans are defined in [`backend/src/config/plans.js`](../backend/src/config/plans.js).

| | Trial | Pro | Business | Enterprise |
|---|---|---|---|---|
| Price | Free for 14 days | $49 / month | $199 / month | Custom |
| Scans | 10 per trial | 300 / month | 2,000 / month | 20,000 / month |
| Pages per scan | 5 | 50 | 200 | 1,000 |
| Devices | desktop, mobile | all 4 | all 4 | all 4 |
| Parallel scans | 1 | 2 | 5 | 10 |
| User flows, login steps, visual regression, AI review | - | Yes | Yes | Yes |
| Report retention | 7 days | 30 days | 90 days | 365 days |
| Purchase | Automatic on sign-up | Self-serve | Self-serve | Assigned by an administrator |

When the trial ends or a subscription is cancelled, the account stays on the Trial plan and cannot start new scans until it upgrades.
