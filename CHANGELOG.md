# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-02

### Added

- Hosted web application with accounts, dashboard, scan history and shareable reports.
- Plans (Trial, Pro, Business, Enterprise) with usage limits and subscription billing.
- REST API with API tokens for CI pipelines and integrations.
- Admin panel: platform overview, user management, all scans and an append-only audit log.
- Roles and account suspension.
- Demo accounts for local evaluation and a `create-admin` command.
- Network isolation for scans through an egress proxy.
- Scanning engine covering functional, JavaScript, network, layout, accessibility, performance, SEO, visual regression and AI design review checks.
- Command-line scanner with HTML, Markdown and JSON reports.
- Docker image, CI pipeline, linting and automated tests.
