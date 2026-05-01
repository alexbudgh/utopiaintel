# Operations

Operational notes for storage, debug logging, replay, deployment, and PM2
environment handling.

## Storage and Debugging

The app supports `INTEL_DB_PATH`.
In production, point it to a path outside the deployed app directory so redeploys cannot overwrite the live DB.

`INTEL_DEBUG=1` enables raw payload logging to JSONL. The app rotates the active
file itself.

```bash
pm2 reload ecosystem.config.js --update-env
```

Operational notes:
- keep `--exclude=intel.db` on deploy syncs
- set `INTEL_DEBUG_PATH` outside the deployed app directory in production, e.g. `/home/ec2-user/utopiaintel-data/intel_debug.jsonl`
- optional rotation env vars:
  `INTEL_DEBUG_MAX_BYTES` and `INTEL_DEBUG_MAX_FILES`
- `npm run replay-debug-log -- <jsonl...>` replays one or more debug log files into the DB pointed to by `INTEL_DB_PATH`
- new debug log entries include `key_hash`, so future prod backfills can preserve intel partitioning safely
- older mixed-key prod logs without `key_hash` are ambiguous; for those, replay is only safe when the target DB has one key or you explicitly pass `--key-hash=...`

Replay examples:

```bash
# Local one-off replay
npm run replay-debug-log -- ./intel_debug.jsonl --types=kingdom

# Filter to only entries already tagged with this key_hash
INTEL_DB_PATH=/home/ec2-user/utopiaintel-data/intel.db \
npm run replay-debug-log -- /home/ec2-user/utopiaintel/intel_debug.jsonl --types=kingdom --key-hash=<sha256>

# Older log without key_hash: explicitly assume a key for unkeyed entries
INTEL_DB_PATH=/home/ec2-user/utopiaintel-data/intel.db \
npm run replay-debug-log -- /home/ec2-user/utopiaintel/intel_debug.jsonl --types=kingdom --assume-key-hash=<sha256>

# Future prod-safe replay once intel_debug.jsonl contains key_hash
INTEL_DB_PATH=/home/ec2-user/utopiaintel-data/intel.db \
npm run replay-debug-log -- /home/ec2-user/utopiaintel/intel_debug.jsonl --types=kingdom

# Replay active plus rotated files
INTEL_DB_PATH=/home/ec2-user/utopiaintel-data/intel.db \
npm run replay-debug-log -- \
  /home/ec2-user/utopiaintel-data/intel_debug.jsonl \
  /home/ec2-user/utopiaintel-data/intel_debug.jsonl.1 \
  /home/ec2-user/utopiaintel-data/intel_debug.jsonl.2 \
  --types=kingdom
```

Production backfill setup:

```bash
ssh utopiaintel
cd ~/utopiaintel-src
npm ci
```

That source checkout is the right place to run replay and other one-off maintenance scripts.
Prefer installing dependencies there once instead of borrowing `~/utopiaintel/node_modules`
through `NODE_PATH`.

Example production replay:

```bash
ssh utopiaintel
cd ~/utopiaintel-src
export INTEL_DB_PATH=/home/ec2-user/utopiaintel-data/intel.db
npm run replay-debug-log -- ~/utopiaintel/intel_debug.jsonl --types=kingdom
```

## Deploy

Build and deploy in this order:

```bash
npm test
npm run build
rsync -avz --exclude=intel.db .next/standalone/ utopiaintel:~/utopiaintel/
rsync -avz .next/static/ utopiaintel:~/utopiaintel/.next/static/
scp ecosystem.config.js utopiaintel:~/utopiaintel/
ssh utopiaintel "pm2 reload ~/utopiaintel/ecosystem.config.js"
```

Keep that order strict. Reloading PM2 before both `rsync` steps finish can leave
production with mismatched server and static assets.

The GitHub Deploy workflow uses the same production reload pattern: it copies
`ecosystem.config.js` to the server and reloads PM2 through that file. This
keeps the PM2-managed environment together with the deployed code.

For the test instance, use the test ecosystem config:

```bash
rsync -avz --exclude=intel.db .next/standalone/ utopiaintel:~/utopiaintel-test/
rsync -avz .next/static/ utopiaintel:~/utopiaintel-test/.next/static/
scp ecosystem.test.config.js utopiaintel:~/utopiaintel-test/ecosystem.config.js
ssh utopiaintel "pm2 reload ~/utopiaintel-test/ecosystem.config.js"
```

The test config uses app name `utopiaintel-test`, `PORT=3001`, `STAGING=true`,
blank Axiom token/dataset values, and `INTEL_DEBUG=0`.

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
- `INTEL_DEBUG_PATH=/home/ec2-user/utopiaintel-data/intel_debug.jsonl`
- `INTEL_DEBUG_MAX_BYTES=10485760`
- `INTEL_DEBUG_MAX_FILES=5`

Use the ecosystem file whenever changing process environment. A plain app-name
reload is fine for code-only reloads:

```bash
pm2 reload utopiaintel
```

Do not use `pm2 reload utopiaintel --update-env` / `-a` with only ad hoc shell
variables. That can refresh the process env without re-reading
`ecosystem.config.js`, dropping config-managed values such as
`HOSTNAME=127.0.0.1` and `INTEL_DB_PATH`. For a temporary debug toggle, use:

```bash
INTEL_DEBUG=1 pm2 reload ~/utopiaintel/ecosystem.config.js --update-env
```

If `INTEL_DB_PATH` is not set, the app falls back to `intel.db` in the current
working directory. In standalone deploys, `server.js` changes cwd to the app
directory, so the fallback would be `~/utopiaintel/intel.db`, not the durable
production DB path.

