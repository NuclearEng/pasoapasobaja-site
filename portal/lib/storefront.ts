// Round 8 storefront copy and the App Store badge.
// Drop-in for the portal worker. The Next.js pages stay as they are; this
// rewrites the HTML and the React flight payload on the way out, so the
// rendered page and hydration agree.
//
// App Store badge (app id 6825930468):
//   APP_STORE_LIVE === null  → detect the live listing (iTunes Lookup, US or MX).
//   APP_STORE_LIVE === true  → force the live Download badge.
//   APP_STORE_LIVE === false → force "Coming soon".
// A worker variable APP_STORE_LIVE of "1" or "0" overrides the constant,
// so the badge can be flipped without another code change.

export const APP_STORE_ID = "6825930468";

/** Single switch. Leave null to follow the live listing. */
export const APP_STORE_LIVE: boolean | null = null;

const LOOKUP_TTL_MS = 30 * 60 * 1000;
const LOOKUP_ERROR_TTL_MS = 5 * 60 * 1000;
const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

type LookupCache = { at: number; live: boolean; ttl: number };
let lookupCache: LookupCache | null = null;

export type StorefrontEnv = { APP_STORE_LIVE?: string };

/** True when the badge should link to the App Store. */
export async function appStoreIsLive(env: StorefrontEnv, lookup: typeof fetch = fetch): Promise<boolean> {
  const flag = env.APP_STORE_LIVE?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "live") return true;
  if (flag === "0" || flag === "false" || flag === "soon") return false;
  if (APP_STORE_LIVE !== null) return APP_STORE_LIVE;
  return detectListing(lookup);
}

async function detectListing(lookup: typeof fetch): Promise<boolean> {
  const now = Date.now();
  if (lookupCache && now - lookupCache.at < lookupCache.ttl) return lookupCache.live;
  try {
    const checks = await Promise.all(["us", "mx"].map((country) => countryHasListing(lookup, country)));
    const live = checks.some(Boolean);
    lookupCache = { at: now, live, ttl: LOOKUP_TTL_MS };
    return live;
  } catch {
    lookupCache = { at: now, live: false, ttl: LOOKUP_ERROR_TTL_MS };
    return false;
  }
}

async function countryHasListing(lookup: typeof fetch, country: string): Promise<boolean> {
  const url = `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=${country}`;
  const res = await lookup(url, { cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit);
  if (!res.ok) throw new Error(`lookup_${res.status}`);
  const data = (await res.json()) as { resultCount?: number };
  return Number(data.resultCount) > 0;
}

/** Test hook. Production never calls this. */
export function resetListingCache(): void {
  lookupCache = null;
}

const COPY: Array<[string, string]> = [
  ["Buy property in Baja, one step at a time.", "Buy, build, and own property in Baja, one step at a time."],
  ["Paso a Paso Baja: buy property in Baja California Sur", "Paso a Paso Baja: buy, build, and own property in Baja California Sur"],
  ["Compre propiedad en Baja, paso a paso.", "Compre, construya y sea dueño de una propiedad en Baja, paso a paso."],
  ["Paso a Paso Baja: compre propiedad en Baja California Sur", "Paso a Paso Baja: compre, construya y sea dueño en Baja California Sur"],
  [
    "We get an anonymous CloudKit user ID only: no name, email or password.",
    "We only get an anonymous ID from Apple: no name, email or password.",
  ],
  [
    "Solo recibimos un ID anónimo de CloudKit: sin nombre, correo ni contraseña.",
    "Solo recibimos un identificador anónimo de Apple: sin nombre, sin correo y sin contraseña.",
  ],
];

/** Swap a whole label, not a prefix of "Sign in with…" / "Iniciar sesión con…". */
function replaceLabel(body: string, from: string, to: string): string {
  let out = body;
  for (const tail of ["\\\"", "\"", " ·", "<"]) out = out.split(from + tail).join(to + tail);
  return out;
}

const SOON_EN = [
  ["On iPhone. Scan the code on a computer.", "On iPhone and iPad. Coming soon to the App Store."],
  ["QR code to download the Paso a Paso Baja app on the App Store", "Paso a Paso Baja, coming soon to the App Store"],
  ["Scan to open the App Store.", "Coming soon to the App Store."],
] as const;

const SOON_ES = [
  ["Para iPhone. En una computadora, escanee el código.", "Para iPhone y iPad. Próximamente en el App Store."],
  ["Código QR para descargar la app Paso a Paso Baja en el App Store", "Paso a Paso Baja, próximamente en el App Store"],
  ["Escanee para abrir el App Store.", "Próximamente en el App Store."],
  ["Descárguela en el", "Próximamente"],
] as const;

function soonBadgeHtml(inner: string): string {
  const es = inner.includes("Descárguela") || inner.includes("Próximamente");
  const small = es ? "Próximamente" : "Coming soon";
  const strong = es ? "en el App Store" : "to the App Store";
  const label = es ? "Próximamente en el App Store" : "Coming soon to the App Store";
  const next = inner
    .replace(/<small>[^<]*<\/small>/, `<small>${small}</small>`)
    .replace(/<strong>[^<]*<\/strong>/, `<strong>${strong}</strong>`);
  return `<span class="appstore appstore-soon" role="note" aria-label="${label}">${next}</span>`;
}

/** Coming-soon badge, headlines, pro sign-in, and plain-language Apple sign-in. */
export function rewriteStorefrontText(body: string, live: boolean): string {
  let out = body;
  for (const [from, to] of COPY) out = out.split(from).join(to);
  out = replaceLabel(out, "Sign in", "For pros: sign in");
  out = replaceLabel(out, "Iniciar sesión", "Para profesionales: iniciar sesión");
  if (live) return out;

  out = out.replace(
    /<a class="appstore" href="https:\/\/apps\.apple\.com\/app\/id6825930468[^"]*" rel="noopener">([\s\S]*?)<\/a>/g,
    (_m, inner: string) => soonBadgeHtml(inner),
  );

  const soonLabel = out.includes("Descárguela en el") || out.includes("Próximamente")
    ? "Próximamente en el App Store"
    : "Coming soon to the App Store";
  const spanProps = `{"className":"appstore appstore-soon","role":"note","aria-label":${JSON.stringify(soonLabel)}`;
  out = out.replace(
    /\["\$","a",null,\{"className":"appstore","href":"https:\/\/apps\.apple\.com\/app\/id6825930468[^"]*","rel":"noopener"/g,
    `["$","span",null,${spanProps}`,
  );
  const escapedProps = spanProps.replace(/"/g, '\\"');
  out = out.replace(
    /\[\\"\$\\",\\"a\\",null,\{\\"className\\":\\"appstore\\",\\"href\\":\\"https:\/\/apps\.apple\.com\/app\/id6825930468[^"\\]*\\",\\"rel\\":\\"noopener\\"/g,
    `[\\"$\\",\\"span\\",null,${escapedProps}`,
  );

  out = out.split('{"children":"Download on the"}],["$","strong",null,{"children":"App Store"}]').join(
    '{"children":"Coming soon"}],["$","strong",null,{"children":"to the App Store"}]',
  );
  out = out.split('{\\"children\\":\\"Download on the\\"}],[\\"$\\",\\"strong\\",null,{\\"children\\":\\"App Store\\"}]').join(
    '{\\"children\\":\\"Coming soon\\"}],[\\"$\\",\\"strong\\",null,{\\"children\\":\\"to the App Store\\"}]',
  );
  out = out.split('{"children":"Descárguela en el"}],["$","strong",null,{"children":"App Store"}]').join(
    '{"children":"Próximamente"}],["$","strong",null,{"children":"en el App Store"}]',
  );
  out = out.split('{\\"children\\":\\"Descárguela en el\\"}],[\\"$\\",\\"strong\\",null,{\\"children\\":\\"App Store\\"}]').join(
    '{\\"children\\":\\"Próximamente\\"}],[\\"$\\",\\"strong\\",null,{\\"children\\":\\"en el App Store\\"}]',
  );
  out = out.split("Download on the").join("Coming soon");
  for (const [from, to] of SOON_EN) out = out.split(from).join(to);
  for (const [from, to] of SOON_ES) out = out.split(from).join(to);
  // Safari's smart banner opens the same unpublished listing.
  out = out.split("apple-itunes-app").join("x-app-store-soon");
  return out;
}

export async function rewriteStorefront(res: Response, live: boolean): Promise<Response> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/html") && !type.includes("text/x-component")) return res;
  const body = await res.text();
  const next = rewriteStorefrontText(body, live);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(next, { status: res.status, statusText: res.statusText, headers });
}

/** Placeholder instead of a QR that would open a 404 App Store page. */
export function comingSoonQr(req: Request): Response {
  const es = /(?:^|;\s*)lang=es(?:;|$)/.test(req.headers.get("cookie") ?? "");
  const line1 = es ? "Próximamente" : "Coming soon";
  const line2 = "App Store";
  const label = es ? "Próximamente en el App Store" : "Coming soon to the App Store";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${label}">
  <title>${label}</title>
  <rect width="128" height="128" rx="12" fill="#ffffff"/>
  <text x="64" y="58" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="15" fill="#1F2A30">${line1}</text>
  <text x="64" y="80" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="15" fill="#1F2A30">${line2}</text>
</svg>`;
  return new Response(req.method === "HEAD" ? null : svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-App-Store-State": "soon",
    },
  });
}

export { APP_STORE_URL };
