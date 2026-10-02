# QA Automation

[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.x-2EAD33?logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

Automated QA for websites and web apps. Point it at a URL and it crawls the site, tests every page on desktop, tablet and mobile in a real browser, and produces a report with annotated screenshots showing what is broken, where it is, and how to fix it.

It tests the rendered app the way a user sees it, so it works with any stack that runs in a browser, whatever language the backend is written in.

![Sample report](docs/assets/img/sample-report.jpg)

## Features

- **Crawler** that discovers pages by following links, with include/exclude filters and depth limits
- **Multi-device testing** at desktop (1440px), laptop, tablet and mobile sizes, with touch emulation
- **Annotated screenshots**: every problem gets a numbered box on the full-page screenshot, plus a close-up image of each issue
- **Checks across 9 areas**

  | Area | Examples |
  |---|---|
  | Functional | Pages that fail to load, scripted user flows (login, forms, checkout) |
  | JavaScript | Uncaught exceptions, console errors and warnings |
  | Network | 4xx/5xx responses, failed requests, broken links and images, mixed content |
  | Layout | Horizontal overflow, overlapping controls, clipped text, small tap targets, distorted images |
  | Accessibility | WCAG 2.2 A/AA via axe-core (contrast, labels, alt text, ARIA) |
  | Performance | Load time, LCP, CLS, page weight, oversized images |
  | SEO | Title, meta description, H1, heading order, lang, Open Graph, noindex |
  | Visual regression | Pixel diff against approved baseline screenshots |
  | AI review (optional) | Claude reviews screenshots for alignment, consistency, copy and UX problems |

- **Reports** as interactive HTML, Markdown (for tickets) and JSON (for tooling)
- **CI friendly**: exits with code 1 when critical issues are found

## Getting started

Requires Node.js 18 or newer.

```bash
git clone https://github.com/hasipfaruk/QA-Automation.git
cd QA-Automation
npm install
npm run setup     # downloads Chromium for Playwright
```

Run the bundled demo. It serves a small site that has bugs on purpose, then tests it:

```bash
npm run demo -- --open
```

## Usage

```bash
node bin/qa.js https://example.com --open
```

| Option | Description |
|---|---|
| `-c, --config <file>` | JSON config file (defaults to `./qa.config.json` if present) |
| `-p, --max-pages <n>` | Maximum pages to crawl (default 15) |
| `-d, --max-depth <n>` | Maximum link depth from the start URL (default 3) |
| `-v, --viewports <list>` | Comma separated: `desktop,laptop,tablet,mobile` |
| `--only <url>` | Test only this URL, no crawling (repeatable) |
| `--ai` | Enable the Claude screenshot review (needs `ANTHROPIC_API_KEY`) |
| `--visual` | Compare screenshots against saved baselines |
| `--update-baseline` | Save the current screenshots as the new baselines |
| `--no-external` | Skip checking external links |
| `--headed` | Show the browser window while testing |
| `--concurrency <n>` | Number of pages tested in parallel (default 3) |
| `-o, --out <dir>` | Output directory (default `reports`) |
| `--open` | Open the HTML report when finished |

Examples:

```bash
# Local dev server, phones only
node bin/qa.js http://localhost:5173 -v mobile

# Specific pages only
node bin/qa.js --only https://example.com/pricing --only https://example.com/checkout

# Visual regression
node bin/qa.js https://example.com --update-baseline   # first run: approve baselines
node bin/qa.js https://example.com --visual            # later runs: compare
```

## Configuration

Copy [`qa.config.example.json`](qa.config.example.json) to `qa.config.json` and adjust it. The main sections are:

- `auth`: log in once before testing, either with `loginUrl` and `steps` or with a saved Playwright `storageState`. Use `${ENV:NAME}` to read secrets from environment variables so passwords never live in the file.
- `flows`: scripted user journeys. Each step is one action:
  `goto`, `click`, `fill`, `type`, `select`, `check`, `uncheck`, `hover`, `press`, `upload`, `wait`,
  `expectText`, `expectNoText`, `expectVisible`, `expectUrl`.
  Selectors can be CSS (`#email`) or Playwright text selectors (`text=Sign in`).
- `thresholds`: performance and usability limits (load time, LCP, CLS, page weight, tap target and font sizes).
- `ai`: model, effort and `maxScreens`, which caps how many page/device combinations are sent for review.
- `visual`: diff `threshold` in percent of changed pixels and the `baselineDir`.
- `failOn`: `critical`, `high` or `none`, which controls the exit code.

## Output

Each run writes to `reports/<host>_<timestamp>/`:

| File | Contents |
|---|---|
| `report.html` | Overview score, prioritised fix list, page-by-page annotated screenshots, user flow steps |
| `REPORT.md` | The fix list in Markdown, ready to paste into Jira or GitHub issues |
| `results.json` | Raw results for dashboards or other tools |
| `screenshots/` | Clean and annotated full-page captures, issue close-ups, flow steps, visual diffs |

## Roadmap

- [x] Web app scanning across desktop, tablet and mobile
- [x] Accessibility, layout, network, performance and SEO checks
- [x] Scripted user flows with login support
- [x] Visual regression and AI screenshot review
- [ ] API testing (REST and GraphQL)
- [ ] Scheduled monitoring with alerts
- [ ] Hosted dashboard with projects, scan history and teams

## Website

The product landing page lives in [`docs/`](docs/index.html) as plain HTML, CSS and JavaScript. To publish it, enable GitHub Pages in **Settings > Pages** with source `main` and folder `/docs`.

## Project structure

```
bin/qa.js                     CLI entry point
src/runner.js                 crawler and per-page test pipeline
src/checks/inpage.js          layout, image, SEO, performance and link checks (run in the page)
src/checks/accessibility.js   axe-core scan
src/checks/visual.js          baseline screenshot comparison
src/checks/ai-review.js       Claude screenshot review
src/flows.js                  login and scripted user flows
src/rules.js                  titles, severities and fix guidance for every check
src/report/                   scoring, HTML and Markdown reports
demo/                         demo site with known bugs, used by `npm test`
docs/                         product landing page (GitHub Pages)
```

## License

[MIT](LICENSE)
