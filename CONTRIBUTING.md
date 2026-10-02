# Contributing

This is a private, proprietary codebase. These guidelines apply to everyone working on it.

## Workflow

1. Create a branch from `main`: `feature/<short-name>`, `fix/<short-name>` or `chore/<short-name>`.
2. Keep changes focused; one topic per pull request.
3. Run `npm run check` (lint and tests) before pushing. CI runs the same checks.
4. Open a pull request with a summary of the change, how it was tested, and screenshots for UI changes.
5. At least one review is required before merging. Squash-merge into `main`.

## Commit messages

Use the imperative mood and a short subject line (`Add audit log export`, `Fix trial expiry check`). Explain the reason for the change in the body when it is not obvious.

## Code standards

- **Structure**: follow the layers described in [docs/architecture.md](docs/architecture.md). Routes handle HTTP only, business rules live in services, shared helpers in `lib`.
- **Modules**: ES modules, one responsibility per file, named exports.
- **Style**: 2-space indentation, single quotes, semicolons; ESLint must pass with no warnings.
- **Security**: validate all input at the route or service boundary; never interpolate user data into SQL (use prepared statements) or HTML (use the `html` template helper). Record security-relevant actions in the audit log.
- **Database**: never edit a shipped migration; append a new one in `backend/src/db/index.js`.
- **Frontend**: no build step and no inline scripts (the Content-Security-Policy forbids them). Pages talk to the backend only through `js/app/core/api.js`.
- **Tests**: add or update tests in `backend/tests` for every behaviour change. Integration tests run the real app and scanner.
- **Dependencies**: add a dependency only when it is clearly better than a small amount of code, and pin it in `backend/package.json`.

## Secrets

Never commit `.env`, credentials, customer data, database files or scan reports. Use `.env.example` to document new settings.
