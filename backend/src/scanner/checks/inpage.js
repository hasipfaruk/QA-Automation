// Functions in this file are serialized and executed INSIDE the browser page via page.evaluate().
// They must be fully self-contained (no imports, no outer-scope references).

/** Core Web Vitals + timing. Run right after load, before any scrolling. */
export async function collectPerf() {
  const nav = performance.getEntriesByType('navigation')[0];
  const observe = (type, onEntries) =>
    new Promise((resolve) => {
      try {
        new PerformanceObserver((list) => onEntries(list.getEntries())).observe({ type, buffered: true });
      } catch { /* unsupported */ }
      setTimeout(resolve, 150);
    });
  let lcp = 0;
  let cls = 0;
  await Promise.all([
    observe('largest-contentful-paint', (es) => { for (const e of es) lcp = Math.max(lcp, e.startTime); }),
    observe('layout-shift', (es) => { for (const e of es) if (!e.hadRecentInput) cls += e.value; }),
  ]);
  const resources = performance.getEntriesByType('resource');
  let bytes = nav?.transferSize || 0;
  for (const r of resources) bytes += r.transferSize || r.encodedBodySize || 0;
  return {
    ttfbMs: nav ? Math.round(nav.responseStart - nav.startTime) : null,
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
    loadMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
    lcpMs: lcp ? Math.round(lcp) : null,
    cls: Math.round(cls * 1000) / 1000,
    requests: resources.length + 1,
    pageWeightKb: Math.round(bytes / 1024),
  };
}

/** Scroll through the page so lazy-loaded content renders, then go back to top. */
export async function autoScroll() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
  const maxH = 20000;
  for (let y = 0; y < Math.min(document.documentElement.scrollHeight, maxH); y += step) {
    window.scrollTo(0, y);
    await sleep(120);
  }
  window.scrollTo(0, 0);
  await sleep(300);
}

/** Layout / UI / SEO / link inspection. Returns raw findings; node side turns them into issues. */
export function auditPage(opts) {
  const { isMobile, minTapTargetPx, minFontPx } = opts;
  const findings = [];
  const vw = document.documentElement.clientWidth;

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const cssPath = (el) => {
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    const uniqueId = (e) => e.id && document.querySelectorAll('#' + esc(e.id)).length === 1;
    if (uniqueId(el)) return '#' + esc(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && parts.length < 6) {
      if (uniqueId(cur)) { parts.unshift('#' + esc(cur.id)); break; }
      let part = cur.tagName.toLowerCase();
      const cls = [...cur.classList].filter((c) => /^[a-zA-Z_-][\w-]*$/.test(c) && c.length < 40).slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
      const parent = cur.parentElement;
      if (parent) {
        const sibs = [...parent.children].filter((s) => s.tagName === cur.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(' > ');
  };
  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    const txt = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.value || '')
      .trim().replace(/\s+/g, ' ').slice(0, 60);
    return `<${tag}>${txt ? ' "' + txt + '"' : ''}`;
  };
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const add = (rule, el, detail = {}) =>
    findings.push({ rule, selector: el ? cssPath(el) : null, element: el ? describe(el) : null, rect: el ? rectOf(el) : null, detail });
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);

  const all = [...document.body.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'path'].includes(el.tagName));

  // 1. Horizontal scrolling / elements wider than the screen
  const docW = document.documentElement.scrollWidth;
  if (docW > vw + 1) {
    add('horizontal-scroll', null, { pageWidth: docW, viewportWidth: vw });
    let n = 0;
    for (const el of all) {
      if (n >= 8) break;
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || !isVisible(el)) continue;
      const p = el.parentElement;
      if (p && p !== document.body && p.getBoundingClientRect().right > vw + 1) continue; // report root offender only
      add('element-overflows-viewport', el, { right: Math.round(r.right), viewportWidth: vw, overflowPx: Math.round(r.right - vw) });
      n++;
    }
  }

  // 2. Missing viewport meta (critical on phones)
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (isMobile && !viewportMeta) add('missing-viewport-meta', null);

  // 3. Tap targets too small (mobile / tablet)
  if (isMobile) {
    let n = 0;
    const interactive = document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[onclick]');
    for (const el of interactive) {
      if (n >= 15) break;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= minTapTargetPx && r.height >= minTapTargetPx) continue;
      // WCAG exception: links inline within a sentence
      if (el.tagName === 'A' && el.parentElement && /^(P|LI|SPAN|TD|LABEL)$/.test(el.parentElement.tagName) && el.parentElement.innerText.trim().length > el.innerText.trim().length + 15) continue;
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.labels && el.labels.length) continue; }
      add('small-tap-target', el, { width: Math.round(r.width), height: Math.round(r.height), min: minTapTargetPx });
      n++;
    }
  }

  // 4. Text too small / text clipped
  {
    let small = 0;
    let clipped = 0;
    for (const el of all) {
      if (small >= 10 && clipped >= 10) break;
      if (!hasOwnText(el) || !isVisible(el)) continue;
      const s = getComputedStyle(el);
      const fs = parseFloat(s.fontSize);
      if (small < 10 && fs < minFontPx) { add('small-text', el, { fontSize: fs, min: minFontPx }); small++; }
      if (clipped < 10 && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
        const hiddenX = /(hidden|clip)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2;
        const hiddenY = /(hidden|clip)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4;
        const intentional = s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '' && s.webkitLineClamp !== undefined;
        if ((hiddenX || hiddenY) && !intentional && el.clientWidth > 0) {
          add('clipped-text', el, { visibleW: el.clientWidth, contentW: el.scrollWidth, visibleH: el.clientHeight, contentH: el.scrollHeight });
          clipped++;
        }
      }
    }
  }

  // 5. Overlapping clickable elements
  {
    const items = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button]')]
      .filter(isVisible).slice(0, 400).map((el) => ({ el, r: el.getBoundingClientRect() }));
    let n = 0;
    for (let i = 0; i < items.length && n < 10; i++) {
      for (let j = i + 1; j < items.length && n < 10; j++) {
        const a = items[i], b = items[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ix = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
        const iy = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
        const minArea = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if (minArea > 0 && (ix * iy) / minArea > 0.3) {
          add('overlapping-elements', a.el, { other: describe(b.el), otherSelector: cssPath(b.el), overlapPct: Math.round(((ix * iy) / minArea) * 100) });
          n++;
        }
      }
    }
  }

  // 6. Images: broken, distorted, oversized
  {
    const dpr = window.devicePixelRatio || 1;
    let broken = 0, distorted = 0, oversized = 0;
    for (const img of document.images) {
      const src = img.currentSrc || img.src;
      if (!src) continue;
      if (img.complete && img.naturalWidth === 0) {
        if (broken++ < 10) add('broken-image', img, { src });
        continue;
      }
      if (!img.naturalWidth || !isVisible(img)) continue;
      const r = img.getBoundingClientRect();
      const fit = getComputedStyle(img).objectFit;
      if (r.width > 20 && r.height > 20 && fit === 'fill') {
        const ratioDiff = Math.abs((r.width / r.height) / (img.naturalWidth / img.naturalHeight) - 1);
        if (ratioDiff > 0.08 && distorted++ < 8) add('distorted-image', img, { src, rendered: `${Math.round(r.width)}x${Math.round(r.height)}`, natural: `${img.naturalWidth}x${img.naturalHeight}`, stretchPct: Math.round(ratioDiff * 100) });
      }
      if (img.naturalWidth > 800 && img.naturalWidth > r.width * dpr * 2.5 && oversized++ < 8) {
        add('oversized-image', img, { src, rendered: `${Math.round(r.width)}px`, natural: `${img.naturalWidth}px` });
      }
    }
  }

  // 7. SEO & document basics
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() || null;
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(isVisible).map((h) => Number(h.tagName[1]));
  let headingSkip = null;
  for (let i = 1; i < headings.length; i++) if (headings[i] > headings[i - 1] + 1) { headingSkip = `h${headings[i - 1]} -> h${headings[i]}`; break; }
  const seo = {
    title: document.title?.trim() || null,
    description: meta('meta[name="description"]'),
    h1Count: [...document.querySelectorAll('h1')].filter(isVisible).length,
    lang: document.documentElement.getAttribute('lang'),
    viewport: viewportMeta?.getAttribute('content') || null,
    canonical: document.querySelector('link[rel="canonical"]')?.href || null,
    ogTitle: meta('meta[property="og:title"]'),
    ogImage: meta('meta[property="og:image"]'),
    robots: meta('meta[name="robots"]'),
    favicon: !!document.querySelector('link[rel~="icon"]'),
    headingSkip,
  };

  // 8. Links on the page (for crawling + broken link checks)
  const links = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    let href;
    try { href = new URL(a.getAttribute('href'), location.href); } catch { continue; }
    if (!/^https?:$/.test(href.protocol)) continue;
    href.hash = '';
    const h = href.toString();
    if (seen.has(h)) continue;
    seen.add(h);
    links.push({ href: h, selector: cssPath(a), element: describe(a), rect: isVisible(a) ? rectOf(a) : null });
  }

  return {
    findings,
    seo,
    links,
    page: { width: docW, height: document.documentElement.scrollHeight, viewportWidth: vw, isHttps: location.protocol === 'https:' },
  };
}

/** Get page-coordinate rects for a list of CSS selectors (used for axe results). */
export function rectsFor(selectors) {
  return selectors.map((sel) => {
    try {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) return null;
      return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    } catch { return null; }
  });
}

/** Draw numbered boxes over problem areas (removed after the screenshot). */
export function drawOverlay(marks) {
  const colors = { critical: '#d7263d', high: '#f46036', medium: '#e2a400', low: '#2e86de' };
  const root = document.createElement('div');
  root.id = '__qa_overlay__';
  root.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  for (const m of marks) {
    const c = colors[m.severity] || '#d7263d';
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:${m.rect.x - 3}px;top:${m.rect.y - 3}px;width:${Math.max(m.rect.w, 6) + 6}px;height:${Math.max(m.rect.h, 6) + 6}px;border:3px solid ${c};border-radius:4px;box-shadow:0 0 0 2px rgba(255,255,255,.85);box-sizing:border-box;`;
    const tag = document.createElement('div');
    tag.textContent = String(m.n);
    tag.style.cssText = `position:absolute;left:${Math.max(0, m.rect.x - 14)}px;top:${Math.max(0, m.rect.y - 14)}px;min-width:24px;height:24px;padding:0 5px;border-radius:12px;background:${c};color:#fff;font:bold 13px/24px Arial,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.4);box-sizing:border-box;`;
    root.appendChild(box);
    root.appendChild(tag);
  }
  document.body.appendChild(root);
}

export function removeOverlay() {
  document.getElementById('__qa_overlay__')?.remove();
}
