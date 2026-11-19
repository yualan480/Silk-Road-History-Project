# Tetris Duel

Online Arcade app at `tetris-duel.html?embed=1`. Uses the existing Block Breaker Duel room/presence and screen flow, with the Tetris cartridge's Fredoka font, purple grid, rounded gradient buttons and exact beveled block palette/drawing style.

- Two 10×20 boards, identical seeded seven-piece bags, hold once per lock, ghost landing, keyboard and touch controls.
- Gravity starts at 0.24 seconds per cell (normal Tetris starts at 1 second), accelerates to 0.06 seconds, and uses a 0.18-second ground lock delay.
- Ninety-second maximum; top-out loses immediately, otherwise higher score wins. Two/three/four-line clears send one/two/four garbage rows. Attacks first cancel pending incoming rows.
- Quick public matchmaking, four-character private room codes, rematches and a three-level computer opponent.
- Uses the existing arcade Supabase Realtime project. No new SQL or leaderboard registration is required for the duel. It does not award ranked points or Orbits.
- Explicitly enables presence and waits for the first presence snapshot before evaluating room occupancy. New room namespace `tetrisduel-*` keeps its messages separate from other arcade games.
- Board snapshots are bounded/validated; broadcasts check the rival ID and match seed. Like the existing arcade, this is a peer-reported game rather than a cheat-proof authoritative server.

Checks:

- `node --test orbitcraft/test/tetris-duel.test.js`
- `node orbitcraft/test/tetris-duel-browser.check.mjs` uses a deterministic Phoenix relay to check two-player input isolation, scores, results, rematch, leave, computer, phone controls and quick play.
- `TETRIS_DUEL_LIVE=1 node orbitcraft/test/tetris-duel-browser.check.mjs` repeats against live Supabase Realtime using disposable test room presence only; no database rows are inserted. Passed private and quick matchmaking, synchronization and rematch tests.
