# Roblox browser-play check — 2026-11-19

Checked for a working client that could actually play inside Orbit:

- Official installation guidance: https://en.help.roblox.com/hc/en-us/articles/204473560-How-to-Install-and-Play-Roblox . The website launches an installed Roblox player; hosting downloaded desktop binaries does not provide browser gameplay.
- `https://www.roblox.com/` returns `X-Frame-Options: SAMEORIGIN`; its website is not an embeddable game client.
- `https://now.gg/apps/roblox-corporation/5349/roblox.html` redirected to the general now.gg homepage during this check. It also sends `X-Frame-Options: SAMEORIGIN`. This did not produce a working Roblox browser session suitable for an Orbit game card.
- https://github.com/ContactRecipient/RobloxWebClient contains a Babylon.js renderer for `.rbxlx` map parts, using a free camera. It is an unfinished map viewer, not a Roblox/Luau gameplay client or connection to Roblox experiences.
- https://github.com/azurion-dev/Roblox-Web-Client contains a license, README and version text, with no playable client implementation.

Additional cloud services were tested in Chromium:

- https://www.easyfun.gg/cloud-games/roblox.html loads a Roblox cloud-launch page. Its guest Play button reached a connection queue (position 4 during the check), with a displayed 30-minute trial and sign-in options. Actual Roblox gameplay was not reached or verified. This is a third-party streaming service, not Roblox files that Orbit can host.
- https://web.cloudmoonapp.com/game/com.roblox.client/ loads a Roblox cloud-game page. Clicking Play did not produce a game session during the check. Its marketing page returning HTTP 200 does not verify gameplay or Orbit embedding.

No working Roblox client was added. An app download, unavailable cloud link or
map viewer should not be presented as playable Roblox. A supported cloud provider
with an actual working session and embedding support could change this result;
this check does not assert that every possible provider is permanently unavailable.
