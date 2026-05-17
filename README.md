![CI](https://github.com/alexbudgh/utopiaintel/actions/workflows/ci.yml/badge.svg)

# utopiaintel

`utopiaintel` is a Next.js app for collecting, storing, and browsing Utopia intel.
It receives submitted game pages at `/api/intel`, parses them into structured data,
stores them in MySQL, and exposes kingdom- and province-level views for analysis.

Current stack:

- Next.js 16
- React 19
- MySQL via `mysql2`

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
  The main kingdom page, with province table, gains, thievery, news, and history views.
- `/kingdom/[loc]/[prov]`
  Province detail with overview, population estimate, military, resources, sciences, survey/buildings, armies, and active effects.
- `/login`
  Simple key-based sign-in.

## Data Model Notes

This app is not just a raw intel dump. It tracks intel by source and timestamp and then
derives the best currently-available view for each metric.

For details on province identity, source-of-truth rules, key partitions, kingdom
slots, and replay backfills, see [ARCHITECTURE.md](./ARCHITECTURE.md).

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
- `?view=thievery` thievery intel overview.
- `?view=news` kingdom news explorer with summaries and charts.
- `?view=history` NW/land/honor snapshot chart over time.

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
- the server hashes the key before storage and access checks
- if a key has already been bound to a kingdom, login redirects directly there

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how `key_hash`,
`intel_partitions`, and bound kingdoms interact.

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
- stores rows into the appropriate MySQL tables
- returns `{ success, parsed, type }`
- runs TTL cleanup periodically

If a payload is received but not recognized, the endpoint still returns success with `parsed: false`.

### `GET /api/kingdom/[loc]`

Returns province rows, kingdom snapshot, relation contexts, dragon, and ritual for a kingdom, filtered by the authenticated key.
Used by the client-side polling loop to refresh the kingdom header and province table on all tab views.

## Operations

Deployment, PM2 environment handling, debug logs, and replay/backfill commands
live in [OPERATIONS.md](./OPERATIONS.md).

## Repo Notes

- The app assumes access control through intel partitioning by hashed key.
- The kingdom page can render partial data when only some intel types are available.
