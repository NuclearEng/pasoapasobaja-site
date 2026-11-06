# Paso a Paso Baja: public site

Static support, privacy, and terms pages (EN/ES) served by GitHub Pages. No build step. Also served at https://pasoapasobaja.com/privacy, /terms and /support (Cloudflare), copied by `portal/scripts/sync-legal.sh` in the app repo.

## Portal edge (Round 8)

pasoapasobaja.com itself is the `paso-portal` Worker. `portal/worker.ts`, `portal/lib/edge.ts`, and `portal/lib/storefront.ts` are the source for that worker. Copy them into the portal app and deploy with wrangler when you are ready. This repository does not deploy the worker.

The App Store badge (app id `6825930468`) stays a non-link, "Coming soon to the App Store" / "Próximamente en el App Store", until the listing is live. It switches on its own when iTunes Lookup returns the app for the US or Mexico store (cached about 30 minutes). To force it without waiting: set the worker variable `APP_STORE_LIVE` to `1` (live badge) or `0` (keep Coming soon). That variable overrides the constant `APP_STORE_LIVE` in `portal/lib/storefront.ts`. Leave the constant `null` so detection stays on.

`node --experimental-strip-types --test portal/lib/round8.test.ts`
