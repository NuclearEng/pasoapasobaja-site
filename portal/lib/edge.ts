// Edge rules run in worker.ts before Next.js: host canonicalization and rate limiting.
// Pure functions (no Next.js imports) so they're unit-tested in edge.test.ts.

export type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
export type EdgeEnv = {
  PORTAL_ORIGIN?: string; // canonical public origin, e.g. https://pasoapasobaja.com
  AUTH_ORIGIN?: string; // where Sign in with Apple / CloudKit JS is registered; defaults to PORTAL_ORIGIN
  API_LIMITER?: Limiter;
  FORM_LIMITER?: Limiter;
  /** Google Search Console HTML-file method: the file name Google gives, e.g. "google0123abcd.html". */
  GOOGLE_SITE_VERIFICATION?: string;
  /** Bing Webmaster Tools XML-file method: the code inside the BingSiteAuth.xml Bing gives. */
  BING_SITE_AUTH?: string;
};

const host = (origin: string | undefined) => { try { return origin ? new URL(origin).host : ""; } catch { return ""; } };
const under = (p: string, base: string) => p === base || p.startsWith(base + "/");

/** Signed-in areas. They must run on AUTH_ORIGIN while Apple's Services ID / CloudKit token only allow that origin. */
export const isAuthPath = (p: string) => ["/login", "/dashboard", "/admin", "/onboarding"].some((b) => under(p, b));
/** Never moved off the legacy host: universal links + App Clip (build 10), Stripe/App Store webhooks, CloudKit/SIWA API calls, build assets. */
export const isPinnedPath = (p: string) => p.startsWith("/.well-known/") || under(p, "/p") || under(p, "/api") || p.startsWith("/_next/");

const isLocal = (h: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h);

/** Redirect needed for this request, or null to serve it. */
export function redirectFor(req: Request, env: EdgeEnv): Response | null {
  const url = new URL(req.url);
  const canonical = host(env.PORTAL_ORIGIN);
  if (!canonical || isLocal(url.host)) return null;
  const auth = host(env.AUTH_ORIGIN) || canonical;
  const p = url.pathname;
  const status = req.method === "GET" || req.method === "HEAD" ? 301 : 308;
  const to = (origin: string, code: number) => new Response(null, { status: code, headers: { Location: `${origin.replace(/\/$/, "")}${p}${url.search}`, "Cache-Control": code === 302 ? "no-store" : "public, max-age=3600" } });

  if (url.host === `www.${canonical}`) return to(env.PORTAL_ORIGIN!, status);
  if (url.host === canonical) {
    // Until Apple allows the new origin, send sign-in areas to the origin Apple knows (temporary, not cached).
    if (auth !== canonical && isAuthPath(p)) return to(env.AUTH_ORIGIN!, 302);
    return null;
  }
  // Legacy host (workers.dev).
  if (isPinnedPath(p)) return null;
  if (url.host === auth && isAuthPath(p)) return null;
  // Sign-in areas move with a temporary, uncached 302 (query kept, so Apple's ?ckWebAuthToken= callback still reaches /login
  // on the apex while the CloudKit token's redirect URL points here). Keeps a rollback instant: no browser holds a cached 301.
  if (isAuthPath(p)) return to(env.PORTAL_ORIGIN!, 302);
  return to(env.PORTAL_ORIGIN!, status);
}

/** Webhooks are signed and retried by Stripe / Apple; public image GETs are embedded many times per page. */
const unlimitedApi = (p: string, m: string) =>
  p === "/api/stripe/webhook" || p === "/api/appstore/notifications" || p === "/api/health" ||
  (m === "GET" && ["/api/photo/", "/api/qr/", "/api/badge/", "/api/app-qr", "/api/view/"].some((b) => p.startsWith(b)));

/** Rate-limit /api/* and every form post / server action. Key: client IP (kept only in Cloudflare's in-memory counter, never stored by us). */
export async function rateLimited(req: Request, env: EdgeEnv): Promise<Response | null> {
  const url = new URL(req.url);
  const p = url.pathname, m = req.method;
  const ip = req.headers.get("cf-connecting-ip") ?? "";
  if (!ip) return null;
  let limiter: Limiter | undefined, bucket = "";
  if (p.startsWith("/api/")) { if (unlimitedApi(p, m)) return null; limiter = env.API_LIMITER; bucket = "api"; }
  else if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") { limiter = env.FORM_LIMITER; bucket = "form"; }
  if (!limiter) return null;
  try {
    const { success } = await limiter.limit({ key: `${bucket}:${ip}` });
    if (success) return null;
  } catch { return null; } // fail open: a limiter outage must not take the portal down
  return new Response("Too many requests. Please wait a minute and try again.\nDemasiadas solicitudes. Espere un minuto e intente de nuevo.\n",
    { status: 429, headers: { "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Search-engine ownership files, configured with vars so no code change is needed when Google/Bing issue them. */
export function verificationFile(req: Request, env: EdgeEnv): Response | null {
  const p = new URL(req.url).pathname;
  const ok = (body: string, type: string) => new Response(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=300" } });
  const g = env.GOOGLE_SITE_VERIFICATION?.trim();
  if (g && /^google[0-9a-f]+\.html$/.test(g) && p === `/${g}`) return ok(`google-site-verification: ${g}`, "text/html; charset=utf-8");
  const b = env.BING_SITE_AUTH?.trim();
  if (b && /^[0-9A-Fa-f]{16,64}$/.test(b) && p.toLowerCase() === "/bingsiteauth.xml")
    return ok(`<?xml version="1.0"?>\n<users>\n\t<user>${b}</user>\n</users>\n`, "application/xml; charset=utf-8");
  return null;
}

/** Static SEO pages routed through the Worker (assets.run_worker_first) so the legacy host 301s them like everything else. */
export const isStaticSeoPath = (p: string) => under(p, "/guide") || under(p, "/es") || ["/privacy", "/terms", "/support"].includes(p) || p.startsWith("/sitemap");

const LEGAL_HASH: Record<string, string> = {
  "/privacy": "/privacy#es",
  "/terms": "/terms#es",
  "/support": "/support#es",
};

/**
 * Shared /es links. /es/guia is the static Spanish buyer guide (real pages).
 * Every other /es path is an alias of the English page, opened in Spanish:
 * legal pages jump to the #es section, and the app pages set the lang cookie.
 */
export function esAppRedirect(req: Request): Response | null {
  const u = new URL(req.url);
  const p = u.pathname.replace(/\/+$/, "") || "/";
  if (p !== "/es" && !p.startsWith("/es/")) return null;
  if (p === "/es/guia" || p.startsWith("/es/guia/")) return null;

  const headers = { "Cache-Control": "public, max-age=3600" };
  const redirect = (location: string) => new Response(null, { status: 301, headers: { Location: location, ...headers } });

  // English guide slugs are not the Spanish ones. /es/guia/… is the counterpart.
  if (p === "/es/guide" || p.startsWith("/es/guide/")) return redirect(`${u.origin}/es/guia/`);

  if (p === "/es/iniciar-sesion") {
    return redirect(`${u.origin}/api/lang?to=es&back=${encodeURIComponent("/login" + u.search)}`);
  }

  const rest = p === "/es" ? "/" : p.slice("/es".length);
  const legal = LEGAL_HASH[rest];
  if (legal) return redirect(legal);

  let back = rest + u.search;
  if (!back.startsWith("/") || back.startsWith("//") || back.includes("\\") || back.includes("://")) back = "/";
  return redirect(`${u.origin}/api/lang?to=es&back=${encodeURIComponent(back)}`);
}
