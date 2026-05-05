// Summarize a V8 .cpuprofile: top hotspots by self-time with call stacks.
// Usage: node scripts/analyze-cpuprofile.mjs <file.cpuprofile> [--top=N]
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
const topN = parseInt(args.find((a) => a.startsWith("--top="))?.slice(6) ?? "15", 10);

if (!filePath) {
  console.error("Usage: node scripts/analyze-cpuprofile.mjs <file.cpuprofile> [--top=N]");
  process.exit(1);
}

const profile = JSON.parse(readFileSync(filePath, "utf8"));
const { nodes, samples, timeDeltas } = profile;

// Total wall time in ms
const totalMs = timeDeltas.reduce((s, d) => s + d, 0) / 1000;

// Self-time: count samples landing on each node
const selfCounts = new Map();
for (const id of samples) selfCounts.set(id, (selfCounts.get(id) ?? 0) + 1);

// Build parent map and node map
const nodeMap = new Map(nodes.map((n) => [n.id, n]));
const parentOf = new Map();
for (const node of nodes) {
  for (const child of node.children ?? []) parentOf.set(child, node.id);
}

// Walk ancestors for a node, returning frames from leaf to root
function callStack(id) {
  const frames = [];
  let cur = id;
  while (cur) {
    const n = nodeMap.get(cur);
    if (!n) break;
    frames.push(n.callFrame);
    cur = parentOf.get(cur);
  }
  return frames;
}

function formatFrame(cf) {
  const fn = cf.functionName || "(anonymous)";
  const url = cf.url
    .replace(/^file:\/\//, "")
    .replace(/^.*utopiaintel\//, "")   // trim common prefix
    .replace(/^.*node_modules\//, "node_modules/");
  if (!url) return fn;
  const loc = cf.lineNumber >= 0 ? `:${cf.lineNumber}` : "";
  return `${fn}  (${url}${loc})`;
}

// Idle sample IDs (functionName === "(idle)")
const idleIds = new Set(nodes.filter((n) => n.callFrame.functionName === "(idle)").map((n) => n.id));
const activeMs = (samples.filter((id) => !idleIds.has(id)).length / samples.length) * totalMs;

console.log(`\nProfile: ${filePath}`);
console.log(`Wall time: ${totalMs.toFixed(0)} ms   Active: ${activeMs.toFixed(0)} ms   Idle: ${((1 - activeMs / totalMs) * 100).toFixed(1)}%`);
console.log(`Samples: ${samples.length}   (~${(totalMs / samples.length).toFixed(2)} ms/sample)\n`);

// Sort by self-time descending, skip (root)/(idle)/GC noise for display
const SKIP = new Set(["(root)", "(idle)", "(garbage collector)", "(program)"]);
const ranked = [...selfCounts.entries()]
  .filter(([id]) => {
    const n = nodeMap.get(id);
    return n && !SKIP.has(n.callFrame.functionName);
  })
  .sort((a, b) => b[1] - a[1])
  .slice(0, topN);

console.log(`Top ${topN} nodes by self-time:\n`);
for (const [id, count] of ranked) {
  const selfMs = (count / samples.length) * totalMs;
  const pct = ((selfMs / activeMs) * 100).toFixed(1);
  const stack = callStack(id);
  console.log(`  ${selfMs.toFixed(0).padStart(6)} ms  (${pct.padStart(5)}% of active)  ${formatFrame(stack[0])}`);
  for (const cf of stack.slice(1, 5)) {
    const fn = cf.functionName || "(anonymous)";
    if (SKIP.has(fn)) break;
    console.log(`  ${"".padStart(10)}    <- ${formatFrame(cf)}`);
  }
  console.log();
}
