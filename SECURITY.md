# Security Policy

## Reporting a vulnerability

Please report security issues privately to **security@example.com**. Do not open public issues for vulnerabilities.

Include a description of the issue, steps to reproduce and the potential impact. We acknowledge reports within two business days and keep you informed until the issue is resolved.

## Security controls

| Area | Control |
|---|---|
| Authentication | scrypt password hashing, server-side sessions in HTTP-only, SameSite cookies, rate-limited login, suspended accounts blocked from web and API |
| Authorization | Role-based access (user, admin); every API route checks ownership or admin role |
| Request forgery | JSON-only state-changing API calls plus a per-session CSRF token header |
| API tokens | Random 240-bit tokens shown once, stored only as SHA-256 hashes, revocable |
| Network isolation | All scan traffic passes through an egress proxy that blocks loopback, private, link-local and metadata addresses, including after redirects |
| Untrusted input | Scan options and user flows are validated against plan limits and a strict schema; file uploads and environment access are disabled for hosted scans |
| Reports | Served from unguessable links with a sandbox Content-Security-Policy, isolated from the application session |
| Secrets in responses | Values typed by user flows and login steps are redacted from every API response |
| Headers | Strict Content-Security-Policy, HSTS (on HTTPS), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy |
| Billing | Stripe webhooks verified by signature and processed idempotently |
| Auditing | Logins, failed logins, password changes, token changes, billing changes and all administrator actions are written to an append-only audit log |

## Deployment checklist

- Serve the application over HTTPS only and set `APP_URL` to the https URL.
- Keep `ALLOW_PRIVATE_URLS=false` and `SEED_DEMO_USERS=false` in production.
- Create administrators with `npm run create-admin`; never use the demo accounts on a public server.
- Store `.env` outside version control and restrict access to the `DATA_DIR` volume.
- Back up `DATA_DIR` regularly and keep the operating system and container image patched.
