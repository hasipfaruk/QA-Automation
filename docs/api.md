# API Reference

There are two APIs:

- **REST API** (`/api/v1`) for customers' CI pipelines and integrations, authenticated with API tokens.
- **Session API** (`/api`) used by the web frontend, authenticated with the session cookie and a CSRF token.

All responses are JSON. Errors have the shape `{ "error": "message" }`.

| Status | Meaning |
|---|---|
| `400` | Malformed request |
| `401` | Not authenticated |
| `402` | The plan does not include this feature or the usage limit is reached |
| `403` | Not allowed (wrong role, suspended account, missing CSRF token) |
| `404` | Not found, or not owned by the caller |
| `409` | Conflict, e.g. the email is already registered |
| `415` | Body must be `application/json` |
| `422` | Validation failed |
| `429` | Rate limit or parallel-scan limit reached |

## REST API

Create a token on the **API** page of the dashboard and send it as `Authorization: Bearer <token>`. Tokens are shown once and stored only as hashes. Requests are limited to 120 per minute per token.

```bash
curl -X POST https://your-domain/api/v1/scans \
  -H "Authorization: Bearer $QA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://staging.example.com", "viewports": ["desktop", "mobile"], "maxPages": 10}'
```

| Method and path | Description |
|---|---|
| `GET /api/v1/me` | Email, plan and usage |
| `GET /api/v1/scans` | List scans (`page`, `limit`) |
| `POST /api/v1/scans` | Start a scan |
| `GET /api/v1/scans/:id` | Scan status and results |
| `POST /api/v1/scans/:id/rerun` | Run the same scan again |
| `DELETE /api/v1/scans/:id` | Delete a scan and its report |

### Scan options

| Field | Type | Description |
|---|---|---|
| `url` | string | Required. Public http or https URL |
| `viewports` | string[] | `desktop`, `laptop`, `tablet`, `mobile` (default desktop and mobile) |
| `maxPages` | number | Pages to crawl, up to the plan limit |
| `checkExternalLinks` | boolean | Check links to other sites (default true) |
| `ai` | boolean | AI design review (paid plans) |
| `visual` | string | `off`, `compare` or `update` (paid plans) |
| `flows` | array or JSON string | User flows: `[{ "name", "viewport", "steps": [...] }]` (paid plans) |
| `login` | object or JSON string | `{ "loginUrl", "steps": [...] }` run before scanning (paid plans) |

Step actions: `goto`, `click`, `fill`, `type`, `select`, `check`, `uncheck`, `hover`, `press`, `wait`, `expectText`, `expectNoText`, `expectVisible`, `expectUrl`. Values typed by `fill` and `type` are redacted in every response.

### Scan object

```json
{
  "id": "Ab3dE5fG7hJk",
  "url": "https://staging.example.com/",
  "status": "done",
  "progress": { "done": 20, "total": 20 },
  "score": 87,
  "grade": "B - Good",
  "summary": { "totalIssues": 14, "bySeverity": { "critical": 0, "high": 2, "medium": 7, "low": 5 }, "topFixes": [] },
  "reportUrl": "https://your-domain/r/<token>/report.html",
  "markdownUrl": "https://your-domain/r/<token>/REPORT.md",
  "createdAt": "2026-10-02T10:00:00.000Z"
}
```

`status` is one of `queued`, `running`, `done`, `failed`.

## Session API

Used by the frontend. Every `POST`, `PATCH` and `DELETE` must send JSON and the `X-CSRF-Token` header returned by `GET /api/session`.

| Area | Endpoints |
|---|---|
| Session | `GET /api/session`, `GET /api/config`, `GET /api/plans`, `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout` |
| Scans | `GET /api/usage`, `GET/POST /api/scans`, `GET/DELETE /api/scans/:id`, `POST /api/scans/:id/rerun` |
| API tokens | `GET/POST /api/tokens`, `DELETE /api/tokens/:id` |
| Account | `PATCH /api/account`, `POST /api/account/password`, `DELETE /api/account` |
| Billing | `GET /api/billing`, `POST /api/billing/checkout`, `POST /api/billing/portal` |
| Administration | `GET /api/admin/stats`, `GET /api/admin/users`, `GET/PATCH/DELETE /api/admin/users/:id`, `POST /api/admin/users/:id/sign-out`, `GET /api/admin/scans`, `GET/DELETE /api/admin/scans/:id`, `GET /api/admin/audit` |

Administration endpoints require the `admin` role.
