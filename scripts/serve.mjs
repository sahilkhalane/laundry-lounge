import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};
const PRIVATE_SEGMENTS = new Set(['src', 'tests', 'scripts', 'node_modules']);
const IMMUTABLE_ASSET = /^assets\/.+-[\w-]+\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|avif|ico)$/i;
const inside = (root, file) => {
  const path = relative(root, file);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
};

/** Serve only the compiled app; importing this module never opens a port. */
export function createStaticServer(directory) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const sendError = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return sendError(405, 'Method not allowed');
    }
    let pathname;
    try { pathname = decodeURIComponent((request.url || '/').split(/[?#]/, 1)[0]); }
    catch { return sendError(400, 'Invalid request path'); }
    if (!pathname.startsWith('/') || /[\\\0]/.test(pathname)) return sendError(400, 'Invalid request path');
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some(segment => segment.startsWith('.') || PRIVATE_SEGMENTS.has(segment)) || /\.(?:map|ts|tsx)$/i.test(pathname)) {
      return sendError(403, 'Forbidden');
    }
    let file = resolve(root, `.${pathname}`);
    if (!inside(root, file)) return sendError(403, 'Forbidden');
    try {
      let info;
      try { info = await stat(file); } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
      if (info?.isDirectory() || (!info && !extname(pathname) && !pathname.startsWith('/assets/'))) {
        file = join(root, 'index.html');
        info = await stat(file);
      }
      if (!info?.isFile()) return sendError(404, 'Not found');
      // A link inside dist must not expose files outside the build directory.
      if (!inside(await realpath(root), await realpath(file))) return sendError(403, 'Forbidden');
      const extension = extname(file).toLowerCase();
      if (!MIME[extension]) return sendError(404, 'Not found');
      const name = relative(root, file).split(sep).join('/');
      let cache = 'public, max-age=0, must-revalidate';
      if (IMMUTABLE_ASSET.test(name)) cache = 'public, max-age=31536000, immutable';
      if (name === 'sw.js') {
        cache = 'no-cache, no-store, must-revalidate';
        response.setHeader('Service-Worker-Allowed', '/');
      }
      response.writeHead(200, {
        'Content-Type': MIME[extension],
        'Content-Length': info.size,
        'Cache-Control': cache,
      });
      if (request.method === 'HEAD') return response.end();
      const stream = createReadStream(file);
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (!response.headersSent) sendError(error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Unable to serve request');
      else response.destroy();
    }
  });
  return server;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer from 1 to 65535.');
    process.exitCode = 1;
  } else {
    try {
      if (!(await stat(join(directory, 'index.html'))).isFile()) throw new Error('Missing entry point');
      const server = createStaticServer(directory);
      server.on('error', error => {
        console.error(`Could not start the production server: ${error.code || 'unknown error'}`);
        process.exitCode = 1;
      });
      server.listen(port, '0.0.0.0', () => console.log(`Laundry Lounge is listening on port ${port}.`));
      let stopping = false;
      const shutdown = () => {
        if (stopping) return;
        stopping = true;
        const timeout = setTimeout(() => process.exit(1), 10_000);
        timeout.unref();
        server.close(() => { clearTimeout(timeout); process.exitCode = 0; });
        server.closeIdleConnections();
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    } catch {
      console.error('The production build is missing. Run npm run build before npm start.');
      process.exitCode = 1;
    }
  }
}
