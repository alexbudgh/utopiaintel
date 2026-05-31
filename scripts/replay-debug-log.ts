import { basename } from "node:path";
import {
  getReplayTypes,
  hashReplayKey,
  replayDebugLogs,
} from "../lib/replay-debug-log";
import { pool } from "../lib/db-mysql-pool";

function usage() {
  throw new Error(
    "Usage: tsx scripts/replay-debug-log.ts <jsonl...> [--types=kingdom,survey,sot,kingdom_news,state,som,sos,sod,infiltrate,train_army,build,rob,sorcery,attack,province_logs] [--key-hash=<sha256>] [--assume-key-hash=<sha256> | --assume-key=<raw key>] [--dry-run] [--refresh-metrics]",
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const typeArg = args.find((arg) => arg.startsWith("--types="));
  const keyHashArg = args.find((arg) => arg.startsWith("--key-hash="));
  const assumeKeyHashArg = args.find((arg) =>
    arg.startsWith("--assume-key-hash="),
  );
  const assumeRawKeyArg = args.find((arg) => arg.startsWith("--assume-key="));
  const dryRun = args.includes("--dry-run");
  const refreshMetrics = args.includes("--refresh-metrics");
  const files = args.filter(
    (arg) =>
      !arg.startsWith("--types=") &&
      !arg.startsWith("--key-hash=") &&
      !arg.startsWith("--assume-key-hash=") &&
      !arg.startsWith("--assume-key=") &&
      arg !== "--dry-run" &&
      arg !== "--refresh-metrics",
  );
  if (files.length === 0) usage();

  const replayTypes = getReplayTypes(typeArg?.slice("--types=".length));
  const keyHash = keyHashArg?.slice("--key-hash=".length);
  const assumeKeyHash = assumeRawKeyArg
    ? hashReplayKey(assumeRawKeyArg.slice("--assume-key=".length))
    : assumeKeyHashArg?.slice("--assume-key-hash=".length);

  const startMs = Date.now();
  const summary = await replayDebugLogs({
    files,
    replayTypes,
    keyHash,
    assumeKeyHash,
    dryRun,
    refreshMetrics,
    onProgress(seen, replayed, file) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      const base = basename(file);
      process.stderr.write(
        `\r  ${base}  lines=${seen}  replayed=${replayed}  ${elapsed}s  `,
      );
    },
  });
  if (process.stderr.isTTY) process.stderr.write("\r\x1b[K");

  const byType = [...summary.byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${type}=${count}`)
    .join(" ");

  console.log(
    `lines=${summary.linesSeen} replayed=${summary.replayed} ${byType}`.trim(),
  );
  await pool.end();
}

void main();
