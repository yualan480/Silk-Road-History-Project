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
