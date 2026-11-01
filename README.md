# Aling Suki

Mobile-first PWA for sari-sari stores: credit (utang) ledger, quick sales, items and stock, and a daily summary.
Angular + Bootstrap. Data is stored on the device (IndexedDB) and the app works offline. Live at https://alingsuki.bitezy.online.

## Develop

```bash
npm install
npm start          # http://localhost:4200 (service worker is off in dev)
npm run build      # production build into dist/app/browser, with the service worker
```

## Deploy

Hosted as a Cloudflare Worker serving static files (`wrangler.jsonc`, headers in `public/_headers`).

- **Automatic:** every push to `main` that builds cleanly is deployed by GitHub Actions (`.github/workflows/ci-cd.yml`),
  then the workflow checks that the live site matches the build.
- **By hand from this Mac:** `npm run deploy` (needs `wrangler login`).
- **Roll back:** GitHub > Actions > CI/CD > Run workflow, paste a version ID from `npx wrangler versions list`.

Pushes to `dev` and pull requests only build; they never deploy.

### One-time GitHub setup

1. Cloudflare dashboard > My Profile > API Tokens > Create Token > use the **Edit Cloudflare Workers** template
   (scope it to the account and the `bitezy.online` zone).
2. GitHub repo > Settings > Secrets and variables > Actions > New repository secret:
   - `CLOUDFLARE_API_TOKEN`: the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID (Workers & Pages > Overview, right side)
3. Optional: Settings > Branches > protect `main` and require the **Build** check before merging.
