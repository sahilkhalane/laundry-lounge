import { readFileSync, writeFileSync, readdirSync, statSync, lstatSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const output = resolve(process.argv[2] || join(root, '..', 'laundry-lounge-release.zip'));
assert(relative(dist, output).startsWith('..'), 'Write the release archive outside dist.');
assert(existsSync(join(dist, 'index.html')), 'Run npm run build first.');
// Netlify Drop does not read repository-level netlify.toml. Include equivalent
// static-host configuration in the published directory as well.
writeFileSync(join(dist, '_redirects'), '/* /index.html 200\n');
writeFileSync(join(dist, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/sw.js
  Cache-Control: no-cache, no-store, must-revalidate
  Service-Worker-Allowed: /
`);
function verifyAsset(url) {
  if (!url || /^(data:|https?:)/.test(url)) return;
  const path = resolve(dist, `.${url.startsWith('/') ? url : `/${url}`}`);
  assert(!relative(dist, path).startsWith('..'), `Asset escapes dist: ${url}`);
  assert(existsSync(path) && statSync(path).isFile(), `Missing asset: ${url}`);
}
const index = readFileSync(join(dist, 'index.html'), 'utf8');
for (const match of index.matchAll(/(?:src|href)="([^"]+)"/g)) verifyAsset(match[1]);
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.display, 'standalone');
manifest.icons.forEach(icon => verifyAsset(icon.src));
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const precache = /const PRECACHE = (\[[^\n]+\]);/.exec(sw);
assert(precache, 'Production service worker has no asset precache.');
JSON.parse(precache[1]).forEach(verifyAsset);
for (const name of readdirSync(join(dist, 'assets')).filter(name => name.endsWith('.css'))) {
  const css = readFileSync(join(dist, 'assets', name), 'utf8');
  for (const match of css.matchAll(/url\(["']?([^\s"')]+)["']?\)/g)) {
    const url = match[1];
    if (url.startsWith('data:')) continue;
    verifyAsset(url.startsWith('/') ? url : `/assets/${url}`);
  }
}
const allowedRoot = new Set(['index.html', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png', '_headers', '_redirects']);
function checkFiles(directory) {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name); const info = lstatSync(file);
    assert(!info.isSymbolicLink(), 'Release may not contain symlinks.');
    assert(!name.startsWith('.') && !['node_modules', 'src', 'tests', 'package.json'].includes(name), `Unexpected build entry: ${name}`);
    if (info.isDirectory()) {
      assert(directory !== dist || name === 'assets', `Unexpected build directory: ${name}`);
      checkFiles(file);
    } else {
      assert(info.isFile(), `Unexpected build object: ${name}`);
      assert(directory === dist ? allowedRoot.has(name) : /\.(js|css|woff2?|png|jpe?g|svg|webp|avif|ico)$/i.test(name), `Unexpected release file: ${name}`);
    }
  }
}
checkFiles(dist);
const result = spawnSync('python3', ['-c', `
import os, sys, zipfile
root, output = sys.argv[1:]
files=[]
for base, dirs, names in os.walk(root):
    dirs.sort()
    for name in sorted(names):
        path=os.path.join(base,name)
        files.append((path,os.path.relpath(path,root)))
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for path,name in files: archive.write(path,name)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {name for _,name in files}
    assert 'index.html' in archive.namelist()
    assert all(not name.startswith(('../','/')) for name in archive.namelist())
print(f'Verified {len(files)} production files; archive: {output}; bytes: {os.path.getsize(output)}')
`, dist, output], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(`Release packaging failed: ${result.stderr || result.error?.message || 'unknown error'}`);
console.log(result.stdout.trim());
