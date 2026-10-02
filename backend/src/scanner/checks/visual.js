import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { makeIssue } from '../rules.js';

function crop(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, 0, 0, w, h, 0, 0);
  return out;
}

/**
 * Compare a full-page PNG buffer against the stored baseline.
 * Returns { issue, diffFile } or null when unchanged.
 */
export function compareWithBaseline({ pngBuffer, baselineDir, key, outDir, threshold, updateBaseline, ctx }) {
  fs.mkdirSync(baselineDir, { recursive: true });
  const basePath = path.join(baselineDir, `${key}.png`);

  if (updateBaseline || !fs.existsSync(basePath)) {
    const existed = fs.existsSync(basePath);
    fs.writeFileSync(basePath, pngBuffer);
    return existed ? null : { issue: makeIssue('new-baseline', ctx, {}) };
  }

  const base = PNG.sync.read(fs.readFileSync(basePath));
  const cur = PNG.sync.read(pngBuffer);
  const w = Math.min(base.width, cur.width);
  const h = Math.min(base.height, cur.height);
  const a = crop(base, w, h);
  const b = crop(cur, w, h);
  const diff = new PNG({ width: w, height: h });
  const changed = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.12, includeAA: false, alpha: 0.25 });
  const sizeChanged = base.width !== cur.width || Math.abs(base.height - cur.height) > 2;
  const diffPct = Math.round((changed / (w * h)) * 10000) / 100;

  if (diffPct < threshold && !sizeChanged) return null;

  const diffFile = path.join(outDir, `${key}-diff.png`);
  fs.writeFileSync(diffFile, PNG.sync.write(diff));
  return {
    diffFile,
    issue: makeIssue('visual-change', ctx, {
      diffPct, sizeChanged,
      baseSize: `${base.width}x${base.height}`,
      newSize: `${cur.width}x${cur.height}`,
    }),
  };
}
