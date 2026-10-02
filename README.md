# QA Automation

Enterprise quality assurance platform for websites and web applications.

QA Automation crawls a site, tests every page on desktop, tablet and mobile in a real browser, and delivers a prioritised fix list with annotated screenshots. Customers use it through a hosted dashboard, a REST API for CI pipelines, or the command-line scanner.

![Sample report](frontend/site/assets/img/sample-report.jpg)

> **Proprietary software.** This repository is not open source. See [LICENSE](LICENSE).

---

## Contents

- [Capabilities](#capabilities)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Administration](#administration)
- [Plans](#plans)
- [Configuration](#configuration)
- [Billing](#billing)
- [REST API](#rest-api)
- [Command-line scanner](#command-line-scanner)
- [Deployment](#deployment)
- [Security](#security)
- [Testing](#testing)
- [Project structure](#project-structure)

---

## Capabilities

| Area | What is checked |
|---|---|
| Functional | Pages that fail to load, scripted user flows (login, search, checkout) |
| JavaScript | Uncaught exceptions, console errors and warnings |
| Network | 4xx/5xx responses, failed requests, broken links and images, mixed content |
| Layout and responsive | Horizontal overflow, overlapping controls, clipped text, small tap targets, distorted images |
| Accessibility | WCAG 2.2 A/AA rules: contrast, labels, alternative text, ARIA, keyboard access |
| Performance | Load time, Largest Contentful Paint, Cumulative Layout Shift, page weight, oversized images |
| SEO | Title, description, headings, language, social tags, accidental noindex |
| Visual regression | Pixel comparison against approved baselines with diff images |
| AI design review | Optional review of screenshots for alignment, consistency, copy and usability problems |

Every scan produces an interactive HTML report, a Markdown fix list for issue trackers and JSON results for integrations.

## Architecture

```
            Browser                                   CI pipelines / scripts
               |                                               |
        frontend/ (static)                            REST API  /api/v1  (API tokens)
        site/  marketing pages                                 |
        app/   dashboard + admin  ---- JSON  /api ----+--------+
                                                      |
                                       backend/src  (Express)
                                       auth, plans, billing, admin, audit
                                                      |
                                    SQLite  <-- queue --> worker
                                                            |
                                              backend/scanner (headless browser)
                                                            |
                                         egress proxy (public internet only)
```

- **Frontend** (`frontend/`): static HTML, CSS and JavaScript modules with no build step. The dashboard and admin panel talk to the backend only through the JSON API.
- **Backend** (`backend/`): Node.js and Express. Serves the API, the frontend files and sandboxed reports. A background worker runs scans; web and worker can run as separate processes.
- **Storage**: SQLite (built into Node.js) in `DATA_DIR`, plus report files and visual baselines on disk.

## Quick start

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run setup          # downloads the browser engine used for scanning
cp .env.example .env   # adjust settings if needed
npm start
```

Open http://localhost:3000 and log in with one of the demo accounts below.

For development with automatic restarts use `npm run dev`.

## Demo accounts

In development the demo accounts are created automatically on start (`SEED_DEMO_USERS`, default on outside production). You can also create them with `npm run seed`.

| Role | Email | Password | Plan |
|---|---|---|---|
| Administrator | `admin@example.com` | `Admin-demo-2026!` | Enterprise |
| Customer | `demo@example.com` | `Demo-user-2026!` | Pro |
| Customer (trial) | `trial@example.com` | `Trial-user-2026!` | Trial |

These accounts are for local evaluation only. They are never created in production unless `SEED_DEMO_USERS=true` is set explicitly, which you should not do on a public server.

Without payment keys the Billing page runs in development mode, so plans can be switched freely to try every feature.

## Administration

Administrators see an **Admin** entry in the top navigation (`/app/admin`).

| Section | What it does |
|---|---|
| Overview | Customers, estimated monthly recurring revenue, scans today and per day, queue status, failed scans, average score, plan distribution |
| Users | Search and filter all accounts by plan, role and status |
| User detail | Change plan, promote to administrator, suspend or reactivate, end all sessions, delete the account and its data; view usage, API tokens and recent scans |
| Scans | Every scan across all customers, with filters, report links and deletion |
| Audit log | Append-only record of logins, failed and blocked logins, password changes, API token changes, billing changes and every administrator action |

Safeguards: administrators cannot change their own role or status, the last active administrator cannot be removed, and suspending an account immediately ends its sessions and blocks its API tokens.

Create the first production administrator from the server:

```bash
npm run create-admin -- --email you@company.com
```

A strong password is generated and printed once. Pass `--password` to set your own, or run the command for an existing account to promote it.

## Plans

Plan limits are defined in [`backend/src/plans.js`](backend/src/plans.js).

| | Trial | Pro | Business | Enterprise |
|---|---|---|---|---|
| Price | Free for 14 days | $49 / month | $199 / month | Custom |
| Scans | 10 per trial | 300 / month | 2,000 / month | 20,000 / month |
| Pages per scan | 5 | 50 | 200 | 1,000 |
| Devices | desktop, mobile | all 4 | all 4 | all 4 |
| Parallel scans | 1 | 2 | 5 | 10 |
| User flows, login steps, visual regression, AI review | - | Yes | Yes | Yes |
| Report retention | 7 days | 30 days | 90 days | 365 days |

New accounts start on the Trial plan. After 14 days scanning stops until the customer upgrades. Enterprise is assigned by an administrator and is not sold through self-serve checkout.

## Configuration

All settings are environment variables; see [`.env.example`](.env.example).

| Variable | Default | Description |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Public URL, used for report links and payment redirects |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Set to `production` on servers |
| `DATA_DIR` | `data` | Database, reports and baselines |
| `ROLE` | `all` | `web`, `worker` or `all` |
| `WORKER_CONCURRENCY` | `2` | Scans run in parallel per worker |
| `TRUST_PROXY` | `false` | Enable behind a reverse proxy or load balancer |
| `SIGNUPS_OPEN` | `true` | Allow new sign ups |
| `ALLOW_PRIVATE_URLS` | `true` in development, `false` in production | Allow scanning private and local addresses |
| `SEED_DEMO_USERS` | `true` in development, `false` in production | Create the demo accounts on start |
| `SALES_EMAIL`, `SUPPORT_EMAIL` | example addresses | Contact addresses shown in the product |
| `AI_API_KEY`, `AI_MODEL` | empty | Enables the AI design review |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | empty | Online billing |

## Billing

Payments use Stripe Checkout and the Stripe customer portal.

1. Create two products with monthly recurring prices (Pro and Business) and copy their price IDs.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` and `STRIPE_PRICE_BUSINESS`.
3. Add a webhook endpoint `https://your-domain/stripe/webhook` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`, and set `STRIPE_WEBHOOK_SECRET` to its signing secret.
4. Enable the customer portal so customers can change or cancel their plan.

Webhooks are verified by signature and processed once per event. When a subscription ends the account returns to the Trial plan.

## REST API

Customers create API tokens on the **API** page. Tokens are shown once and stored only as hashes.

```bash
curl -X POST https://your-domain/api/v1/scans \
  -H "Authorization: Bearer $QA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://staging.example.com", "viewports": ["desktop", "mobile"], "maxPages": 10}'

curl https://your-domain/api/v1/scans/SCAN_ID -H "Authorization: Bearer $QA_TOKEN"
```

| Endpoint | Description |
|---|---|
| `GET /api/v1/me` | Plan and usage |
| `POST /api/v1/scans` | Start a scan: `url`, `viewports`, `maxPages`, `checkExternalLinks`, `ai`, `visual` (`off`, `compare`, `update`), `flows`, `login` |
| `GET /api/v1/scans` | List scans (`page`, `limit`) |
| `GET /api/v1/scans/:id` | Status, score, summary, `reportUrl`, `markdownUrl` |
| `POST /api/v1/scans/:id/rerun` | Run the same scan again |
| `DELETE /api/v1/scans/:id` | Delete a scan and its report |

Errors are returned as `{ "error": "..." }`. `402` means the request needs a higher plan, `429` means a limit was reached.

## Command-line scanner

The scanner can also run on its own, without the web application.

```bash
node backend/cli/qa.js https://example.com --open
node backend/cli/qa.js --only https://example.com/pricing -v mobile
npm run demo -- --open      # scans a bundled demo site with known bugs
```

| Option | Description |
|---|---|
| `-c, --config <file>` | JSON config file (`qa.config.example.json` shows every option) |
| `-p, --max-pages <n>` | Maximum pages to crawl (default 15) |
| `-d, --max-depth <n>` | Maximum link depth (default 3) |
| `-v, --viewports <list>` | `desktop,laptop,tablet,mobile` |
| `--only <url>` | Test only this URL (repeatable) |
| `--ai` | AI design review (needs `AI_API_KEY`) |
| `--visual` / `--update-baseline` | Compare with or save visual baselines |
| `--no-external` | Skip external link checks |
| `--headed` | Show the browser |
| `-o, --out <dir>` | Output folder (default `reports`) |
| `--open` | Open the HTML report when finished |

Reports are written to `reports/<host>_<timestamp>/` as `report.html`, `REPORT.md`, `results.json` and `screenshots/`. The process exits with code 1 when critical issues are found, so it can gate CI builds.

## Deployment

The `Dockerfile` builds a production image with the browser engine and all system libraries included.

```bash
cp .env.example .env    # set APP_URL, NODE_ENV=production and billing keys
docker compose up -d --build
docker compose exec app npm run create-admin -- --email you@company.com
```

Any host that runs containers with a persistent volume works (virtual server, Railway, Render, Fly.io and similar). Terminate HTTPS in front of the app and set `TRUST_PROXY=true`. Back up the `/data` volume.

To scale, run one `ROLE=web` process and one or more `ROLE=worker` processes sharing the same data volume.

## Security

The platform runs untrusted URLs and user-defined browser flows, so it is locked down by default:

- **Network isolation**: every browser request goes through a built-in egress proxy that blocks loopback, private, link-local and cloud metadata addresses, including after redirects.
- **Restricted flows**: hosted flows cannot upload server files or read server environment variables, and typed values are redacted from all API responses.
- **Sandboxed reports**: reports are served from unguessable links under a `sandbox` Content-Security-Policy, isolated from the application session.
- **Accounts**: scrypt password hashing, HTTP-only session cookies, CSRF tokens on every state-changing request, rate-limited login, account suspension, role-based access control.
- **Auditing**: an append-only audit log of security-relevant and administrative events.

See [SECURITY.md](SECURITY.md) for the full list of controls, the deployment checklist and how to report a vulnerability.

## Testing

```bash
npm test             # unit and integration tests (starts the app, runs real scans)
npm run test:demo    # command-line scanner against the demo site
```

CI runs both suites on every push (`.github/workflows/ci.yml`).

## Project structure

```
backend/
  src/                    web application
    index.js              entry point (web server and worker)
    app.js                routes, security headers, static frontend, reports
    routes/               session, account, admin and public API routes
    auth.js               sessions, CSRF, roles, API tokens
    admin.js              administration service
    audit.js              audit log
    billing.js            subscriptions and webhooks
    plans.js              plan catalogue and limits
    scans.js              scan validation, limits and storage
    worker.js             background scan worker
    db.js                 schema and migrations
    seed.js               demo accounts
  scanner/                scanning engine
    runner.js             crawler and per-page test pipeline
    checks/               layout, accessibility, visual and AI checks
    net/egress-proxy.js   network isolation for scans
    flows.js              user flows and login steps
    report/               scoring and report generation
  cli/qa.js               command-line scanner
  scripts/                create-admin and seed scripts
frontend/
  site/                   marketing website
  app/                    dashboard and admin panel
    assets/js/core/       API client, templating, layout
    assets/js/pages/      customer pages
    assets/js/pages/admin administration pages
tests/                    unit and integration tests
demo/                     demo website with known bugs
```

## License

Proprietary. Copyright (c) 2026 QA Automation. All rights reserved. See [LICENSE](LICENSE).
