# Game progress and autosave

`game-autosave.js` coordinates saves in game entry pages. Native localStorage writes are immediate; a per-game recovery copy follows within 200 ms and flushes on hiding/leaving. Native IndexedDB save transactions remain managed by the game engine. Authentication tokens, passwords, device identifiers, and Orbit account keys are excluded from recovery copies; nothing is uploaded by this coordinator.

The coordinator calls registered save adapters every two seconds and on visibility/page-hide events. Cookie Clicker's native serializer is saved at that cadence without repeated save-notification popups. Exposed Unity persistent filesystems are flushed through their native sync API. The gallery requests a flush before returning or reloading.

Dedicated run-state adapters:

- Random Trivia: current question, answers, score and answer lock save on each action.
- Pokémon Cry: generation selection, remaining question pool and session score save on each action.
- Pokémon Stats: target Pokémon, unfinished guess, tiers, revealed values and hints save on each action.
- Suika: pile, fruit velocities, score and next fruit saved every second and restored on load.
- A Small World Cup: native Construct JSON state (including the current layout/match) saved every second.
- Super Mario Bros. NES player: emulator save state every two seconds in IndexedDB, keyed by the user-provided ROM SHA-256. The authorized local ROM can also be remembered. Save export/import is provided.

Other engines continue using their native save boundaries for levels, purchases, worlds, preferences, or best scores. Online games keep server-managed progress. A storage flush cannot create a resumable mid-match state in an engine that exposes no save-state API. In such games an unfinished action run may restart. Saves here are on this browser/device, not account-wide cloud sync. Export native backups before deleting browser data.

- Super Mario 64: native save files flushed every two seconds; IndexedDB resume snapshots every ten seconds and on visibility changes or gallery exit. The uploaded USA N64 ROM is preloaded. Storage remains local to the browser/device; clearing browser data removes progress. No virtual console controls or emulator toolbar are displayed.
