import assert from "node:assert/strict";
import { test } from "node:test";
import { esAppRedirect } from "./edge.ts";
import { appStoreIsLive, comingSoonQr, resetListingCache, rewriteStorefrontText } from "./storefront.ts";

const origin = "https://pasoapasobaja.com";

function loc(path: string): string | null {
  const res = esAppRedirect(new Request(origin + path));
  return res?.headers.get("location") ?? null;
}

test("Spanish aliases cover every app page and leave the guide alone", () => {
  assert.equal(loc("/es/find-a-pro"), `${origin}/api/lang?to=es&back=${encodeURIComponent("/find-a-pro")}`);
  assert.equal(loc("/es/find-a-pro/"), loc("/es/find-a-pro"));
  assert.equal(loc("/es/pros"), `${origin}/api/lang?to=es&back=${encodeURIComponent("/pros")}`);
  assert.equal(loc("/es"), `${origin}/api/lang?to=es&back=${encodeURIComponent("/")}`);
  assert.equal(loc("/es/login"), `${origin}/api/lang?to=es&back=${encodeURIComponent("/login")}`);
  assert.equal(loc("/es/iniciar-sesion"), loc("/es/login"));
  assert.equal(loc("/es/onboarding/2?step=town"), `${origin}/api/lang?to=es&back=${encodeURIComponent("/onboarding/2?step=town")}`);
  assert.equal(loc("/es/dashboard/billing"), `${origin}/api/lang?to=es&back=${encodeURIComponent("/dashboard/billing")}`);
  assert.equal(loc("/es/p/example"), `${origin}/api/lang?to=es&back=${encodeURIComponent("/p/example")}`);
  assert.equal(loc("/es/privacy"), "/privacy#es");
  assert.equal(loc("/es/terms"), "/terms#es");
  assert.equal(loc("/es/support"), "/support#es");
  assert.equal(loc("/es/guide"), `${origin}/es/guia/`);
  assert.equal(loc("/es/guide/how-to-build-a-house-in-baja"), `${origin}/es/guia/`);
  assert.equal(loc("/es/guia"), null);
  assert.equal(loc("/es/guia/como-construir-una-casa-en-baja-california-sur"), null);
  assert.equal(loc("/find-a-pro"), null);
  assert.equal(loc("/es//evil.com"), `${origin}/api/lang?to=es&back=${encodeURIComponent("/")}`);
});

const HOME = `<title>Paso a Paso Baja: buy property in Baja California Sur</title>
<meta name="apple-itunes-app" content="app-id=6825930468"/>
<a class="hdr-btn" href="/login">Sign in</a>
<h1>Buy property in Baja, one step at a time.</h1>
<a class="appstore" href="https://apps.apple.com/app/id6825930468?ct=home-buyer" rel="noopener"><svg></svg><span><small>Download on the</small><strong>App Store</strong><span class="sr-only"> · Paso a Paso Baja</span></span></a>
<p>On iPhone. Scan the code on a computer.</p>`;

const RSC = `["$","a",null,{"className":"hdr-btn","href":"/login","prefetch":false,"children":"Sign in"}]
["$","h1",null,{"children":"Buy property in Baja, one step at a time."}]
["$","a",null,{"className":"appstore","href":"https://apps.apple.com/app/id6825930468?ct=home-buyer","rel":"noopener","children":[["$","svg",null,{}],["$","span",null,{"children":[["$","small",null,{"children":"Download on the"}],["$","strong",null,{"children":"App Store"}]]}]]}]`;

const ESCAPED = String.raw`[\"$\",\"a\",null,{\"className\":\"appstore\",\"href\":\"https://apps.apple.com/app/id6825930468?ct=find-a-pro\",\"rel\":\"noopener\",\"children\":[[\"$\",\"small\",null,{\"children\":\"Download on the\"}],[\"$\",\"strong\",null,{\"children\":\"App Store\"}]]}]`;

const LOGIN = `<h1>Sign in</h1><p class="muted">Sign in with your Apple Account. We get an anonymous CloudKit user ID only: no name, email or password.</p>
<a class="hdr-btn" href="/login">Sign in</a>`;

const LOGIN_ES = `<title>Iniciar sesión · Paso a Paso Baja para Profesionales</title>
<a class="hdr-btn" href="/login">Iniciar sesión</a>
<h1>Iniciar sesión</h1>
<p>Inicie sesión con su cuenta de Apple. Solo recibimos un ID anónimo de CloudKit: sin nombre, correo ni contraseña.</p>
<button>Iniciar sesión con Apple</button>
<h1>Compre propiedad en Baja, paso a paso.</h1>
<small>Descárguela en el</small><strong>App Store</strong>`;

test("coming soon badge is not a link, and copy covers build plus plain Apple sign-in", () => {
  const home = rewriteStorefrontText(HOME, false);
  assert.equal(home.includes("apps.apple.com"), false);
  assert.equal(home.includes("apple-itunes-app"), false);
  assert.match(home, /role="note" aria-label="Coming soon to the App Store"/);
  assert.match(home, /<small>Coming soon<\/small><strong>to the App Store<\/strong>/);
  assert.match(home, /Buy, build, and own property in Baja, one step at a time\./);
  assert.match(home, /buy, build, and own property in Baja California Sur/);
  assert.match(home, />For pros: sign in</);
  assert.match(home, /Coming soon to the App Store\./);

  const login = rewriteStorefrontText(LOGIN, false);
  assert.match(login, /<h1>For pros: sign in<\/h1>/);
  assert.match(login, /Sign in with your Apple Account\. We only get an anonymous ID from Apple: no name, email or password\./);
  assert.equal(login.includes("CloudKit"), false);

  const rsc = rewriteStorefrontText(RSC, false);
  assert.equal(rsc.includes("apps.apple.com"), false);
  assert.match(rsc, /"children":"For pros: sign in"/);
  assert.match(rsc, /"children":"Coming soon"/);
  assert.match(rsc, /"children":"to the App Store"/);
  assert.match(rsc, /"\$","span"/);

  const escaped = rewriteStorefrontText(ESCAPED, false);
  assert.equal(escaped.includes("apps.apple.com"), false);
  assert.match(escaped, /Coming soon/);
  assert.match(escaped, /to the App Store/);
});

test("Spanish uses usted and the live flag restores the badge without reverting the copy", () => {
  const es = rewriteStorefrontText(LOGIN_ES, false);
  assert.match(es, /Para profesionales: iniciar sesión/);
  assert.match(es, /Inicie sesión con su cuenta de Apple\. Solo recibimos un identificador anónimo de Apple: sin nombre, sin correo y sin contraseña\./);
  assert.match(es, /Iniciar sesión con Apple/);
  assert.match(es, /Compre, construya y sea dueño de una propiedad en Baja, paso a paso\./);
  assert.equal(es.includes("CloudKit"), false);
  assert.equal(/\b(tú|tu)\b/.test(es), false);

  const live = rewriteStorefrontText(HOME, true);
  assert.match(live, /href="https:\/\/apps\.apple\.com\/app\/id6825930468\?ct=home-buyer"/);
  assert.match(live, /apple-itunes-app/);
  assert.match(live, /Buy, build, and own property in Baja/);
  assert.match(live, />For pros: sign in</);
  assert.match(live, /<small>Download on the<\/small>/);
});

test("APP_STORE_LIVE overrides detection", async () => {
  resetListingCache();
  let calls = 0;
  const lookup = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ resultCount: 0 }));
  }) as typeof fetch;
  assert.equal(await appStoreIsLive({ APP_STORE_LIVE: "1" }, lookup), true);
  assert.equal(await appStoreIsLive({ APP_STORE_LIVE: "0" }, lookup), false);
  assert.equal(calls, 0);
  assert.equal(await appStoreIsLive({}, lookup), false);
  assert.equal(calls, 2);
  calls = 0;
  assert.equal(await appStoreIsLive({}, lookup), false);
  assert.equal(calls, 0, "a not-live listing is cached");
  resetListingCache();
  const liveLookup = (async () => new Response(JSON.stringify({ resultCount: 1 }))) as typeof fetch;
  assert.equal(await appStoreIsLive({}, liveLookup), true);
});

test("coming soon image names the state and carries no address", () => {
  const en = comingSoonQr(new Request("https://pasoapasobaja.com/api/app-qr"));
  const es = comingSoonQr(new Request("https://pasoapasobaja.com/api/app-qr", { headers: { cookie: "lang=es" } }));
  assert.equal(en.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.equal(en.headers.get("x-app-store-state"), "soon");
  return Promise.all([en.text(), es.text()]).then(([enSvg, esSvg]) => {
    assert.match(enSvg, /Coming soon/);
    assert.match(esSvg, /Próximamente/);
    assert.equal(enSvg.includes("apps.apple.com"), false);
    assert.equal(/\d{5}/.test(enSvg), false);
  });
});
