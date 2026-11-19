# Scramjet 1.1.0 runtime audit

## Versions verified from installed packages and npm's dependency tree

| Component | Pinned version | Result |
| --- | --- | --- |
| Scramjet | 1.1.0 | Bundles the BareMux-generation client and Worker/WebSocket hooks |
| BareMux | 2.1.9 | Same version deduplicated under Scramjet |
| Epoxy transport | 2.1.29 | BareMux v2 transport; do not replace only this package with Epoxy v3 |
| Epoxy TLS | 2.1.20-1 | Required by the installed Epoxy v2 package |
| Wisp server | 0.5.3 | Authenticated relay, TCP 80/443 |

Scramjet's package metadata references bare-as-module3 in its development/build tooling; this installation's runtime transport uses BareMux. There is no proxy-transports generation mixed into the installed runtime. Migrating to Epoxy v3 would require a coordinated migration rather than a one-package upgrade.

## Complete deployed initialization code

The page client is `public/search.js` (this site's equivalent of `index.js`). The complete reusable initializer is `public/proxy-runtime.js`; the classic service worker is `public/sw.js`. The server explicitly serves the new initializer. No dependency upgrades are necessary for these changes.

The page loads `/vendor/scramjet/scramjet.all.js` and `/vendor/baremux/index.js` before its module. Existing authenticated account handoff obtains a short-lived relay ticket. The integration is:

```js
import {createProxyRuntime} from '/proxy-runtime.js';
const runtime = createProxyRuntime();

// Only after the existing trusted-parent account exchange returns session.token:
const controller = await runtime.connect(session.token);
// connect resolves after controller.init, root SW registration/claim, and setTransport.
const frame = controller.createFrame();
frame.frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
document.querySelector('#browser').replaceChildren(frame.frame);
frame.go('https://discord.com/login');
```

Do not insert a Supabase access token into the Wisp URL. The existing `/api/session` exchange converts it into a separate short-lived ticket, and the relay still validates ticket, origin and connection limits.

The initializer preserves `/service/` as the proxy prefix, explicitly registers `/sw.js` with `{scope:'/'}`, verifies that scope covers the prefix, and listens for controller changes before checking current control. This fixes a possible lost controller-change event and adds a bounded wait instead of hanging forever. Epoxy `setTransport` must finish before creating/navigating a proxied frame.

## Workers, WebSockets and service workers

The installed `scramjet.all.js` already rewrites dedicated/shared Worker URLs and calls `getInnerPort()`, transferring `{ $scramjet$type: 'baremuxinit', port }` through native Worker/MessagePort postMessage. Its worker-side client waits for that message. Its WebSocket hook calls the Bare client with the remote URL and origin. Dedicated-worker forwarding works as shipped. A separate shared-worker fixture stalls before its application script loads. Source inspection also shows that the shared-worker sender uses its connection port while the receiving Bare client waits for a worker-global message. A receive-side bridge and client-handoff experiment did not make the fixture pass and were discarded. No unverified hook patches were shipped. Shared-worker compatibility in this exact v1 build remains unresolved; the presence of hooks alone is not proof that they work.

The root service worker is the proxy's own worker. This is different from emulating a visited site's service worker: Scramjet 1.1.0 defaults its experimental `serviceworkers` flag to false. This update does not enable that experimental feature or claim arbitrary third-party service workers work. Dedicated workers and WebSockets are verified separately by a local relay fixture; the shared-worker case is not verified.

## Cross-origin isolation and backend policy

The pinned runtime operates without COOP/COEP in the browser tests. Do not add COOP same-origin / COEP require-corp indiscriminately to this embedded Search origin: they can affect opener-based account handoff and embedding. Features requiring SharedArrayBuffer, such as Scramjet's optional synchronous-XHR mode, require a separate isolation design. They are not enabled here.

Current Wisp options allow TCP ports 80 and 443 and have no hostname whitelist/blacklist. Consequently the configuration permits public DNS destinations for discord.com, discordapp.com, gateway.discord.gg and media.discordapp.net on 443. Use `https://discordapp.com`, not the malformed `://discordapp.com`. A remote `wss://gateway.discord.gg` connection is transported over the authenticated Wisp WebSocket to a remote TCP/TLS stream; it is not added as a direct browser connection.

Private IPs, loopback, direct IP destinations and UDP remain blocked. This is not support for Discord WebRTC voice/video or a guarantee against all browser networking paths. No firewall/SSRF protections were relaxed. Render egress, destination rate limits, CAPTCHA and Discord authentication decisions can still prevent access. No Discord account credentials were used in verification, and a successful Discord login has not been demonstrated.

## Validation

`npm --prefix orbit-search test` includes controller claim-before-listener, claim-after-listener, claim-during-listener and timeout cases, plus existing session/origin/asset security tests.

`node orbit-search/test/browser.check.mjs` verifies actual Scramjet proxying, root SW startup, a dedicated worker fetching and opening a WebSocket through a local Wisp relay fixture, no direct browser HTTP requests to the fixture hostname, iframe origin isolation and the existing fullscreen/phone/fallback behavior. The local fixture uses plain WS; this is not an end-to-end Discord WSS/login/CAPTCHA test or a universal no-leak guarantee.

After pushing, redeploy the separate Orbit Search Render service. The main website service does not deploy this service's frontend by itself.

To reproduce the unresolved shared-worker case explicitly: `ORBIT_SEARCH_SHARED_WORKER_CHECK=1 node orbit-search/test/browser.check.mjs`. It timed out before returning worker fetch/WebSocket results in the audited Chromium environment. The normal test run does not claim this probe passed. No complete working Discord login, remote service-worker or shared-worker configuration is established by this audit.

## Follow-up: requested imports, vendor routes and Render headers

Do **not** import `/vendor/bare-mux/worker.js` into `sw.js`. That file is the SharedWorker server entry: it assigns `self.onconnect` and announces a BareMux port refresh on BroadcastChannel. It is not the service-worker BareClient module. Scramjet's bundle already contains its BareClient integration. Loading the SharedWorker entry into the service worker does not fix remote-worker interception and can disrupt port state.

`server.js` now serves `/vendor/bare-mux/` as an alias of `/vendor/baremux/`. Both `worker.js`, `index.js` and `index.mjs` have identical bytes under both prefixes. Existing client worker URLs are deliberately retained because BareMux persists its worker path.

Epoxy transport 2.1.29 distributes `index.js` and `index.mjs`; its WASM is embedded as base64 in that module. There is no standalone Epoxy WASM binary in this package to map to a fabricated URL. Scramjet's real `/vendor/scramjet/scramjet.wasm.wasm` is served with `application/wasm`; the response's WASM magic bytes are tested. Vendor scripts/modules use JavaScript MIME types and traversal/non-vendor files remain inaccessible.

The root `_headers` file contains no COOP/COEP and is used by static-host deployment tooling, not by this Render Node Web Service. Node response headers are set in `orbit-search/server.js`. No `_headers` change or isolation headers are required by the tested pinned runtime. The Wisp upgrade validates the proxy's own browser Origin and relay ticket; Discord's gateway is an outbound destination inside that authenticated tunnel, not an incoming Origin exception. Keep these checks. All named public Discord hosts on 443 are permitted by the existing destination policy; no destination-level connection success is implied.

Full reviewed source snapshots are provided in REVIEWED-FILES.md for copying. They preserve the known limitations above and are not a claim that Discord can never fail or make an unhandled browser network request.

## Connection and Discord compatibility update

Wisp now permits 256 streams per relay connection, 64 per destination host, and up to 20 relay connections per authenticated Orbit session. An integration test opens twenty real relay WebSockets and verifies that the twenty-first is refused with 403. These limits are capacity settings, not evidence that a previous Discord failure was caused by a limit.

The frame keeps its sandbox and adds `allow-popups allow-popups-to-escape-sandbox allow-modals`. Existing `allow-scripts allow-same-origin allow-forms allow-downloads` permissions are retained. The original sandbox already permitted ordinary workers and same-origin storage; the new tokens specifically address popups, popup sandbox inheritance and modal APIs. They do not guarantee CAPTCHA acceptance.

`public/proxy-runtime.js` now explicitly sets supported v1 `strictRewrites:true`, `serviceworkers:false` and `syncxhr:false` defaults. Only HTTPS discord.com / discordapp.com pages and their single-label subdomains receive `serviceworkers:true` and `allowFailedIntercepts:false`. Thus Discord's experimental v1 service-worker emulation is now enabled, superseding the earlier audit's description of the global default for Discord. Failed intercepted Discord calls throw instead of invoking native fallbacks. There is no supported generic `rewriter`, `workers` or `websockets` flag in the installed v1 declarations; existing bundled Worker/WebSocket hooks remain in use.

Service-worker emulation remains experimental and shared-worker completion / Discord login are not verified. This change does not establish a complete zero-direct-network guarantee, nor does it add WebRTC voice/video relay support.

The outer `chat/orbit-search.js` frame also had a sandbox without popup permissions. The real popup test initially reproduced Chrome blocking it despite the inner permission change. The same three permissions are now present on both wrappers, with main-site and Search module cache versions advanced. Deploy **both** Render services for popup compatibility.

Popup validation limit: after both sandbox fixes, a real click opens a new window and its navigation request targets the Search origin’s `/service/` prefix. The full popup-content probe did not finish loading within 30 seconds. The regression test verifies opening and rewritten navigation only; it does not claim popup rendering or CAPTCHA success.

## YouTube HTTP/2 PROTOCOL_ERROR recovery

The reported screenshot identifies Hyper HTTP/2 Reset(StreamId(1), PROTOCOL_ERROR). The pinned Epoxy transport has no force-HTTP/1 setting. `/epoxy-fallback.mjs` now wraps it with the HTTP/1-only minimal build from the same pinned `@mercuryworkshop/epoxy-tls@2.1.20-1`; this is now a direct dependency. `proxy-runtime.js` selects the wrapper, which delegates regular HTTP and every WebSocket connection to the original full transport.

See README.md for retry policy and validation. The actual minimal-WASM browser test observes HTTP/1.1 at an authenticated local relay destination. Unit tests cover the exact screenshot error, one retry, origin reuse, no POST/body/aborted-request replay, no retry for 403/TLS failures, and preservation of both errors if fallback fails. This is transport error recovery, not bypassing authentication, CAPTCHAs or destination blocks.

A read-only live YouTube probe from this execution environment failed earlier during TLS negotiation (`tls handshake eof`), before the reported HTTP/2 stage. The HTTP/2-only retry correctly did not treat that different failure as a trigger. Live YouTube playback on the Render deployment is therefore not verified by the local transport tests.

## Ended mux recovery and renewable tickets

`public/relay-recovery.js` recognizes the reported `MuxTaskEnded` separately from HTTP/2 reset errors. It uses Epoxy's native `replace_stream_provider()`, deduplicates simultaneous reconnects, and retries bodyless GET/HEAD requests only once. Both the full transport and minimal HTTP/1 adapter use it. Failed reauthentication is surfaced; expired/invalid tickets, POST bodies and existing WebSocket messages are not replayed.

`security.js` renews the account's existing unexpired ticket instead of invalidating other tabs. The relay expiry callback rechecks the current authenticated expiration, so renewed live sockets are not killed at their original deadline. Real socket tests cover renewal past the old deadline, eventual expiration, and real disconnections/recovery for both Epoxy builds. The browser regression suite passes. This repairs verified relay lifecycle gaps but does not establish why Render closed the specific reported connection or prove successful Discord login.

## Follow-up: live deployment confirmed, readiness and fresh-client recovery

The live Search index, runtime, adapter and recovery files were fetched and byte-compared with the previous commit; all matched, ruling out a missed deployment at that point. The cause of the user's live closure was not established. Repeated local packet-drop tests alone do not prove Discord connectivity.

The launcher now verifies the short-lived relay ticket through a same-origin POST check, then opens a native authenticated Wisp-v1 probe and requires its initial CONTINUE packet before reporting Ready. The probe closes immediately without connecting to any destination. Wrong-origin, expired-ticket and connection-capacity cases are differentiated. Early handshake closure and timeouts fail initialization. Browser tests cover real successful handshakes, expired-ticket errors and a simulated close-before-handshake. This replaces the earlier misleading readiness signal based only on successful transport selection.

Recovery now reconstructs the full Epoxy client/pool and the minimal HTTP/1 client instead of reusing ended client state. WASM options are allocated per minimal constructor (they are consumed). Actual forced socket drops still recover in both modes. The transport URL advances to v3 to avoid a surviving SharedWorker's old module cache. Warning-level Wisp diagnostics and sanitized upgrade-rejection/socket logs are enabled; no tickets or auth headers are printed. No claim of a verified live Discord login is made.

## Parent-site migration

The intended main-site origin is now `https://silkroadhistoryprojects.onrender.com` (plural projects). The Search server default, Render blueprint and setup instructions use that exact origin. A Render `ORBIT_SEARCH_PARENT_ORIGIN` environment variable overrides the default and must also be updated on an existing Search service. The main site must set `ORBIT_SEARCH_URL` to the separate Search service’s actual HTTPS origin. No public browsing is served from the account-bearing main-site origin.

The Node main server now injects the exact configured Search origin into the served Orbit page’s iframe policy; autogenerated Render host suffixes no longer require a source edit. Unit tests use the actual chat HTML to verify no other CSP directive changes and that insecure/same-host/credential URLs remain rejected.
