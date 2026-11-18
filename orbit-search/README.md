# Orbit Search

Scramjet browser proxy embedded in Orbit, directly below Ask Your Guide. Includes web search, website address entry, back/forward/reload, mobile layout and an authenticated Wisp relay.

## Render deployment

The repository's `render.yaml` describes both web services. Existing Render services do not automatically add another service when this file changes.

1. In Render create **New → Web Service**, connect **Silk-Road-History-Project**, use branch `main`, and name it `silk-road-orbit-search` (or another available name).
2. Leave **Root Directory** empty. Build command: `npm --prefix orbit-search ci --omit=dev`. Start command: `npm --prefix orbit-search start`. Health check: `/health`. Set `NODE_VERSION=24` and `ORBIT_SEARCH_PARENT_ORIGIN=https://silkroadhistoryproject.onrender.com` (exact origin, no path).
3. Deploy it. Copy its actual public HTTPS URL.
4. In the **existing Silk Road/Orbit service → Environment**, add `ORBIT_SEARCH_URL` with that URL, then save and redeploy. Open Orbit → **Orbit Search**. The site checks that the search application is awake before embedding it. Its loading notice stays visible until the account connection is acknowledged; if connecting fails, use **Retry connection**. Opening the search-service address directly shows instructions to return to the Orbit sidebar.

No SQL or Supabase authentication changes are required. Both services use the existing public Supabase configuration and verify signed-in users with Supabase. No service-role key is used.

A dedicated origin is intentional: proxied third-party pages must not share Orbit's browser origin and account storage. Do not serve this application from Orbit's own origin or configure the URL to point back at Orbit. The proxy's root-scoped service worker runs only on its own service origin. Orbit embeds it without top-navigation permission.

The Orbit account token is used only for the proxy service's authenticated session endpoint. Relay tickets are random, short-lived, kept in memory and checked on every WebSocket connection. The relay blocks private/loopback destinations, direct IP addresses, UDP and ports other than 80/443. Existing relay connections close when their ticket expires. Rate/stream limits are enabled. No browsing history is stored by the application server. Do not add analytics that capture ticket URLs.

Search defaults to Google. Websites may reject datacenter/proxy traffic, require CAPTCHA, or disallow embedding. Browsers need service workers and SharedWorker support. Render's free service can sleep and take time to wake; a free service also has limited bandwidth/CPU. This is not a guarantee that every website or every browser works.

## Local development and checks

Install: `npm --prefix orbit-search ci`. Start: `ORBIT_SEARCH_PARENT_ORIGIN=http://localhost:8787 npm --prefix orbit-search start`. The main site and proxy must use **different hostnames**, e.g. `localhost:8787` and `127.0.0.1:8790`, because cookies/storage isolation should not rely on ports. The main-site URL setting requires HTTPS; use local HTTPS when manually embedding, or run the automated browser check below. For automated browser integration the test uses isolated local test origins and an injected identity verifier; there is no production authentication bypass.

- `npm --prefix orbit-search test`: URL parsing, ticket replacement/expiry, origin/authentication checks and static asset restrictions.
- `node orbit-search/test/browser.check.mjs`: real Scramjet service worker + Epoxy + Wisp through a local fixture, executes rewritten JavaScript, checks phone layout. Uses existing Orbitcraft Playwright and `/usr/bin/chromium`. Private network access is enabled **only inside the test process** to reach its fixture; production blocks it.
- Existing site regression: `npm --prefix orbitcraft test`.

## Upstream software

Pinned packages, installed by lockfile (not unversioned CDN scripts):

- [Scramjet 1.1.0](https://github.com/MercuryWorkshop/scramjet): bundled LICENSE is AGPL-3.0 (npm metadata says MIT; retain the bundled license).
- [Bare Mux 2.1.9](https://github.com/MercuryWorkshop/bare-mux): MIT. This is the compatibility version used by Scramjet 1.1.0's reference application; upstream has deprecated it in favor of proxy-transports. Update the stack together rather than mixing transport protocol versions.
- [Epoxy Transport 2.1.29](https://github.com/MercuryWorkshop/epoxy-transport): AGPL-3.0.
- [Wisp JS 0.5.3](https://github.com/MercuryWorkshop/wisp-js): LGPL-3.0-or-later.

Dependencies retain their upstream licenses. Orbit integration source is available in this repository. No upstream package was modified.
