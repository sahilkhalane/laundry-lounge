import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig({
 ...config,
 testMatch: 'offline.spec.ts',
 use: { ...config.use, baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'allow' },
 webServer: { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 30_000 },
});
