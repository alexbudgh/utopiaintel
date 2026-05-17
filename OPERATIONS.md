# Operations

Operational notes for MySQL storage, debug logging, replay, deployment, and
PM2 environment handling.

## Storage and Debugging

Runtime storage is MySQL. The PM2 ecosystem file supplies `DB_DRIVER=mysql`,
`DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_NAME`. Local maintenance scripts use
the same environment variables, plus `DB_PASSWORD` when the target server
requires it.

`INTEL_DEBUG=1` enables raw payload logging to JSONL. The app rotates the active
file itself.

```bash
pm2 reload ecosystem.config.js --update-env
```

Operational notes:

- set `INTEL_DEBUG_PATH` outside the deployed app directory in production, e.g. `/home/ec2-user/utopiaintel-data/intel_debug.jsonl`
- optional rotation env vars:
  `INTEL_DEBUG_MAX_BYTES` and `INTEL_DEBUG_MAX_FILES`
- `npm run replay-debug-log -- <jsonl...>` replays one or more debug log files into the configured MySQL database
- replay skips metric-cache refreshes by default; pass `--refresh-metrics` when the backfill should recompute cached derived metrics as it runs
- new debug log entries include `key_hash`, so future prod backfills can preserve intel partitioning safely
- older mixed-key prod logs without `key_hash` are ambiguous; for those, replay is only safe when the target DB has one key or you explicitly pass `--key-hash=...`

Replay examples:

```bash
# Local one-off replay into the default local database
npm run replay-debug-log -- ./intel_debug.jsonl --types=kingdom

# Replay locally while pointing at another MySQL host or forwarded port
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=utopiaintel DB_NAME=utopiaintel \
npm run replay-debug-log -- ./intel_debug.jsonl --types=kingdom

# Filter to only entries already tagged with this key_hash
npm run replay-debug-log -- ./intel_debug.jsonl --types=kingdom --key-hash=<sha256>

# Older log without key_hash: explicitly assume a key for unkeyed entries
npm run replay-debug-log -- ./intel_debug.jsonl --types=kingdom --assume-key-hash=<sha256>

# Future prod-safe replay once intel_debug.jsonl contains key_hash
npm run replay-debug-log -- ./intel_debug.jsonl --types=kingdom

# Replay active plus rotated files
npm run replay-debug-log -- \
  /home/ec2-user/utopiaintel-data/intel_debug.jsonl \
  /home/ec2-user/utopiaintel-data/intel_debug.jsonl.1 \
  /home/ec2-user/utopiaintel-data/intel_debug.jsonl.2 \
  --types=kingdom
```

Replay and backfill scripts can run from a local checkout as long as the target
MySQL server is reachable. For production data, use an SSH tunnel or another
restricted network path, then point `DB_HOST` and `DB_PORT` at that connection.

```bash
ssh -N -L 3307:127.0.0.1:3306 utopiaintel
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=utopiaintel DB_NAME=utopiaintel \
npm run replay-debug-log -- ./intel_debug.jsonl --types=province_logs
```

Running scripts on the server is still fine when the debug log is only present
there, but it is not required by the MySQL storage model.

## Deploy

Build and deploy in this order:

```bash
npm test
npm run build
rsync -avz .next/standalone/ utopiaintel:~/utopiaintel/
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
rsync -avz .next/standalone/ utopiaintel:~/utopiaintel-test/
rsync -avz .next/static/ utopiaintel:~/utopiaintel-test/.next/static/
scp ecosystem.test.config.js utopiaintel:~/utopiaintel-test/ecosystem.config.js
ssh utopiaintel "pm2 reload ~/utopiaintel-test/ecosystem.config.js"
```

The test config uses app name `utopiaintel-test`, `PORT=3001`, `STAGING=true`,
blank Axiom token/dataset values, and `INTEL_DEBUG=0`.

First-time server setup:

```bash
cd ~/utopiaintel
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Current PM2 env in `ecosystem.config.js` includes:

- `HOSTNAME=127.0.0.1`
- `DB_DRIVER=mysql`
- `DB_HOST=localhost`
- `DB_PORT=3306`
- `DB_USER=utopiaintel`
- `DB_NAME=utopiaintel`
- `INTEL_DEBUG=1`
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
`HOSTNAME=127.0.0.1` and `DB_DRIVER=mysql`. For a temporary debug toggle, use:

```bash
INTEL_DEBUG=1 pm2 reload ~/utopiaintel/ecosystem.config.js --update-env
```
