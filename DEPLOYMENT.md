# Deploy Laundry Lounge

The app is ready for root-domain static HTTPS hosting. No site has been created and no public URL exists yet. Netlify is the selected hosting target.

## Build a verified release

```sh
npm ci
npm run package:deploy
```

This builds the production app and creates `../laundry-lounge-release.zip` with the **contents** of `dist/` at the archive root. The package includes the app, QR functionality, fonts, PWA icons and offline service worker, plus Netlify `_headers` and `_redirects`. It excludes source code, environment files, credentials, and browser customer data. Packaging checks HTML/CSS/precache references, manifest icons, file membership and archive integrity.

## Let Codex deploy

No Netlify hosting token is currently configured. A requirement for `NETLIFY_AUTH_TOKEN` and network access to `api.netlify.com` and `*.netlify.app` was saved to the environment draft. Add your Netlify token securely in environment settings, review and save the draft, then publish/apply the environment configuration. Do not paste credentials in chat. Netlify tokens are managed at https://app.netlify.com/user/applications#personal-access-tokens.

Once the credential and network changes are applied, ask Codex to resume deployment. The remaining steps are authenticated site creation (or selecting your existing site), uploading the ZIP to the Netlify deploy API, waiting for the deploy state `ready`, then checking the actual returned HTTPS URL. The app must load and offline caching must work at that URL before deployment is called complete. Publishing this cloud environment alone does not publish a website.

## Manual alternative

1. Download `../laundry-lounge-release.zip` and extract it to a folder.
2. Sign in to Netlify and open https://app.netlify.com/drop.
3. Drag the **extracted build folder**, containing `index.html` directly inside it, into Netlify Drop.
4. Use the HTTPS URL returned by Netlify. You can change the site's name in Netlify after deployment.

Manual uploads do not execute the repository build command or read repository-level `netlify.toml`; the ZIP already contains the equivalent `_headers` and `_redirects`. Git-based hosting uses `netlify.toml` and builds the full source repository.

## After deployment

Open the returned URL on your phone and add it to the home screen. Start with the labelled sample workspace, then set business details, upload the original logo and explicitly clear the samples before entering real business records. Browser-local data does not transfer from the cloud preview or another hostname; export/import a backup if needed.

Hosting does not add a database, staff login, device sync, automatic WhatsApp messages or Bluetooth printer drivers. The existing app's local persistence, message sharing and browser printing remain the supported features.

## Railway deployment

Deploy the complete source repository, not the Netlify static-release ZIP. This repository includes `railway.json` and a production server with no additional dependencies. Node 24 is pinned in `.node-version`.

1. In Railway, create a project and choose **Deploy from GitHub repo**.
2. Select `sahilkhalane/laundry-lounge` and the `main` branch. Keep the service root directory at the repository root (`/`).
3. Railway installs dependencies, builds with `npm run build`, and starts with `npm start`. The included server binds `0.0.0.0` on Railway's `PORT` variable. Do not use the Vite development server in production.
4. Under the service's **Settings → Networking**, generate a public domain. Use the HTTPS URL Railway returns; do not invent one from the project name.

No app secrets or database are required for the current browser-local version. Railway hosting does not add shared records or automatic WhatsApp delivery. Actual Railway deployment depends on your Railway account and GitHub integration access. The `railway.json` configuration alone does not publish the app.

Local production check:

```sh
npm ci
npm run build
npm start
```

The default local port is 3000; set `PORT` to choose another port. Run `npm run test:server` to verify the production server's files, MIME types, cache headers, missing-asset handling and source-file protection.
