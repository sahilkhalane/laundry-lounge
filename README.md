# Laundry Lounge

A custom application for Laundry Lounge. The **Android mobile app is in [`mobile/`](mobile/README.md)**. It uses native React Native screens, Android camera scanning, SQLite storage, and Android printing/sharing. Build and install its standalone APK using the mobile instructions.

The repository also retains the earlier web workspace for optional browser-based use. Deploying that workspace to Railway or Netlify does not create or install the Android app. The two versions currently keep separate device-local records.

## Optional web workspace

Requires Node.js 22+ and npm. This environment was verified with Node 24.

```sh
npm ci
npm run dev
```

The development server listens on port 5173. For a production build:

```sh
npm run build
npm run preview -- --port 4173
```

Deploy `dist/` to an HTTPS static host. HTTPS is required for phone installation, the service worker, and camera permission; localhost is accepted during development. Install from Chrome's menu on Android or Safari's Share → Add to Home Screen on iPhone. A first online visit caches the production app for offline use. Development mode does not register a service worker.

## Daily workflow

1. **New order:** choose/add a customer, add garments and services, set collection date, discount, and initial payment. Creating the order generates its bill and a distinct QR tag for each garment.
2. **Print:** open the order, choose Print bill or Print tags, and use the operating system's print dialog. Bills can also be saved as PDF. Tags include QR data, garment, service, customer, due date and care notes. Configure paper/label dimensions through the printer dialog.
3. **Track garments:** Scan tag starts the camera on browsers supporting BarcodeDetector. On other phones, enter a printed tag number or paste the scanned code. An external keyboard-style scanner can enter this code too. Update individual garments or update an entire order. An order progresses only when all its garments reach the next stage.
4. **Collect payments:** record full/partial payments in the order. Payment history uses the actual payment date, including later payments on earlier orders. No payment gateway or tax calculation is included.
5. **Customer updates:** WhatsApp opens a prefilled message for review and sending. This does not send automatically or claim an API connection.
6. **Expenses & reports:** record operating expenses; filter reports by dates and export order CSVs. Service totals are shown before order discounts. Cash after expenses is an operational figure, not a tax/profit calculation.

## Your business data

The initial workspace includes clearly marked fictional sample data. In Settings, set your business phone/address and upload the original Laundry Lounge logo (PNG/JPEG/WebP under 2 MB). The logo is used in the sidebar, printed bills and garment tags. The Windows path supplied in chat is not readable by this cloud environment; the included vector mark is a temporary interpretation of the brand, not the original artwork.

Use **Settings → Start fresh → Clear workspace data** to remove the sample records before real use. This explicitly confirms removing *all* customers/orders/expenses and preserves business settings. The sample banner disappears when the sample customer records are removed.

Data is stored in this browser's localStorage on this device. Export JSON backups regularly in Settings. Import validates references, monetary values, payment histories and tag statuses before replacing any records. Corrupt saved data is preserved for recovery; it is never silently replaced with samples. Storage failures keep forms open with an explanation. Clearing browser storage removes records; the offline cache does not back up business data. There is no cloud sync, account login, or server database in this version. Use on one trusted device unless manually transferring a backup.

## Integrations and limits

- The built-in camera path needs HTTPS, permission, and browser BarcodeDetector support. Manual tag input is always available. Camera/hardware printer behavior must be checked on the business's actual phones and printers.
- QR tags are actual encoded PNG images with error correction and a four-module quiet zone; use suitable water/heat-resistant garment labels. Page tags are laid out in two columns; this is browser printing, not a specific thermal/Bluetooth driver.
- WhatsApp uses customer-addressed `wa.me` drafts. Automated background sending requires a WhatsApp Business API provider, account setup, server-side credentials/webhooks, and messaging templates. No credentials are exposed in this client.
- This is a PWA, not an APK or App Store binary. Native distribution, central storage/staff authentication, automatic WhatsApp sending, tax/legal invoice settings, and dedicated printer integrations are follow-up production integrations.

## Validation

```sh
npm test          # Domain arithmetic, tag aggregation, persistence, validation, actual-date payment totals
npm run build    # Strict TypeScript + production assets + complete offline asset cache
npm run test:offline # Production offline reload, order creation/persistence and QR generation
npm run test:e2e # Chromium: order, QR printing, payments/reload, scanning, customers, expenses, backup, mobile
```

Browser tests use system Chromium when available, or a Playwright-managed Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to choose a browser. Otherwise install it with `npx playwright install chromium`. The tests launch their own Vite server unless port 5173 already has one. `npm run test:server` checks the production HTTP server used by Railway.

The environment is already isolated: use this checkout; do not create a Git worktree unless explicitly requested.

## Public hosting

Netlify deployment configuration is in `netlify.toml`. See [DEPLOYMENT.md](DEPLOYMENT.md) for the static-release packaging and deployment steps. Railway deployment is configured by `railway.json`: build with `npm run build`, start with `npm start`, then generate a public domain in Railway. See DEPLOYMENT.md for the complete steps. The production server uses the platform PORT variable and serves only the built dist directory.

Hosting access is not connected yet. The cloud draft now declares `NETLIFY_AUTH_TOKEN` for `api.netlify.com`, and allows that API plus deployed `*.netlify.app` URLs. Enter the token securely in environment settings (never in chat or source), review/save the draft, and publish/apply the environment configuration before requesting the authenticated upload. This configuration does not create a site or establish a public URL by itself.
