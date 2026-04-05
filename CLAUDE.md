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

## Build & deploy

```bash
npm run build
rsync -avz --exclude=intel.db .next/standalone/ ecosystem.config.js utopiaintel:~/utopiaintel/
rsync -avz .next/static/ utopiaintel:~/utopiaintel/.next/static/
ssh utopiaintel "cd ~/utopiaintel && pm2 reload ecosystem.config.js --update-env"
```
