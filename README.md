# Proofline

Enterprise quality assurance platform for websites and web applications.

Proofline crawls a site, tests every page on desktop, tablet and mobile in a real browser, and delivers a prioritised fix list with annotated screenshots. Teams use it through a hosted dashboard, a REST API for CI pipelines, or a command-line scanner.

![Sample report](frontend/public/images/sample-report.jpg)

> **Proprietary software.** This repository is not open source. See [LICENSE](LICENSE).

## Capabilities

| Area | Checks |
|---|---|
| Functional | Pages that fail to load, scripted user flows such as login, search and checkout |
| JavaScript | Uncaught exceptions, console errors and warnings |
| Network | Failed requests, HTTP errors, broken links and images, mixed content |
| Layout | Horizontal overflow, overlapping controls, clipped text, small tap targets, distorted images |
| Accessibility | WCAG 2.2 A/AA: contrast, labels, alternative text, ARIA, keyboard access |
| Performance | Load time, Largest Contentful Paint, Cumulative Layout Shift, page weight |
| SEO | Title, description, headings, language, social tags, noindex |
| Visual regression | Pixel comparison against approved baselines |
| AI design review | Optional review of screenshots for alignment, consistency and usability |

The platform includes accounts, plans and subscription billing, API tokens, an admin panel with an audit log, and network isolation for every scan.

## Getting started

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run setup     # downloads the browser engine used for scanning
npm start
```

Open http://localhost:3000. In development three demo accounts are created automatically. Administrators sign in to the admin console; customers sign in to their workspace.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@example.com` | `Admin-demo-2026!` |
| Customer (Pro) | `demo@example.com` | `Demo-user-2026!` |
| Customer (Trial) | `trial@example.com` | `Trial-user-2026!` |

Settings are read from `.env`; copy [`.env.example`](.env.example) to start.

## Commands

| Command | Description |
|---|---|
| `npm start` | Start the web server and scan worker |
| `npm run dev` | Start with automatic restart on changes |
| `npm test` | Unit and integration tests |
| `npm run lint` | Static analysis |
| `npm run check` | Lint and test |
| `npm run seed` | Create the demo accounts |
| `npm run create-admin -- --email <email>` | Create or promote an administrator |
| `npm run scan -- <url>` | Run the command-line scanner |
| `npm run demo` | Scan the bundled demo site |

## Repository layout

```
backend/                  API server, scan worker, scanning engine and CLI
  src/
    config/               environment settings and plan catalogue
    db/                   database connection and migrations
    lib/                  shared helpers (errors, crypto, validation, rate limiting)
    middleware/           authentication, security headers, error handling
    routes/               HTTP routes grouped by area
    services/             business logic (scans, billing, administration, audit)
    workers/              background scan worker
    scanner/              QA engine: checks, reports, network isolation
    app.js                application assembly
    server.js             entry point
  bin/                    command-line scanner
  scripts/                administration and demo scripts
  tests/                  unit, integration and fixtures
  examples/               scanner configuration example
frontend/
  public/                 static web root: pages, css, js, images
docs/                     architecture, API, administration, configuration, deployment
```

## Documentation

| Guide | Contents |
|---|---|
| [Architecture](docs/architecture.md) | Components, backend layers, request flow, scan lifecycle, data model |
| [API reference](docs/api.md) | REST API for integrations and the session API used by the frontend |
| [Administration](docs/administration.md) | Admin panel, administrator accounts, demo accounts, audit events |
| [Configuration](docs/configuration.md) | Environment variables and plans |
| [Deployment](docs/deployment.md) | Docker, production checklist, scaling, billing setup |
| [Command-line scanner](docs/scanner-cli.md) | CLI options, configuration file, output |
| [Security](SECURITY.md) | Security controls and vulnerability reporting |
| [Contributing](CONTRIBUTING.md) | Development workflow and code standards |
| [Changelog](CHANGELOG.md) | Release history |

## License

Proprietary. Copyright (c) 2026 Proofline. All rights reserved.
