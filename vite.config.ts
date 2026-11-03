import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export default defineConfig({
 plugins: [react(), {
  name: 'laundry-offline-cache',
  closeBundle() {
   const assets = readdirSync('dist/assets').map(name => `/assets/${name}`);
   const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);
   const source = readFileSync('public/sw.js', 'utf8').replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(assets)};`).replace('laundry-lounge-v1', `laundry-lounge-${version}`);
   writeFileSync('dist/sw.js', source);
  },
 }],
 server: { host: '0.0.0.0', port: 5173 },
});
