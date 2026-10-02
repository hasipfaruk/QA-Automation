# Command-line Scanner

The scanning engine can run without the web application, for local checks or CI jobs on infrastructure you control.

```bash
npm run scan -- https://example.com --open
npm run scan -- --only https://example.com/pricing -v mobile
npm run demo                      # scans a bundled demo site with known bugs
```

## Options

| Option | Description |
|---|---|
| `-c, --config <file>` | JSON config file; see [`backend/examples/qa.config.example.json`](../backend/examples/qa.config.example.json) |
| `-p, --max-pages <n>` | Maximum pages to crawl (default 15) |
| `-d, --max-depth <n>` | Maximum link depth (default 3) |
| `-v, --viewports <list>` | `desktop,laptop,tablet,mobile` |
| `--only <url>` | Test only this URL (repeatable) |
| `--ai` | AI design review (needs `AI_API_KEY`) |
| `--visual` | Compare screenshots with saved baselines |
| `--update-baseline` | Save the current screenshots as baselines |
| `--no-external` | Skip external link checks |
| `--headed` | Show the browser |
| `--concurrency <n>` | Pages tested in parallel (default 3) |
| `-o, --out <dir>` | Output folder (default `reports`) |
| `--open` | Open the HTML report when finished |

## Config file

The config file adds settings that are not available as flags:

- `auth`: log in before testing, with `loginUrl` and `steps`. `${ENV:NAME}` reads secrets from environment variables (CLI only).
- `flows`: scripted user journeys made of steps such as `goto`, `click`, `fill`, `expectText`.
- `thresholds`: load time, LCP, CLS, page weight, tap target and font size limits.
- `include` / `exclude` / `pages`: control which URLs are crawled.
- `failOn`: `critical`, `high` or `none`; sets the exit code for CI.

## Output

Each run writes `reports/<host>_<timestamp>/` containing `report.html`, `REPORT.md`, `results.json` and `screenshots/`. The process exits with code 1 when issues at the `failOn` level are found.
