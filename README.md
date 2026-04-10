# utopiaintel

Next.js API endpoint that receives and parses game intel from utopia-game.com.

Parses: SoT, SoD, SoM, SoS, Survey, Infiltrate, Kingdom pages, and self-intel council pages. Stores structured data in SQLite with per-metric source and timestamp tracking.

Current stack:
- Next.js 16
- React 19
- SQLite via `better-sqlite3`

The UI includes:
- a kingdom list at `/`
- a kingdom page at `/kingdom/[loc]`
- a province detail page at `/kingdom/[loc]/[prov]`
- a gains matrix as a kingdom-page view mode via `/kingdom/[loc]?view=gains`

## Setup

```bash
nvm use
npm install
npm run dev
```

Quick validation while iterating:

```bash
npx tsc --noEmit
```

## Utopia Setup

After deploying, go to Preferences in Utopia, and set your "Send intel to your own Intel site" to point to your server's `/api/intel` endpoint.

NOTE: Contrary to what the UI says, no cookie gets set. Rather, two browser Local Storage keys get set: `custom_kdsite` and `custom_kdsite_key`. You can inspect/modify them in Chrome Dev Tools under the Application tab -> Local Storage -> utopia domain.

IMPORTANT: Ensure Ajax mode is disabled in the Bot Prefs in the game UI, otherwise the XHR request doesn't get sent reliably.

You can verify it in Chrome's Network tab in Developer Tools.

Current game URLs to expect:
- kingdom pages can arrive as `/wol/game/kingdom_details/<x>/<y>`
- thievery intel commonly arrives as `/wol/game/thievery?...&o=SPY_ON_*`

## Deploy to EC2

```bash
npm run build
rsync -avz --exclude=intel.db .next/standalone/ ecosystem.config.js utopiaintel:~/utopiaintel/
rsync -avz .next/static/ utopiaintel:~/utopiaintel/.next/static/
```

On the server:

```bash
cd ~/utopiaintel
# Recommended once: keep the live DB outside the deployed app directory
export INTEL_DB_PATH=/home/ec2-user/utopiaintel-data/intel.db
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # auto-start on reboot
```

For normal redeploys after the first setup:

```bash
ssh utopiaintel "pm2 reload utopiaintel"
```

Notes:
- The app now honors `INTEL_DB_PATH`. In production, point it at a path outside `~/utopiaintel` so deploys cannot overwrite the live SQLite file.
- Keep `--exclude=intel.db` on the standalone sync. Next's standalone output can include a copied SQLite file.

## Debug logging

Set `INTEL_DEBUG=1` to capture raw payloads to `intel_debug.jsonl`:

```bash
# Edit ecosystem.config.js to set INTEL_DEBUG: "1", then:
pm2 reload ecosystem.config.js --update-env
```
