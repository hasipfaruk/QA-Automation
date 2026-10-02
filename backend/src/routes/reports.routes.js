import express from 'express';
import { HttpError } from '../lib/errors.js';

/**
 * Scan reports, served from unguessable capability links. The sandbox policy gives reports an
 * opaque origin so their scripts can never read the application session.
 */
export function reportRoutes({ config, scans }) {
  const router = express.Router();
  const policy = `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads; default-src 'none'; img-src 'self' ${config.appUrl} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'`;

  router.get('/:token', (req, res) => res.redirect(`/r/${encodeURIComponent(req.params.token)}/report.html`));

  router.get('/:token/{*file}', (req, res, next) => {
    const scan = scans.byReportToken(req.params.token);
    if (!scan || scan.status !== 'done') throw new HttpError(404, 'This report does not exist or has expired.');
    const file = [].concat(req.params.file).join('/');
    res.set({
      'Content-Security-Policy': policy,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'private, max-age=300',
    });
    if (file.endsWith('.md')) res.type('text/markdown; charset=utf-8');
    res.sendFile(file, { root: scans.reportDir(scan), dotfiles: 'deny' }, (err) => {
      if (err) next(err.status === 404 || err.code === 'ENOENT' ? new HttpError(404, 'File not found.') : err);
    });
  });

  return router;
}
