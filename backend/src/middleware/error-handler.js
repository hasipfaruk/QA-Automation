import { HttpError } from '../lib/errors.js';

export function notFound() {
  return () => { throw new HttpError(404, 'The page you are looking for does not exist.'); };
}

/**
 * Final error handler. API and webhook callers get JSON; browsers get the 404/error page.
 * Details of unexpected errors are logged, never sent to the client.
 */
export function errorHandler({ publicDir }) {
  return (err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    const badJson = err.type === 'entity.parse.failed';
    if (badJson) status = 400;
    if (status >= 500) console.error(err);
    if (res.headersSent) return next(err);

    const message = status >= 500
      ? 'An unexpected error happened. Please try again.'
      : badJson ? 'Request body is not valid JSON.' : err.message;
    const wantsJson = req.path.startsWith('/api/') || req.path.startsWith('/stripe/') || req.accepts(['html', 'json']) === 'json';
    if (wantsJson) return res.status(status).json({ error: message });
    return res.status(status).sendFile('404.html', { root: publicDir });
  };
}
