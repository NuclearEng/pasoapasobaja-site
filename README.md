# Paso a Paso Baja: old public site

The website now lives at https://pasoapasobaja.com (Cloudflare, app repo `portal/`). On GitHub Pages this repo only keeps:

- `index.html`, `privacy.html`, `terms.html`, `support.html`: redirect pages to pasoapasobaja.com (meta refresh, canonical, visible link; `#es` goes to the Spanish version).
- `content/v1/`: the signed guide content the iPhone app downloads for updates. Don't move or delete it.

No build step. The privacy, terms and support text is maintained in the app repo at `portal/public/{privacy,terms,support}.html`.
