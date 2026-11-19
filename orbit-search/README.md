# Orbit Search

Scramjet browser proxy embedded in Orbit, directly below Ask Your Guide. Includes web search, website address entry, back/forward/reload, mobile layout and an authenticated Wisp relay.

## Render deployment

The repository's `render.yaml` describes both web services. Existing Render services do not automatically add another service when this file changes.

1. In Render create **New → Web Service**, connect **Silk-Road-History-Project**, use branch `main`, and name it `silk-road-orbit-search` (or another available name).
2. Leave **Root Directory** empty. Build command: `npm --prefix orbit-search ci --omit=dev`. Start command: `npm --prefix orbit-search start`. Health check: `/health`. Set `NODE_VERSION=24` and `ORBIT_SEARCH_PARENT_ORIGIN=https://silkroadhistoryprojects.onrender.com` (exact origin, no path).
3. Deploy it. Copy its actual public HTTPS URL.
4. In the **existing Silk Road/Orbit service → Environment**, add `ORBIT_SEARCH_URL` with that URL, then save and redeploy. Open Orbit → **Orbit Search**. Clicking the tab requests fullscreen immediately, before network initialization. Use **Exit fullscreen** or Escape to leave it; switching away also exits. Browsers that decline fullscreen keep the normal embedded view. The site checks that the search application is awake before embedding it. Its loading notice stays visible until the account connection is acknowledged; if connecting fails, use **Retry connection**. Opening the search-service address directly shows instructions to return to the Orbit sidebar. If a browser blocks the embedded frame but permits the service as a top-level page, click **Open search window** in Orbit. The window receives the signed-in account only from its exact trusted Orbit opener, authenticates against the service locally, and still uses short-lived relay tickets. Keep the Orbit Search tab open for session renewal. This does not override browser or network policies; a blocked top-level service still requires the relevant administrator to allow it.

On Render's Node main service, `/chat/index.html` is served with its `frame-src` entry set to the exact HTTPS origin in `ORBIT_SEARCH_URL`. Generated Render suffixes therefore need only an environment setting, not a manual CSP edit. Other frame sources and security directives are retained; no Render wildcard is allowed. An existing Orbit window retains its old HTML policy until reloaded/reopened. Static-host deployments do not perform this Node response transformation and require their own exact-origin CSP configuration.

No SQL or Supabase authentication changes are required. Both services use the existing public Supabase configuration and verify signed-in users with Supabase. No service-role key is used.

A dedicated origin is intentional: proxied third-party pages must not share Orbit's browser origin and account storage. Do not serve this application from Orbit's own origin or configure the URL to point back at Orbit. The proxy's root-scoped service worker runs only on its own service origin. Orbit embeds the trusted shell from its separate origin, with top navigation disabled; websites inside the shell remain sandboxed as well. The public launcher accepts nested wrappers without a frame-ancestors rule; its account handoff still validates both the exact immediate Orbit parent origin and source window. An unrelated embedding page cannot authenticate it.

The Orbit account token is used only for the proxy service's authenticated session endpoint. In embedded and separate-window mode it is passed to that exact service origin using a checked opener/source pair, held transiently, and never stored in browser storage or URL parameters. Relay tickets are random, short-lived, kept in memory and checked on every WebSocket connection. The relay blocks private/loopback destinations, direct IP addresses, UDP and ports other than 80/443. Existing relay connections close when their ticket expires. Rate/stream limits are enabled. No browsing history is stored by the application server. Do not add analytics that capture ticket URLs.

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


## Search interface

The browser shell uses Orbit's original planet logo, a local CSS background with faint orbital lines and static stars, a Chrome-inspired rounded toolbar, a central search field, website shortcuts, and a fresh-search control. Back/forward navigation and reload run inside the proxy. The shared account handoff and original Google search default are unchanged. Entry/focus/hover animations and a slow four-pixel logo float respect the system reduced-motion setting. All new visual assets are served by this service; no additional font, wallpaper or icon CDN is needed. The browser checks cover the actual Orbit CSP, central and toolbar navigation, history controls, fullscreen, reduced motion, and phone/landscape widths.

Discord sign-in: Discord pages show a direct link to https://discord.com/login in a separate browser tab. This uses the user’s ordinary browser connection rather than the shared Orbit Search relay. It does not bypass or solve Discord’s CAPTCHA, guarantee account access, or transfer Discord credentials into Orbit. Other sites continue to open in the Orbit frame.

For the pinned-generation compatibility audit, complete initializer/SW paths, unresolved shared-worker probe, backend policy and validation limits, see [PROXY-AUDIT.md](PROXY-AUDIT.md).

Relay capacity is 256 total streams / 64 per host and 20 connections per authenticated session. Discord-scoped experimental service-worker emulation is enabled, with fail-closed intercepted calls. Popups/modal APIs are permitted by the retained frame sandbox. These compatibility changes do not demonstrate successful Discord authentication or resolve the previously documented shared-worker probe.

Popup compatibility requires both the outer `chat/orbit-search.js` sandbox and inner `public/search.js` sandbox updates: deploy both the main website and separate Search service.

HTTP/2 reset recovery: `/epoxy-fallback.mjs` wraps the pinned Epoxy transport. On a recognizable HTTP/2 PROTOCOL_ERROR / reset / GOAWAY, bodyless GET/HEAD requests are retried once using the pinned Epoxy TLS minimal build (HTTP/1.1 only). Successful fallback origins use HTTP/1.1 for subsequent HTTP requests in that transport instance, capped at 64 origins. POST and other non-read-only requests are never replayed. WebSockets retain the original full Epoxy client. Certificates are still verified, and the same authenticated Wisp URL is used. No HTTP status, CAPTCHA or unrelated TLS/network error triggers this retry.

Validate with `npm test`, `node test/http1-browser.check.mjs` (real minimal WASM + authenticated local relay), and `node test/browser.check.mjs`. The TLS source for the pinned `epoxy-tls@2.1.20-1` confirms ALPN h2 is included only in the full build: https://github.com/MercuryWorkshop/epoxy-tls/blob/9cde724aea1a0f5e46b1c962b3d19ca1389af074/client/src/stream_provider.rs .

Ended relay recovery: on `MuxTaskEnded` / `Multiplexor task ended`, both full and HTTP/1-only Epoxy clients call their native `replace_stream_provider()` and retry a bodyless GET/HEAD once. Concurrent failures share a reconnect; mutation requests are not replayed. A repeated failure stops rather than looping. Authentication tickets now renew in place for the account, and active socket expiration timers recheck the renewed deadline. This avoids invalidating other tabs on refresh while still enforcing expiry and authentication.

Validate forced relay drops with `node test/relay-browser.check.mjs`; this closes real local authenticated Wisp sockets and verifies full + HTTP/1.1 recovery. A backend restart loses in-memory tickets: reopen Orbit Search to authenticate again if reconnect is refused. Existing app WebSocket conversations are not transparently replayed. The transport module URL is versioned to replace the old module in a surviving BareMux SharedWorker after deployment.

Relay diagnostics update: Ready now requires a same-origin authenticated `/api/relay-check` and a real WebSocket Wisp-v1 CONTINUE packet, not merely selecting a BareMux transport. Failed authorization, capacity limits, early closure or handshake timeout produce a specific launcher error before navigation. The probe opens no destination TCP stream. Rejected upgrades and early real-transport closure are logged without tickets/credentials; expected short-lived probe closures are excluded. Wisp warning logs are enabled.

Ended-mux recovery now creates a fresh Epoxy client (including connection pool) rather than replacing only its stream provider. Each minimal client gets newly allocated WASM options because its constructor consumes them. Forced-disconnection tests pass for both builds. This supersedes the earlier replace_stream_provider implementation; the live Render disconnect cause remains unconfirmed without deployment logs.

Current main site: **https://silkroadhistoryprojects.onrender.com**. If no separate Search service exists, create one from this repository with Root Directory blank, Build `npm --prefix orbit-search ci --omit=dev`, Start `npm --prefix orbit-search start`, and `ORBIT_SEARCH_PARENT_ORIGIN=https://silkroadhistoryprojects.onrender.com`. After it is Live, set `ORBIT_SEARCH_URL` on the main website service to the Search service's actual HTTPS address, then redeploy the main service and reopen Orbit. Creating the second service and changing account environment variables must be done in the Render dashboard unless Render API access is separately provided.

Confirmed deployment defaults: the Node main site at `silkroadhistoryprojects.onrender.com` uses `https://orbit-search-wx0l.onrender.com` when `ORBIT_SEARCH_URL` is absent. A supplied environment value still takes precedence. Other hostnames receive no automatic Search default. The Render blueprint also specifies this confirmed URL.

Browser tabs: the plus button opens a separate in-app tab. Each tab retains its iframe, URL/draft, navigation history and loading state while other tabs are selected. Close buttons remove only their tab; closing the last tab creates a blank start tab. Arrow/Home/End keys switch focused tabs, Delete closes a focused tab, and the strip scrolls on phones. Tabs remain open within the current Search page; this does not persist sessions across a page refresh.
