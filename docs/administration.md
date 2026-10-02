# Administration

## Administrator accounts

Create the first administrator on the server:

```bash
npm run create-admin -- --email you@company.com
```

A strong password is generated and printed once. Use `--password` to choose one, or run the command for an existing account to promote it.

## Demo accounts

For local evaluation, demo accounts are created on start when `SEED_DEMO_USERS` is enabled (the default outside production), or with `npm run seed`.

| Role | Email | Password | Plan |
|---|---|---|---|
| Administrator | `admin@example.com` | `Admin-demo-2026!` | Enterprise |
| Customer | `demo@example.com` | `Demo-user-2026!` | Pro |
| Customer | `trial@example.com` | `Trial-user-2026!` | Trial |

Never enable demo accounts on a public server.

## Admin panel

Administrators see **Admin** in the top navigation (`/app/admin`).

| Section | Capabilities |
|---|---|
| Overview | Customers and new sign-ups, estimated monthly recurring revenue, scans today and per day, queue, failed scans, average score, customers by plan |
| Users | Search by email or name; filter by plan, role and status |
| User detail | Change plan, role and status; end all sessions; delete the account and its data; view usage, API tokens, billing references and recent scans |
| Scans | All scans across customers with status filter, search, report links and deletion |
| Audit log | Filterable, append-only history of security and administrative events |

Plans assigned in the admin panel are not billed. Paid self-serve subscriptions are managed through the payment provider and update the plan automatically.

## Safeguards

- Administrators cannot change their own role or status, or delete themselves.
- The last active administrator cannot be demoted, suspended or deleted.
- Suspending an account ends its sessions immediately and rejects its API tokens.
- Typed values from user flows and login steps are never shown, including to administrators.

## Audit events

| Event | Recorded when |
|---|---|
| `user.signup` | An account is created |
| `user.login`, `user.logout` | A user signs in or out |
| `user.login_failed` | A sign-in attempt fails |
| `user.login_blocked` | A suspended account tries to sign in |
| `user.password_changed` | A password is changed |
| `user.deleted_self` | A customer deletes their account |
| `token.created`, `token.revoked` | An API token is created or revoked |
| `billing.plan_changed` | A subscription change updates the plan |
| `billing.dev_plan_switch` | A plan is switched in development mode |
| `admin.user_updated` | An administrator changes plan, role or status |
| `admin.user_signed_out` | An administrator ends a user's sessions |
| `admin.user_deleted` | An administrator deletes an account |
| `admin.scan_deleted` | An administrator deletes a scan |

Each entry stores the actor, target, details and IP address. Entries cannot be edited or deleted through the application.
