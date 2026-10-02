// Human-readable titles, severities and fix instructions for every check.
// severity: critical | high | medium | low

export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
export const SEVERITY_WEIGHT = { critical: 12, high: 6, medium: 2, low: 0.5 };

export const CATEGORIES = {
  functional: 'Functional',
  errors: 'JavaScript & Console',
  network: 'Network & Links',
  layout: 'Layout & Responsive',
  accessibility: 'Accessibility',
  performance: 'Performance',
  seo: 'SEO & Metadata',
  visual: 'Visual Regression',
  ai: 'AI Design Review',
};

const px = (n) => `${n}px`;

export const RULES = {
  // ---------- layout ----------
  'horizontal-scroll': {
    category: 'layout', severity: (c) => (c.isMobile ? 'high' : 'medium'),
    title: 'Page scrolls sideways (horizontal overflow)',
    explain: (d) => `The page is ${px(d.pageWidth)} wide but the screen is only ${px(d.viewportWidth)}, so users can scroll/swipe sideways.`,
    fix: () => 'Find the element(s) marked "wider than the screen" below and constrain them: use max-width:100%, width:auto, flex-wrap:wrap, or overflow-x:auto on wide tables/code. Avoid fixed pixel widths (e.g. width:1200px) and 100vw inside padded containers.',
  },
  'element-overflows-viewport': {
    category: 'layout', severity: (c) => (c.isMobile ? 'high' : 'medium'),
    title: 'Element is wider than the screen',
    explain: (d) => `This element sticks out ${px(d.overflowPx)} past the right edge of the ${px(d.viewportWidth)} screen.`,
    fix: () => 'Give it max-width:100% / box-sizing:border-box, remove fixed widths or large negative margins, and let flex/grid children wrap (flex-wrap:wrap, minmax(0,1fr)). For images/videos add max-width:100%;height:auto.',
  },
  'missing-viewport-meta': {
    category: 'layout', severity: () => 'critical',
    title: 'Missing mobile viewport tag',
    explain: () => 'Without <meta name="viewport"> phones render the page at desktop width and shrink it, making everything tiny.',
    fix: () => 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> inside <head>.',
  },
  'small-tap-target': {
    category: 'layout', severity: () => 'medium',
    title: 'Button/link too small to tap',
    explain: (d) => `Tap target is ${d.width}x${d.height}px; minimum recommended is ${d.min}x${d.min}px (WCAG 2.5.8; 44px is ideal).`,
    fix: () => 'Increase padding or min-width/min-height (e.g. min-height:44px; padding:10px 14px), and leave at least 8px spacing between adjacent targets.',
  },
  'small-text': {
    category: 'layout', severity: (c) => (c.isMobile ? 'medium' : 'low'),
    title: 'Text too small to read',
    explain: (d) => `Font size is ${d.fontSize}px (minimum ${d.min}px; 16px recommended for body text on mobile).`,
    fix: () => 'Raise font-size to at least 12px for secondary text and 16px for body copy. Prefer rem units so text scales with user settings.',
  },
  'clipped-text': {
    category: 'layout', severity: () => 'medium',
    title: 'Text is cut off',
    explain: (d) => `Content is ${d.contentW}x${d.contentH}px but only ${d.visibleW}x${d.visibleH}px is visible because overflow is hidden.`,
    fix: () => 'Remove the fixed width/height, use min-height instead of height, allow wrapping (white-space:normal; overflow-wrap:anywhere), or intentionally truncate with text-overflow:ellipsis and a title/tooltip.',
  },
  'overlapping-elements': {
    category: 'layout', severity: () => 'high',
    title: 'Clickable elements overlap',
    explain: (d) => `Overlaps ${d.overlapPct}% with ${d.other}. Users may tap the wrong thing or be unable to reach one of them.`,
    fix: () => 'Check absolute/fixed positioning, negative margins and z-index on both elements. Use flex/grid gap for spacing and make sure containers grow with their content.',
  },
  'broken-image': {
    category: 'network', severity: () => 'high',
    title: 'Broken image',
    explain: (d) => `Image failed to load: ${d.src}`,
    fix: () => 'Fix the image path/URL (check case-sensitivity and build output paths), make sure the file is deployed, and add width/height + meaningful alt text.',
  },
  'distorted-image': {
    category: 'layout', severity: () => 'medium',
    title: 'Image is stretched / squashed',
    explain: (d) => `Displayed at ${d.rendered} but the image is ${d.natural} - distorted by ~${d.stretchPct}%.`,
    fix: () => 'Set only one of width/height (the other "auto"), or use object-fit:cover / object-fit:contain on the <img>.',
  },
  'oversized-image': {
    category: 'performance', severity: () => 'low',
    title: 'Image much larger than displayed',
    explain: (d) => `Image is ${d.natural} wide but shown at only ${d.rendered}. Wastes bandwidth and slows loading.`,
    fix: () => 'Resize/compress the image, serve modern formats (WebP/AVIF) and use srcset/sizes so phones download smaller versions.',
  },

  // ---------- errors / network ----------
  'page-crash': {
    category: 'errors', severity: () => 'critical',
    title: 'Uncaught JavaScript error',
    explain: (d) => d.message,
    fix: (d) => `Open the browser DevTools console on this page and fix the exception${d.location ? ` at ${d.location}` : ''}. Uncaught errors often break buttons, forms and rendering further down the page.`,
  },
  'console-error': {
    category: 'errors', severity: () => 'high',
    title: 'Console error',
    explain: (d) => d.message,
    fix: (d) => `Investigate this console error${d.location ? ` (${d.location})` : ''}. Common causes: failed API calls, missing files, undefined variables, React/Vue key or prop warnings promoted to errors.`,
  },
  'console-warning': {
    category: 'errors', severity: () => 'low',
    title: 'Console warnings',
    explain: (d) => `${d.count} warning(s), e.g. "${d.sample}"`,
    fix: () => 'Review console warnings - deprecations and framework warnings often become errors in future releases.',
  },
  'http-error': {
    category: 'network', severity: (c, d) => (d.isDocument ? 'critical' : d.status >= 500 ? 'high' : /\.(js|css)(\?|$)/i.test(d.url) ? 'high' : 'medium'),
    title: 'Request failed with an HTTP error',
    explain: (d) => `${d.method} ${d.url} -> ${d.status} ${d.statusText || ''}`.trim(),
    fix: (d) => d.status === 404 ? 'The file/endpoint does not exist. Fix the URL in your code or deploy the missing resource.'
      : d.status === 401 || d.status === 403 ? 'Request was rejected for auth reasons. Check credentials/tokens, CORS and server permissions.'
      : d.status >= 500 ? 'Server-side error. Check backend logs for this endpoint - it crashed or timed out.'
      : 'Check the request parameters and server handler for this endpoint.',
  },
  'request-failed': {
    category: 'network', severity: () => 'medium',
    title: 'Network request failed',
    explain: (d) => `${d.method} ${d.url} - ${d.error}`,
    fix: () => 'The request never completed (DNS, CORS, blocked, timeout or connection reset). Verify the URL/host and CORS headers, and that the service is reachable.',
  },
  'mixed-content': {
    category: 'network', severity: () => 'high',
    title: 'Insecure (http://) resource on https page',
    explain: (d) => `Loads ${d.url} over plain HTTP.`,
    fix: () => 'Change the resource URL to https:// (or a protocol-relative/relative path). Browsers block or warn on mixed content.',
  },
  'broken-link': {
    category: 'network', severity: (c, d) => (d.internal ? 'high' : 'medium'),
    title: 'Broken link',
    explain: (d) => `Link to ${d.href} returns ${d.status || d.error}.`,
    fix: (d) => d.internal ? 'Update the link to the correct page or restore/redirect the missing page (301 redirect).' : 'The external page is gone or unreachable - update or remove the link.',
  },
  'page-load-failed': {
    category: 'functional', severity: () => 'critical',
    title: 'Page failed to load',
    explain: (d) => d.message,
    fix: () => 'The page did not load at all. Check the server is running, the route exists, and there are no redirect loops or timeouts.',
  },

  // ---------- performance ----------
  'slow-load': {
    category: 'performance', severity: (c, d) => (d.value > d.limit * 2 ? 'high' : 'medium'),
    title: 'Slow page load',
    explain: (d) => `Page took ${(d.value / 1000).toFixed(1)}s to fully load (target < ${(d.limit / 1000).toFixed(1)}s).`,
    fix: () => 'Reduce JS bundle size (code-split, lazy-load routes), defer non-critical scripts, compress assets (gzip/brotli), use a CDN and cache headers.',
  },
  'slow-lcp': {
    category: 'performance', severity: (c, d) => (d.value > 4000 ? 'high' : 'medium'),
    title: 'Main content appears slowly (LCP)',
    explain: (d) => `Largest Contentful Paint is ${(d.value / 1000).toFixed(1)}s (good < 2.5s).`,
    fix: () => 'Optimize the hero image/heading: preload it (<link rel="preload">), serve a smaller/compressed image, avoid lazy-loading above-the-fold images, and cut render-blocking CSS/JS.',
  },
  'layout-shift': {
    category: 'performance', severity: (c, d) => (d.value > 0.25 ? 'high' : 'medium'),
    title: 'Content jumps around while loading (CLS)',
    explain: (d) => `Cumulative Layout Shift is ${d.value} (good < 0.1).`,
    fix: () => 'Set width/height (or aspect-ratio) on images, videos, ads and embeds; reserve space for banners; avoid inserting content above existing content; use font-display:optional/swap with matched fallback fonts.',
  },
  'heavy-page': {
    category: 'performance', severity: () => 'medium',
    title: 'Page is very heavy',
    explain: (d) => `About ${Math.round(d.value / 1024 * 10) / 10} MB transferred across ${d.requests} requests (target < ${Math.round(d.limit / 1024)} MB).`,
    fix: () => 'Compress images (WebP/AVIF), remove unused JS/CSS, lazy-load below-the-fold media, and audit third-party scripts.',
  },

  // ---------- SEO ----------
  'missing-title': { category: 'seo', severity: () => 'high', title: 'Missing page title', explain: () => 'The <title> tag is empty or missing.', fix: () => 'Add a unique, descriptive <title> (50-60 characters) to every page.' },
  'bad-title-length': { category: 'seo', severity: () => 'low', title: 'Page title length not ideal', explain: (d) => `Title is ${d.length} characters: "${d.title}"`, fix: () => 'Keep titles between ~15 and 60 characters so they are not truncated in search results.' },
  'missing-description': { category: 'seo', severity: () => 'medium', title: 'Missing meta description', explain: () => 'No <meta name="description"> found.', fix: () => 'Add <meta name="description" content="..."> with a 120-160 character summary of the page.' },
  'h1-count': { category: 'seo', severity: (c, d) => (d.count === 0 ? 'medium' : 'low'), title: 'Page should have exactly one H1', explain: (d) => `Found ${d.count} visible <h1> elements.`, fix: () => 'Use one <h1> for the main page heading and h2-h6 for sub-sections.' },
  'heading-skip': { category: 'seo', severity: () => 'low', title: 'Heading levels skipped', explain: (d) => `Heading order jumps ${d.skip}.`, fix: () => 'Do not skip heading levels (h2 -> h4). Choose heading tags by structure, style them with CSS.' },
  'missing-lang': { category: 'seo', severity: () => 'medium', title: 'Missing page language', explain: () => '<html> has no lang attribute.', fix: () => 'Add lang to the html tag, e.g. <html lang="en">.' },
  'missing-favicon': { category: 'seo', severity: () => 'low', title: 'Missing favicon', explain: () => 'No <link rel="icon"> found.', fix: () => 'Add a favicon (<link rel="icon" href="/favicon.ico">), plus apple-touch-icon for mobile.' },
  'missing-og': { category: 'seo', severity: () => 'low', title: 'Missing social sharing tags', explain: (d) => `Missing ${d.missing.join(', ')}.`, fix: () => 'Add Open Graph tags (og:title, og:description, og:image) so links look good when shared on social media/chat apps.' },
  'noindex': { category: 'seo', severity: () => 'medium', title: 'Page blocked from search engines', explain: (d) => `meta robots = "${d.robots}"`, fix: () => 'Remove "noindex" if this page should appear in search results (common mistake after launching from staging).' },

  // ---------- visual ----------
  'visual-change': {
    category: 'visual', severity: (c, d) => (d.diffPct > 10 ? 'high' : 'medium'),
    title: 'Visual change compared to baseline',
    explain: (d) => `${d.diffPct}% of pixels changed since the approved baseline${d.sizeChanged ? ` (page size changed from ${d.baseSize} to ${d.newSize})` : ''}.`,
    fix: () => 'Open the diff image (red = changed pixels). If the change is intended, re-run with --update-baseline to approve it; otherwise find the CSS/content change that caused it.',
  },
  'new-baseline': {
    category: 'visual', severity: () => 'low',
    title: 'Baseline screenshot saved',
    explain: () => 'No previous baseline existed; this screenshot is now the baseline for future comparisons.',
    fix: () => 'Nothing to fix. Future runs with --visual will compare against this image.',
  },

  // ---------- flows ----------
  'flow-step-failed': {
    category: 'functional', severity: () => 'critical',
    title: 'User flow failed',
    explain: (d) => `Flow "${d.flow}" failed at step ${d.step} (${d.action}): ${d.message}`,
    fix: () => 'Reproduce the flow manually using the step screenshots. Check that the selector still exists, the button is enabled/visible, and the backend responds correctly.',
  },
};

/** Build a normalized issue object. */
export function makeIssue(rule, ctx, detail = {}, extra = {}) {
  const r = RULES[rule];
  if (!r) throw new Error('Unknown rule ' + rule);
  return {
    rule,
    category: r.category,
    severity: r.severity(ctx, detail),
    title: r.title,
    description: r.explain(detail),
    fix: r.fix(detail),
    detail,
    ...extra,
  };
}
