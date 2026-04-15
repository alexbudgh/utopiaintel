# utopiaintel

`utopiaintel` is a Next.js app for collecting, storing, and browsing Utopia intel.
It receives submitted game pages at `/api/intel`, parses them into structured data,
stores them in SQLite, and exposes kingdom- and province-level views for analysis.

Current stack:
- Next.js 16
- React 19
- SQLite via `better-sqlite3`

## What It Does

The app ingests and correlates:
- SoT
- SoD
- SoM
- SoS
- Survey
- Infiltrate
- Kingdom pages
- Kingdom news
- Self `council_state`
- Self `build`
- Self `train_army`

Stored intel is then surfaced through:
- `/`
  A kingdom list with freshness, relation badges, current ritual/dragon state, and a shortcut to your bound kingdom.
- `/kingdom/[loc]`
  The main kingdom page, with province table, gains view, and news view.
- `/kingdom/[loc]/[prov]`
  Province detail with overview, population estimate, military, resources, sciences, survey/buildings, armies, and active effects.
- `/login`
  Simple key-based sign-in.

## Data Model Notes

This app is not just a raw intel dump. It tracks intel by source and timestamp and then
derives the best currently-available view for each metric.

Examples:
- SoT is treated as the authoritative source for total unit counts, peasants, and most enemy resource values.
- SoM is used for home troops, OME/DME, outgoing armies, and training counts.
- `council_state` is used for direct self population values when available.
- `build` and `train_army` provide self-only free credits that are preserved even when later SoT rows omit them.
- Kingdom slot is stored from real `kingdom_details` intel and should be treated as data, not inferred from current display order.

The province table and detail page also compute derived values such as:
- estimated current/max population when direct values are unavailable
- overpopulation tiers
- raw/modified TPA and WPA when same-tick data exists
- ambush raw offense
- gains estimates against target provinces

## Main UI Features

### Home
- Lists all kingdoms visible to the current key.
- Highlights your bound kingdom.
- Shows freshness for each kingdom.
- Shows ritual and dragon badges.
- Surfaces relation context such as war, hostile, ceasefire, and open relations.

### Kingdom Page
- Default province table view.
- `?view=gains` gains matrix for self-vs-target province matchups.
- `?view=news` kingdom news explorer with summaries and charts.

Province table highlights:
- default sort is slot ascending
- per-column sorting with nulls pushed to the bottom
- multiple saved table views plus custom column selection
- pop%, offense/defense, troop splits, resources, T/M estimates, spells, freshness, and incoming army summaries

Gains view highlights:
- uses the latest accessible self and target kingdom snapshots
- estimates traditional march acres
- models relation modifiers, war vs out-of-war MAP behavior, castles, barrier ritual, and siege science
- shows breakability hints and exposes calculation assumptions in tooltips

News view highlights:
- parses combat, relations, dragon, ritual, and aid events
- supports `from` / `to` filtering
- summarizes incoming/outgoing totals and unique attackers
- links directly to related kingdoms and provinces when names are known

### Province Detail
- overview card with race, personality, honor, land, networth, peasants, and population estimate/direct values
- military card combining SoT units, total military points, home military, and SoM armies
- resources and credits
- sciences and survey/building breakdown
- effect grouping for good spells, bad spells, thievery effects, and rituals
- auto-refresh while viewing a province

## Authentication Model

Sign-in is key-based:
- the login form stores the kingdom key in an `auth` HTTP-only cookie
- the server hashes the key and uses the hash to partition accessible intel
- if a key has already been bound to a kingdom, login redirects directly there

The submitted intel payload also includes the raw key. The ingest route hashes it before storage/access checks.

## Local Setup

```bash
nvm use
npm install
npm run dev
```

Useful checks:

```bash
npx tsc --noEmit
npm test
```

`npm test` runs:
- parser tests
- DB/query tests
- gains tests
- population tests
- utility/lib tests

## Utopia Setup

After deploying, go to Preferences in Utopia and set "Send intel to your own Intel site"
to your server's `/api/intel` endpoint.

Current game URL patterns handled by the parser include:
- `/wol/game/throne`
- `/wol/game/kingdom_details/<x>/<y>`
- thievery op URLs such as `SPY_ON_*`
- self council/build/train pages used for direct self metrics

Notes:
- Contrary to what the in-game UI says, the browser setup uses local storage keys rather than a cookie:
  `custom_kdsite` and `custom_kdsite_key`
- These can be inspected or edited in browser dev tools under Local Storage for the Utopia domain.
- Ajax mode should be disabled in the game's bot preferences or the submission request may not fire reliably.

## API

### `POST /api/intel`

Expected form fields:
- `data_html`
- `data_simple`
- `url`
- `prov`
- `key`

Behavior:
- identifies the intel type from the submitted URL/content
- parses into structured data
- stores rows into the appropriate SQLite tables
- returns `{ success, parsed, type }`
- runs TTL cleanup periodically

If a payload is received but not recognized, the endpoint still returns success with `parsed: false`.

### `GET /api/kingdom/[loc]`

Returns the current province rows for a kingdom, filtered by the authenticated key.
This is used by the client-side province table refresh loop.

## Storage and Debugging

The app supports `INTEL_DB_PATH`.
In production, point it to a path outside the deployed app directory so redeploys cannot overwrite the live DB.

`INTEL_DEBUG=1` enables raw payload logging to `intel_debug.jsonl`:

```bash
pm2 reload ecosystem.config.js --update-env
```

Operational notes:
- the production source of truth is the live server DB, not a copied local `intel.db`
- keep `--exclude=intel.db` on deploy syncs
- `scripts/replay-debug-log.ts` can replay `intel_debug.jsonl` into a local DB for one-off backfills/debugging

## Deploy

Build and deploy in this order:

```bash
npm test
npm run build
rsync -avz --exclude=intel.db .next/standalone/ utopiaintel:~/utopiaintel/
rsync -avz .next/static/ utopiaintel:~/utopiaintel/.next/static/
ssh utopiaintel "pm2 reload utopiaintel"
```

Keep that order strict. Reloading PM2 before both `rsync` steps finish can leave
production with mismatched server and static assets.

First-time server setup:

```bash
cd ~/utopiaintel
export INTEL_DB_PATH=/home/ec2-user/utopiaintel-data/intel.db
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Current PM2 env in `ecosystem.config.js` includes:
- `HOSTNAME=127.0.0.1`
- `INTEL_DB_PATH=/home/ec2-user/utopiaintel-data/intel.db`
- `INTEL_DEBUG=0`

## Repo Notes

- Gains are a same-page kingdom view at `/kingdom/[loc]?view=gains`, not a separate standalone page.
- News is a same-page kingdom view at `/kingdom/[loc]?view=news`.
- The app assumes access control through intel partitioning by hashed key.
- The kingdom page can render partial data when only some intel types are available.
