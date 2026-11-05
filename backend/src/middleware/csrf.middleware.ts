import type { RequestHandler } from 'express';

/** Custom-header CSRF defense: browsers must preflight this header; CORS grants only trusted origins.
 * Checking the header also rejects simple HTML forms and multipart form attacks without an Origin.
 * API clients must send the same header. No GET endpoint may mutate business data.
 */
export function createCsrfProtection(isAllowedOrigin: (origin: string) => boolean): RequestHandler {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
    const origin = req.get('origin');
    if (req.get('x-la-chef-request') !== '1' || (origin && !isAllowedOrigin(origin)) ||
        (!origin && req.get('sec-fetch-site') === 'cross-site')) {
      res.status(403).json({ success: false, message: 'Request origin could not be verified. Please reload the page and try again.', code: 'CSRF_REJECTED' });
      return;
    }
    next();
  };
}
