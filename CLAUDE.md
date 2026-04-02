# Utopia Intel

Next.js API endpoint that receives game data from utopia-game.com browser extension.

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

Should return `{"success":true}`. Check `intel.jsonl` for logged data.

## Build & deploy

```bash
npm run build
# standalone output in .next/standalone/
```
