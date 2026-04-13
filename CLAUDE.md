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
- Uses direct wizard counts for self-intel WPA when available; enemy WPA may be inferred from networth residuals.
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

Writes to `intel_debug.jsonl`.

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
- Utopia kingdom pages can arrive as `/wol/game/kingdom_details/<x>/<y>`, not just bare `/wol/game/kingdom_details`.
- This repo is on Next.js 16. Root request interception now uses `proxy.ts`, not `middleware.ts`.
- The app supports `INTEL_DB_PATH`. In production, point it at a path outside `~/utopiaintel` so the live SQLite file is not part of the deployed app tree.
- The real Utopia `Slot` value from `kingdom_details` is stored on `kingdom_provinces` and should be treated as data, not inferred from current table order.
- `scripts/replay-debug-log.ts` can replay local or production `intel_debug.jsonl` files into the local `intel.db` for one-off backfills such as kingdom slots or direct survey effects.
- Gains are a same-page kingdom view, switched with `/kingdom/[loc]?view=gains`, rather than a separate standalone page.
- Gains calculations use the latest accessible `kingdom_details` snapshots for both self and target kingdom average NW.
- Gains currently model directional relation modifiers plus war-vs-out-of-war MAP behavior. The remaining assumptions are exposed in the top `Assumptions` pill in gains view.
- The gains matrix header uses a dedicated sticky header layer above the scrollable body; horizontal alignment is maintained by mirroring `scrollLeft` from the body container to the header container.
- When debugging live ingest or missing intel, the production source of truth is the live server DB and PM2 logs on `utopiaintel`, not the local workspace DB copy.

## Build & deploy

```bash
npm run build
rsync -avz --exclude=intel.db .next/standalone/ utopiaintel:~/utopiaintel/
rsync -avz .next/static/ utopiaintel:~/utopiaintel/.next/static/
ssh utopiaintel "pm2 reload utopiaintel"
```

Keep that order strict. Reloading PM2 before both `rsync` steps finish can leave
production with mismatched server and static assets.
Keep `--exclude=intel.db` on the standalone sync: Next's standalone output can
contain a copied SQLite file, and syncing it will overwrite the live DB.
