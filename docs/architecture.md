# Architecture

Proofline is a single Node.js service with a static frontend, a SQLite database and a background scan worker.

```
  Browser (frontend/public)          CI pipelines and scripts
          |                                    |
   /api  (session + CSRF)              /api/v1 (API tokens)
          |                                    |
          +---------------+--------------------+
                          |
                Express application  (backend/src/app.js)
       routes -> services -> db          middleware: auth, headers, errors
                          |
                 SQLite (DATA_DIR/app.db)
                          |  queued scans
                 Scan worker (backend/src/workers)
                          |
                 Scanner engine (backend/src/scanner)
                          |
                 Egress proxy -> public internet only
```

## Backend layers

| Layer | Folder | Responsibility |
|---|---|---|
| Entry point | `src/server.js` | Loads configuration, opens the database, starts the web server and/or worker |
| Composition | `src/app.js` | Mounts middleware and routers in order; contains no business logic |
| Routes | `src/routes/` | HTTP concerns only: parse input, call a service, shape the response |
| Services | `src/services/` | Business rules: scans and plan limits, billing, administration, audit, users |
| Middleware | `src/middleware/` | Sessions, CSRF, roles and API tokens; security headers; error handling |
| Data | `src/db/` | Connection and ordered, append-only migrations |
| Configuration | `src/config/` | Environment settings and the plan catalogue |
| Library | `src/lib/` | Small shared helpers: errors, crypto, validation, rate limiting, pagination |
| Worker | `src/workers/` | Claims queued scans, runs the scanner, stores results, enforces retention |
| Scanner | `src/scanner/` | The QA engine, also used directly by the CLI |

Dependencies point downwards only: routes use services, services use `db`, `config` and `lib`. Nothing in `lib` or `scanner` imports application code.

## Frontend

`frontend/public` is served as static files. There is no build step.

| Path | Purpose |
|---|---|
| `index.html`, `css/site.css`, `js/site.js` | Marketing website |
| `app.html` | Shell for the dashboard, admin panel and pricing page |
| `auth.html` | Log in and sign up |
| `js/app/main.js` | Router: maps the URL to a page module |
| `js/app/core/` | API client, HTML templating with escaping, formatting, layout |
| `js/app/components/` | Reusable UI: scan table, scan form, plan cards |
| `js/app/pages/` | One module per page; `pages/admin/` for administration |

Pages fetch all data through `/api`. Access control is enforced by the API; the server also redirects signed-out users away from app pages.

## Request flow

1. The browser loads `app.html`, which loads `js/app/main.js`.
2. `main.js` calls `GET /api/session` to obtain the user and a CSRF token, then renders the page module for the current URL.
3. State-changing calls are JSON with an `X-CSRF-Token` header. `middleware/auth.js` rejects anything else.
4. Routes validate input and call services; services read and write SQLite.

## Scan lifecycle

1. `POST /api/scans` (or `/api/v1/scans`) validates the options against the user's plan, checks the target is a public address and inserts a `queued` scan.
2. The worker claims the oldest queued scan atomically and runs the scanner with network isolation and restricted user flows.
3. Progress is written to the database as pages complete; the frontend polls the scan.
4. On completion the summary is stored and the report files are written to `DATA_DIR/reports/<scan id>`.
5. Reports are served from `/r/<report token>/` under a sandbox policy. Files are deleted when the plan's retention period ends.

## Data model

| Table | Contents |
|---|---|
| `users` | Account, role, status, plan, billing references |
| `sessions` | Hashed session tokens with CSRF token and expiry |
| `api_tokens` | Hashed API tokens per user |
| `scans` | Options, status, progress, score, summary, report token |
| `audit_log` | Append-only security and administration events |
| `stripe_events` | Processed webhook ids for idempotency |
| `schema_migrations` | Applied migration versions |
