# Utopia Intel

Next.js API endpoint that receives game data from utopia-game.com.

## What this project does

- Collects Utopia intel automatically via `/api/intel` when kingdom members browse the game with "Send intel to your own Intel site" configured.
- Parses SoT, SoD, SoM, SoS, Survey, Infiltrate, Kingdom pages, and self-intel council pages such as state/science/military/internal.
- Stores intel in SQLite as timestamped records across separate domain tables rather than a single flat snapshot.
- Serves a private dashboard:
  - `/` lists kingdoms visible to the current key
  - `/kingdom/[loc]` shows a kingdom province table
  - `/kingdom/[loc]/[prov]` shows detailed intel for one province
- Partitions access by shared kingdom key. Users log in with the key, the app hashes it, and read queries only return provinces associated with that hash.
- Computes derived T/M metrics such as `rTPA`, `mTPA`, `oTPA`, `dTPA`, `rWPA`, and `mWPA` from stored intel, with same-tick requirements for validity.
- Uses direct wizard counts for self-intel WPA when available; enemy WPA is inferred from networth residuals (wizards are never directly visible on enemy provinces).
- Deletes old intel after 7 days.

## Setup

```bash
nvm use
npm install
```

## Dev server

```bash
npm run dev
```

For quick validation while iterating, prefer:

```bash
npx tsc --noEmit
```

Use a full `npm run build` when you specifically need production validation.

## Test the endpoint

```bash
curl -X POST http://localhost:3000/api/intel \
  --data-urlencode "data_html=<b>test</b>" \
  --data-urlencode "data_simple=test" \
  --data-urlencode "url=https://utopia-game.com/wol/game/test" \
  --data-urlencode "prov=TestProvince" \
  --data-urlencode "key=abc123"
```

Should return `{"success":true,"parsed":false,...}` (test data won't match a real intel type).

## Debug logging

Capture raw payloads (no data_html) for test development:

```bash
INTEL_DEBUG=1 npm run dev     # dev
INTEL_DEBUG=1 npm start       # prod
```

Writes JSONL to `intel_debug.jsonl` by default and rotates it in-app. Use
`INTEL_DEBUG_PATH` in production so the log lives outside the deployed app tree.

## Privacy

Do not store real province names, kingdom names, or player names in source code, comments, commit messages, or test fixtures. Use generic placeholders (e.g. "TestProvince", "7:5") instead. Real game data lives only in `intel.db` and `intel_debug.jsonl`, which are gitignored.

## Utopia time

1 Utopia day (also called a tick) = 1 real-world hour. Army ETAs, spell durations, and other game timers are expressed in Utopia days/ticks. When converting between game days and wall-clock time, use 3_600_000 ms per day (not 86_400_000).

## Code style

- Prefer reusing existing utilities over duplicating logic. For example, use `parseUtc` from `lib/ui.ts` wherever SQLite timestamps need parsing, rather than reimplementing the `replace(" ", "T") + "Z"` pattern inline.

## Implementation notes

- A self `/wol/game/throne` submission is the authoritative source for binding `key_hash -> kingdom`.
- The bound-kingdom redirect should happen from login only. Keep `/` browsable so users can still navigate to other kingdoms.
- Current spy/thievery intel commonly arrives as `/wol/game/thievery?...&o=SPY_ON_*`; detection must inspect the `o` query param, not only the pathname.
- Intel op naming: SoT = Spy on Throne (`o=SPY_ON_THRONE`); SoD = Spy on Defense (`o=SPY_ON_DEFENSE`); SoM = Spy on Military (`o=SPY_ON_MILITARY`); SoS = Science Spy (Survey op, `o=SURVEY`); Infiltrate = Infiltrate Thieves' Guilds (`o=INFILTRATE`).
- What each op reveals about an enemy province: SoT gives troops (soldiers, specs, elites, peasants, war horses), money, food, runes, prisoners, trade balance, building efficiency, off/def points — but **not** thieves, stealth, or wizards (shown as "Unknown"). The "Number of thieves / Stealth X%" shown at the bottom of every thievery op page is your *own* thievery stats, not the target's. Infiltrate gives only the enemy thieves count (no stealth). Stealth is never revealed for enemy provinces; only available from self-state (throne page). Wizards are never directly measurable on enemy provinces; they must be inferred from NW residuals. SoS gives science books and effect percentages only (no troop or resource data).
- Utopia kingdom pages can arrive as `/wol/game/kingdom_details/<x>/<y>`, not just bare `/wol/game/kingdom_details`.
- This repo is on Next.js 16. Root request interception now uses `proxy.ts`, not `middleware.ts`.
- The app supports `INTEL_DB_PATH`. In production, point it at a path outside `~/utopiaintel` so the live SQLite file is not part of the deployed app tree.
- The real Utopia `Slot` value from `kingdom_details` is stored on `kingdom_provinces` and should be treated as data, not inferred from current table order.
- `scripts/replay-debug-log.ts` can replay local or production `intel_debug.jsonl` files, including rotated `.1`, `.2`, etc., into the local `intel.db` for one-off backfills such as kingdom slots, war losses, or direct survey effects.
- For modern logs that already carry `key_hash`, use `--key-hash=<sha256>` to replay only entries explicitly tagged for that shard.
- `--assume-key-hash=<sha256>` is the fallback for older unkeyed logs. It applies untagged entries to the assumed shard, so looping it across every key is a broad all-to-all backfill, not strict per-key replay.
- Gains are a same-page kingdom view, switched with `/kingdom/[loc]?view=gains`, rather than a separate standalone page.
- Gains calculations use the latest accessible `kingdom_details` snapshots for both self and target kingdom average NW.
- Gains currently model directional relation modifiers plus war-vs-out-of-war MAP behavior. The remaining assumptions are exposed in the top `Assumptions` pill in gains view.
- The gains matrix header uses a dedicated sticky header layer above the scrollable body; horizontal alignment is maintained by mirroring `scrollLeft` from the body container to the header container.
- When debugging live ingest or missing intel, the production source of truth is the live server DB and PM2 logs on `utopiaintel`, not the local workspace DB copy.
- Kingdom view tab strips (Province Table / Gains / Thievery / News / History) are shared via `KingdomTabs` in `app/kingdom/[loc]/KingdomTabs.tsx`. Add new tabs there; do not duplicate the strip across individual view components.
- When the same UI structure appears in more than two components, extract it into a shared component rather than duplicating. Duplicated UI diverges silently — a change or addition in one copy is missed in others.

## Build & deploy

```bash
npm test
npm run build
rsync -avz --exclude=intel.db .next/standalone/ utopiaintel:~/utopiaintel/
rsync -avz .next/static/ utopiaintel:~/utopiaintel/.next/static/
ssh utopiaintel "pm2 reload utopiaintel"
```

Keep that order strict. Reloading PM2 before both `rsync` steps finish can leave
production with mismatched server and static assets.
Keep `--exclude=intel.db` on the standalone sync: Next's standalone output can
contain a copied SQLite file, and syncing it will overwrite the live DB.
