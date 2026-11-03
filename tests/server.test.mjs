import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createStaticServer } from '../scripts/serve.mjs';

let directory, server, port;
const request = (path, method = 'GET') => new Promise((resolve, reject) => {
  const req = httpRequest({ hostname: '127.0.0.1', port, path, method }, response => {
    let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
  });
  req.on('error', reject); req.end();
});
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'laundry-server-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<h1>Laundry Lounge</h1>');
  await writeFile(join(directory, 'sw.js'), 'self.addEventListener("fetch",()=>{});');
  await writeFile(join(directory, 'manifest.webmanifest'), '{"display":"standalone"}');
  await writeFile(join(directory, 'assets', 'index-Abc123.js'), 'console.log("app");');
  await writeFile(join(directory, 'assets', 'index-Abc123.css'), 'body{color:teal}');
  await writeFile(join(directory, 'assets', 'font-Abc123.woff2'), 'font');
  await writeFile(join(directory, 'icon.svg'), '<svg/>');
  await writeFile(join(directory, '.env'), 'SECRET=should-not-be-served');
  await mkdir(join(directory, 'src'));
  await writeFile(join(directory, 'src', 'private.js'), 'private source');
  await writeFile(join(directory, 'assets', 'index-Abc123.js.map'), 'source map');
  server = createStaticServer(directory);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(async () => {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await rm(directory, { recursive: true, force: true });
});
test('serves the entry point and route fallback with refreshable HTML', async () => {
  for (const path of ['/', '/orders/1048', '/orders?status=ready']) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /^text\/html/);
    assert.equal(response.headers['cache-control'], 'public, max-age=0, must-revalidate');
    assert.equal(response.body, '<h1>Laundry Lounge</h1>');
  }
});
test('serves actual built assets with correct MIME and fingerprint caching', async () => {
  for (const [path, mime] of [['/assets/index-Abc123.js', 'application/javascript'], ['/assets/index-Abc123.css', 'text/css'], ['/assets/font-Abc123.woff2', 'font/woff2'], ['/icon.svg', 'image/svg+xml']]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.ok(response.headers['content-type'].startsWith(mime));
    if (path.startsWith('/assets/')) assert.match(response.headers['cache-control'], /max-age=31536000, immutable/);
  }
});
test('service worker and manifest remain refreshable rather than immutable', async () => {
  const worker = await request('/sw.js');
  assert.equal(worker.status, 200);
  assert.equal(worker.headers['service-worker-allowed'], '/');
  assert.match(worker.headers['cache-control'], /no-cache, no-store/);
  const manifest = await request('/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers['content-type'], /^application\/manifest\+json/);
  assert.doesNotMatch(manifest.headers['cache-control'], /immutable/);
});
test('HEAD returns the same headers with no response body', async () => {
  const response = await request('/assets/index-Abc123.js', 'HEAD');
  assert.equal(response.status, 200);
  assert.equal(response.body, '');
  assert.equal(Number(response.headers['content-length']), Buffer.byteLength('console.log("app");'));
});
test('missing assets return 404 instead of a successful HTML document', async () => {
  for (const path of ['/assets/missing.js', '/missing.css', '/assets/missing', '/package.json']) {
    const response = await request(path);
    assert.equal(response.status, 404);
    assert.equal(response.body, 'Not found');
    assert.match(response.headers['content-type'], /^text\/plain/);
  }
});
test('private paths, source maps, malformed paths and traversal do not expose data', async () => {
  for (const path of ['/.env', '/%2eenv', '/src/private.js', '/scripts/server.js', '/assets/index-Abc123.js.map', '/../package.json', '/%2e%2e/package.json', '/assets/%2e%2e/%2e%2e/package.json']) {
    const response = await request(path);
    assert.equal(response.status, 403, path);
    assert.doesNotMatch(response.body, /SECRET|private source/);
  }
  assert.equal((await request('/%zz')).status, 400);
  assert.equal((await request('/assets/%00file.js')).status, 400);
});
test('links outside dist cannot expose other files', async () => {
  const outside = join(directory, '..', `laundry-outside-${process.pid}.js`);
  await writeFile(outside, 'private outside content');
  try {
    await symlink(outside, join(directory, 'assets', 'external.js'));
    const response = await request('/assets/external.js');
    assert.equal(response.status, 403);
    assert.doesNotMatch(response.body, /private outside/);
  } finally { await rm(outside, { force: true }); }
});
test('rejects methods that could alter the static deployment', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await request('/', method);
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, HEAD');
  }
});
