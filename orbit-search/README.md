# Orbit Search

Scramjet browser proxy embedded in Orbit, directly below Ask Your Guide. Includes web search, website address entry, back/forward/reload, mobile layout and an authenticated Wisp relay.

## Render deployment

The repository's `render.yaml` describes both web services. Existing Render services do not automatically add another service when this file changes.

1. In Render create **New → Web Service**, connect **Silk-Road-History-Project**, use branch `main`, and name it `silk-road-orbit-search` (or another available name).
2. Leave **Root Directory** empty. Build command: `npm --prefix orbit-search ci --omit=dev`. Start command: `npm --prefix orbit-search start`. Health check: `/health`. Set `NODE_VERSION=24` and `ORBIT_SEARCH_PARENT_ORIGIN=https://silkroadhistoryproject.onrender.com` (exact origin, no path).
3. Deploy it. Copy its actual public HTTPS URL.
4. In the **existing Silk Road/Orbit service → Environment**, add `ORBIT_SEARCH_URL` with that URL, then save and redeploy. Open Orbit → **Orbit Search**. Clicking the tab requests fullscreen immediately, before network initialization. Use **Exit fullscreen** or Escape to leave it; switching away also exits. Browsers that decline fullscreen keep the normal embedded view. The site checks that the search application is awake before embedding it. Its loading notice stays visible until the account connection is acknowledged; if connecting fails, use **Retry connection**. Opening the search-service address directly shows instructions to return to the Orbit sidebar. If a browser blocks the embedded frame but permits the service as a top-level page, click **Open search window** in Orbit. The window receives the signed-in account only from its exact trusted Orbit opener, authenticates against the service locally, and still uses short-lived relay tickets. Keep the Orbit Search tab open for session renewal. This does not override browser or network policies; a blocked top-level service still requires the relevant administrator to allow it.

Orbit's `chat/index.html` CSP `frame-src` allowlist includes `https://silk-road-orbit-search.onrender.com`. If you deploy the search service at a different hostname, replace that exact entry with the actual service origin as well as updating `ORBIT_SEARCH_URL`. An existing Orbit window retains its old HTML policy until it is closed/reopened or reloaded.

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
