# Utopia Intel

Next.js API endpoint that receives game data from utopia-game.com.

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

## Build & deploy

```bash
npm run build
rsync -avz .next/standalone/ ecosystem.config.js utopiaintel:~/utopiaintel/
ssh utopiaintel "cd ~/utopiaintel && pm2 start ecosystem.config.js"
```
