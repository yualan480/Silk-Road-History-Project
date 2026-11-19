# OpenKrillion — Community Edition

Source: https://github.com/VulcanEon/openkrillion.com-service
Pinned revision: 33fdff48623fb4815e95081a1a1d41bd1902f99d
Retrieved: 2026-11-19. MIT application license and third-party/font notices are bundled.

This is an independent community game, not official Krillion (https://krillion.io/).
The cover is this edition's original upstream `public/assets/icon.png`.

Orbit hosts the public files here and the private Worker source, sample bank and
migrations under `orbitcraft/server/openkrillion/`. `openkrillion.js` adapts the
Worker to Node 24's SQLite. All seven rounds, prepared answer tiers, animated
scoring, practice, review, settings and logbook are retained. Asset and API paths
are mounted under `/games/openkrillion/`. The gallery and game identify the edition.

Original-game reference synchronization and upstream analytics are disabled.
Only the independently assembled, small sample question bank is bundled. Daily
and practice modes currently repeat this bank; these are not official daily puzzles.

The existing main Node service hosts the game; no new Render service, secret,
Supabase migration or build dependency is required. Browser settings/logbook stay
local. Anonymous run data is in `openkrillion.sqlite` next to ORBITCRAFT_DB (default
`orbitcraft/data/`). A Render ephemeral-disk redeploy can reset server progress;
this game does not sync with Orbit accounts. The anonymous HttpOnly cookie is
restricted to this game's path. The mounted privacy/about pages describe this setup.

The Node API is required; copying only these public files to a static host does
not provide server scoring. No proprietary original-game client or question
snapshot is copied. The separate official Krillion link is retained in the gallery.
