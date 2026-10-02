# Deployment

## Docker

The `Dockerfile` builds a production image that includes the browser engine and its system libraries.

```bash
cp .env.example .env    # set APP_URL, NODE_ENV=production and billing keys
docker compose up -d --build
docker compose exec app npm run create-admin -- --email you@company.com
```

The container stores all state in the `/data` volume. Any platform that runs containers with a persistent volume is suitable.

## Production checklist

- Terminate HTTPS in front of the application and set `APP_URL` to the https address.
- Set `TRUST_PROXY=true` when a proxy or load balancer forwards requests.
- Keep `ALLOW_PRIVATE_URLS=false` and `SEED_DEMO_USERS=false` (the image defaults).
- Create administrators with `npm run create-admin`.
- Configure billing (below) and replace `SALES_EMAIL` and `SUPPORT_EMAIL`.
- Back up the `/data` volume regularly.
- Keep the host and the container image updated.

## Scaling

Web and scanner work can run as separate processes that share the same data volume:

```bash
ROLE=web    npm start   # API and frontend
ROLE=worker npm start   # one or more scanner processes
```

`WORKER_CONCURRENCY` sets parallel scans per worker. Scans are claimed atomically, so several workers can run safely on the same machine. The login rate limiter is held in memory per web process.

## Billing setup

1. Create two products with monthly recurring prices (Pro and Business) and copy their price ids.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` and `STRIPE_PRICE_BUSINESS`.
3. Add a webhook endpoint `https://your-domain/stripe/webhook` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Set `STRIPE_WEBHOOK_SECRET` to its signing secret.
4. Enable the customer portal so customers can change or cancel their plan.

For local testing forward events with `stripe listen --forward-to localhost:3000/stripe/webhook`.

## Upgrades

Database migrations run automatically on start and are applied in order. Back up `/data` before upgrading.
