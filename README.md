# utopiaintel

Next.js API endpoint that receives and parses game intel from utopia-game.com.

Parses: SoT, SoD, SoM, SoS, Survey, Kingdom pages. Stores structured data in SQLite with per-metric source and timestamp tracking.

## Setup

```bash
nvm use
npm install
npm run dev
```

## Utopia Setup

After deploying, go to Preferences in Utopia, and set your "Send intel to your own Intel site" to point to your server's `/api/intel` endpoint.

NOTE: Contrary to what the UI says, no cookie gets set. Rather, two browser Local Storage keys get set: `custom_kdsite` and `custom_kdsite_key`. You can inspect/modify them in Chrome Dev Tools under the Application tab -> Local Storage -> utopia domain.

IMPORTANT: Ensure Ajax mode is disabled in the Bot Prefs in the game UI, otherwise the XHR request doesn't get sent reliably.

You can verify it in Chrome's Network tab in Developer Tools.

## Deploy to EC2

```bash
npm run build
rsync -avz .next/standalone/ ecosystem.config.js utopiaintel:~/utopiaintel/
rsync -avz .next/static/ utopiaintel:~/utopiaintel/.next/static/
```

On the server:

```bash
cd ~/utopiaintel
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # auto-start on reboot
```

## Debug logging

Set `INTEL_DEBUG=1` to capture raw payloads to `intel_debug.jsonl`:

```bash
# Edit ecosystem.config.js to set INTEL_DEBUG: "1", then:
pm2 reload ecosystem.config.js --update-env
```
