import { getReplayTypes, hashReplayKey, replayDebugLogs } from "../lib/replay-debug-log";

function usage() {
  throw new Error(
    "Usage: tsx scripts/replay-debug-log.ts <jsonl...> [--types=kingdom,survey,sot,kingdom_news,state,som,train_army,build] [--key-hash=<sha256>] [--assume-key-hash=<sha256> | --assume-key=<raw key>] [--dry-run]",
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const typeArg = args.find((arg) => arg.startsWith("--types="));
  const keyHashArg = args.find((arg) => arg.startsWith("--key-hash="));
  const assumeKeyHashArg = args.find((arg) => arg.startsWith("--assume-key-hash="));
  const assumeRawKeyArg = args.find((arg) => arg.startsWith("--assume-key="));
  const dryRun = args.includes("--dry-run");
  const files = args.filter(
    (arg) =>
      !arg.startsWith("--types=") &&
      !arg.startsWith("--key-hash=") &&
      !arg.startsWith("--assume-key-hash=") &&
      !arg.startsWith("--assume-key=") &&
      arg !== "--dry-run",
  );
  if (files.length === 0) usage();

  const replayTypes = getReplayTypes(typeArg?.slice("--types=".length));
  const keyHash = keyHashArg?.slice("--key-hash=".length);
  const assumeKeyHash = assumeRawKeyArg
    ? hashReplayKey(assumeRawKeyArg.slice("--assume-key=".length))
    : assumeKeyHashArg?.slice("--assume-key-hash=".length);

  const summary = await replayDebugLogs({
    files,
    replayTypes,
    keyHash,
    assumeKeyHash,
    dryRun,
  });

  const byType = [...summary.byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${type}=${count}`)
    .join(" ");

  console.log(`lines=${summary.linesSeen} replayed=${summary.replayed} ${byType}`.trim());
}

void main();
