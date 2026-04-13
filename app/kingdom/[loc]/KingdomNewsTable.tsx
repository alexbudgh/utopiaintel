"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from "recharts";
import type { KingdomNewsRow, KingdomNewsSummary } from "@/lib/db";
import { parseUtopiaDate } from "@/lib/ui";

const TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: "Combat",    types: ["march", "ambush", "raze", "pillage", "loot", "failed_attack"] },
  { label: "Relations", types: ["war_declared", "ceasefire_proposed", "ceasefire_accepted", "ceasefire_broken", "ceasefire_withdrawn"] },
  { label: "Dragon",    types: ["dragon_by_us", "dragon_against_us", "dragon_slain"] },
  { label: "Ritual",    types: ["ritual_started"] },
  { label: "Aid",       types: ["aid"] },
];
const ALL_GROUPS = new Set(TYPE_GROUPS.map((g) => g.label));
const DEFAULT_GROUPS = new Set(TYPE_GROUPS.map((g) => g.label).filter((l) => l !== "Aid"));

const EVENT_LABEL: Record<string, string> = {
  march:               "Trad. March",
  ambush:              "Ambush",
  raze:                "Raze",
  pillage:             "Pillage",
  loot:                "Loot",
  failed_attack:       "Failed",
  aid:                 "Aid",
  war_declared:        "War",
  ceasefire_proposed:  "NAP Proposed",
  ceasefire_accepted:  "NAP Accepted",
  ceasefire_broken:    "NAP Broken",
  ceasefire_withdrawn: "NAP Withdrawn",
  dragon_by_us:        "Dragon",
  dragon_against_us:   "Dragon",
  dragon_slain:        "Dragon Slain",
  ritual_started:      "Ritual",
};

const DIR_BADGE = {
  out:     "border-green-500/40 bg-green-500/10 text-green-300",
  in:      "border-red-500/40 bg-red-500/10 text-red-300",
  neutral: "border-gray-600 bg-gray-800/40 text-gray-400",
};

function EventDescription({ event }: { event: KingdomNewsRow }) {
  const { eventType, attackerName, attackerKingdom, defenderName, defenderKingdom, acres, books, senderName, receiverName, relationKingdom, dragonType, dragonName } = event;

  function KdLink({ name, kingdom }: { name: string | null; kingdom: string | null }) {
    if (!kingdom) return <span className="text-gray-300">{name ?? "Unknown"}</span>;
    return (
      <Link href={`/kingdom/${encodeURIComponent(kingdom)}`} className="text-blue-300 hover:text-blue-200 transition-colors">
        {name ?? kingdom}{name && <span className="text-gray-500 font-mono text-[11px]"> ({kingdom})</span>}
      </Link>
    );
  }

  // Province reference: shows "Unknown province (kd)" when name is null
  function ProvLink({ name, kingdom }: { name: string | null; kingdom: string | null }) {
    if (!kingdom) return <span className="text-gray-300">{name ?? "Unknown province"}</span>;
    if (!name) return (
      <span>
        <span className="text-gray-500 italic">Unknown province</span>{" "}
        <Link href={`/kingdom/${encodeURIComponent(kingdom)}`} className="text-blue-300 hover:text-blue-200 transition-colors font-mono text-[11px]">({kingdom})</Link>
      </span>
    );
    return (
      <Link href={`/kingdom/${encodeURIComponent(kingdom)}/${encodeURIComponent(name)}`} className="text-gray-300 hover:text-blue-200 transition-colors">
        {name}<span className="text-gray-500 font-mono text-[11px]"> ({kingdom})</span>
      </Link>
    );
  }

  if (eventType === "march") {
    return (
      <span>
        <ProvLink name={attackerName} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">→</span>{" "}
        <ProvLink name={defenderName} kingdom={defenderKingdom} />
        {acres != null && <span className="text-gray-400"> · {acres.toLocaleString()}a</span>}
      </span>
    );
  }

  if (eventType === "ambush" || eventType === "pillage") {
    const verb = eventType === "pillage" ? "pillaged" : "ambushed";
    return (
      <span>
        <ProvLink name={attackerName} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">{verb}</span>{" "}
        <ProvLink name={defenderName} kingdom={defenderKingdom} />
        {acres != null && <span className="text-gray-400"> · {acres.toLocaleString()}a</span>}
      </span>
    );
  }

  if (eventType === "raze") {
    return (
      <span>
        <ProvLink name={attackerName} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">razed</span>{" "}
        <ProvLink name={defenderName} kingdom={defenderKingdom} />
        {acres != null && <span className="text-gray-400"> · {acres.toLocaleString()}a</span>}
      </span>
    );
  }

  if (eventType === "loot") {
    return (
      <span>
        <ProvLink name={attackerName} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">looted</span>{" "}
        <ProvLink name={defenderName} kingdom={defenderKingdom} />
        {books != null && <span className="text-gray-400"> · {books.toLocaleString()} books</span>}
      </span>
    );
  }

  if (eventType === "failed_attack") {
    return (
      <span>
        <ProvLink name={attackerName} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">→ failed</span>{" "}
        <ProvLink name={defenderName} kingdom={defenderKingdom} />
      </span>
    );
  }

  if (eventType === "aid") {
    return (
      <span>
        <span className="text-gray-300">{senderName}</span>
        <span className="text-gray-500"> → </span>
        <span className="text-gray-300">{receiverName}</span>
      </span>
    );
  }

  if (eventType === "war_declared") {
    return (
      <span>
        <span className="text-gray-500">We declared war on </span>
        <KdLink name={null} kingdom={relationKingdom} />
      </span>
    );
  }

  if (eventType === "ceasefire_proposed") {
    return (
      <span>
        <span className="text-gray-500">We proposed NAP to </span>
        <KdLink name={null} kingdom={relationKingdom} />
      </span>
    );
  }

  if (eventType === "ceasefire_accepted") {
    return (
      <span>
        <KdLink name={null} kingdom={relationKingdom} />{" "}
        <span className="text-gray-500">accepted our NAP</span>
      </span>
    );
  }

  if (eventType === "ceasefire_broken") {
    return (
      <span>
        <KdLink name={null} kingdom={relationKingdom} />{" "}
        <span className="text-gray-500">broke ceasefire</span>
      </span>
    );
  }

  if (eventType === "ceasefire_withdrawn") {
    return (
      <span>
        <span className="text-gray-500">We withdrew NAP offer to </span>
        <KdLink name={null} kingdom={relationKingdom} />
      </span>
    );
  }

  if (eventType === "dragon_by_us") {
    return (
      <span>
        <span className="text-gray-500">Our {dragonType} Dragon </span>
        <span className="text-rose-300">{dragonName}</span>
        <span className="text-gray-500"> → </span>
        <KdLink name={null} kingdom={relationKingdom} />
      </span>
    );
  }

  if (eventType === "dragon_against_us") {
    return (
      <span>
        <KdLink name={null} kingdom={relationKingdom} />{" "}
        <span className="text-rose-300">{dragonType} Dragon {dragonName}</span>
        <span className="text-gray-500"> against us</span>
      </span>
    );
  }

  if (eventType === "dragon_slain") {
    return (
      <span>
        <span className="text-gray-500">Dragon </span>
        <span className="text-gray-300">{dragonName}</span>
        <span className="text-gray-500"> slain</span>
      </span>
    );
  }

  if (eventType === "ritual_started") {
    return (
      <span>
        <span className="text-gray-500">Ritual started: </span>
        <span className="text-purple-300">{dragonName}</span>
      </span>
    );
  }

  return <span className="text-gray-400">{event.rawText}</span>;
}

const COMBAT_TYPES_SET = new Set(["march","ambush","raze","pillage","loot","failed_attack"]);
const KD_COLORS = ["#60a5fa","#f87171","#34d399","#fbbf24","#a78bfa","#fb923c","#38bdf8","#f472b6"];

function buildChartData(events: KingdomNewsRow[], ourKingdom: string) {
  // Collect all kingdoms and dates involved in combat
  const kdSet = new Set<string>();
  const dateAcres = new Map<string, Map<string, number>>(); // date → kd → net delta

  for (const e of events) {
    if (!COMBAT_TYPES_SET.has(e.eventType) || e.acres == null) continue;
    const { attackerKingdom, defenderKingdom, acres, gameDate } = e;
    if (!attackerKingdom || !defenderKingdom) continue;
    kdSet.add(attackerKingdom);
    kdSet.add(defenderKingdom);
    if (!dateAcres.has(gameDate)) dateAcres.set(gameDate, new Map());
    const day = dateAcres.get(gameDate)!;
    day.set(attackerKingdom, (day.get(attackerKingdom) ?? 0) + acres);
    day.set(defenderKingdom, (day.get(defenderKingdom) ?? 0) - acres);
  }

  const kingdoms = [...kdSet].sort((a, b) => a === ourKingdom ? -1 : b === ourKingdom ? 1 : a.localeCompare(b));
  const dates = [...dateAcres.keys()].sort((a, b) => parseUtopiaDate(a) - parseUtopiaDate(b));

  // Build cumulative running net per kingdom
  const running = new Map<string, number>(kingdoms.map((k) => [k, 0]));
  const chartData = dates.map((date) => {
    const day = dateAcres.get(date)!;
    for (const kd of kingdoms) running.set(kd, (running.get(kd) ?? 0) + (day.get(kd) ?? 0));
    const point: Record<string, string | number> = { date };
    for (const kd of kingdoms) point[kd] = running.get(kd)!;
    return point;
  });

  return { chartData, kingdoms };
}

function NewsChart({ events, ourKingdom }: { events: KingdomNewsRow[]; ourKingdom: string }) {
  const { chartData, kingdoms } = useMemo(() => buildChartData(events, ourKingdom), [events, ourKingdom]);
  if (chartData.length === 0) return <div className="text-xs text-gray-500 py-4">No combat data to chart.</div>;

  return (
    <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} width={48}
            tickFormatter={(v) => v === 0 ? "0" : `${v > 0 ? "+" : ""}${(v/1000).toFixed(0)}k`} />
          <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 11, borderRadius: 6 }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(val, name) => { const n = Number(val); return [`${n > 0 ? "+" : ""}${n.toLocaleString()}a`, String(name)]; }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
          {kingdoms.map((kd, i) => (
            <Line key={kd} type="monotone" dataKey={kd} stroke={KD_COLORS[i % KD_COLORS.length]}
              dot={false} strokeWidth={kd === ourKingdom ? 2 : 1.5}
              strokeDasharray={kd === ourKingdom ? undefined : "4 2"} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function eventDirection(event: KingdomNewsRow, kingdom: string): "out" | "in" | null {
  const { eventType, attackerKingdom, defenderKingdom } = event;
  // Combat/march events: check which side is ours
  if (attackerKingdom || defenderKingdom) {
    if (attackerKingdom === kingdom) return "out";
    if (defenderKingdom === kingdom) return "in";
    return null;
  }
  // Relation/dragon events initiated by us
  if (["war_declared", "ceasefire_proposed", "ceasefire_withdrawn", "dragon_by_us", "ritual_started"].includes(eventType)) return "out";
  // Relation/dragon events initiated by them
  if (["ceasefire_accepted", "ceasefire_broken", "dragon_against_us", "dragon_slain"].includes(eventType)) return "in";
  return null;
}

const UTOPIA_MONTHS = ["January","February","March","April","May","June","July"];

interface DateParts { month: string; day: string; year: string }

function parseDateParts(s?: string): DateParts {
  if (!s) return { month: "", day: "", year: "" };
  const m = /^(\w+)\s+(\d+)\s+of\s+YR(\d+)$/i.exec(s.trim());
  if (!m) return { month: "", day: "", year: "" };
  return { month: m[1], day: m[2], year: m[3] };
}

function formatDateParts({ month, day, year }: DateParts): string {
  if (!month || !day || !year) return "";
  return `${month} ${day} of YR${year}`;
}

function DateSelector({ value, onChange }: { value: DateParts; onChange: (v: DateParts) => void }) {
  const sel = "rounded border border-gray-700 bg-gray-900 px-1.5 py-1 text-gray-300 focus:border-gray-500 focus:outline-none";
  return (
    <span className="inline-flex items-center gap-1">
      <select value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })} className={sel}>
        <option value="">Month</option>
        {UTOPIA_MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input
        type="number" min={1} max={24} value={value.day}
        onChange={(e) => onChange({ ...value, day: e.target.value })}
        placeholder="Day"
        className={`${sel} w-14`}
      />
      <span className="text-gray-600 text-[11px]">YR</span>
      <input
        type="number" min={0} value={value.year}
        onChange={(e) => onChange({ ...value, year: e.target.value })}
        placeholder="Yr"
        className={`${sel} w-12`}
      />
    </span>
  );
}

function NewsDateFilter({ kingdom, from, to, latestWarDate }: { kingdom: string; from?: string; to?: string; latestWarDate?: string }) {
  const router = useRouter();
  const [fromParts, setFromParts] = useState<DateParts>(() => parseDateParts(from));
  const [toParts,   setToParts]   = useState<DateParts>(() => parseDateParts(to));
  const [toLatest,  setToLatest]  = useState(!to);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ view: "news" });
    const f = formatDateParts(fromParts);
    const t = toLatest ? "" : formatDateParts(toParts);
    if (f) params.set("from", f);
    if (t) params.set("to",   t);
    router.push(`/kingdom/${encodeURIComponent(kingdom)}?${params.toString()}`);
  }

  function clear() {
    setFromParts({ month: "", day: "", year: "" });
    setToParts({   month: "", day: "", year: "" });
    setToLatest(true);
    router.push(`/kingdom/${encodeURIComponent(kingdom)}?view=news`);
  }

  const hasFilter = !!(from || to);
  const btnBase = "rounded border px-2.5 py-1 transition-colors";

  function setWarRange() {
    if (!latestWarDate) return;
    setFromParts(parseDateParts(latestWarDate));
    setToParts({ month: "", day: "", year: "" });
    setToLatest(true);
  }

  return (
    <form onSubmit={apply} className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      {latestWarDate && (
        <button type="button" onClick={setWarRange}
          className={`${btnBase} border-amber-700/60 bg-amber-950/30 text-amber-400 hover:border-amber-500 hover:text-amber-300`}>
          Since war
        </button>
      )}
      <span className="text-gray-500">Date range:</span>
      <DateSelector value={fromParts} onChange={setFromParts} />
      <span className="text-gray-600">–</span>
      {toLatest
        ? <button type="button" onClick={() => setToLatest(false)}
            className={`${btnBase} border-blue-700 bg-blue-950/40 text-blue-300 hover:border-blue-500`}>
            Latest
          </button>
        : <>
            <DateSelector value={toParts} onChange={setToParts} />
            <button type="button" onClick={() => { setToParts({ month: "", day: "", year: "" }); setToLatest(true); }}
              className={`${btnBase} border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300`}>
              Latest
            </button>
          </>
      }
      <button type="submit" className={`${btnBase} border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-400 hover:text-gray-100`}>
        Filter
      </button>
      {hasFilter && (
        <button type="button" onClick={clear} className="text-gray-500 hover:text-gray-300 transition-colors">
          ✕ clear
        </button>
      )}
    </form>
  );
}

export function KingdomNewsTable({ events, summary, kingdom, from, to, latestWarDate }: { events: KingdomNewsRow[]; summary: KingdomNewsSummary; kingdom: string; from?: string; to?: string; latestWarDate?: string }) {
  const [activeGroups, setActiveGroups] = useState<Set<string>>(DEFAULT_GROUPS);
  const [visibleCount, setVisibleCount] = useState(50);
  const [showChart, setShowChart] = useState(false);
  const [provFilter, setProvFilter] = useState("");
  const btnBase = "px-2.5 py-1 rounded text-xs border transition-colors";
  const btnActive = "border-blue-500 text-blue-300 bg-blue-950/40";
  const btnInactive = "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300";
  const kingdomHref = `/kingdom/${encodeURIComponent(kingdom)}`;
  const controls = (
    <div className="mb-4 flex items-center gap-1.5 flex-wrap">
      <Link href={kingdomHref} className={`${btnBase} ${btnInactive}`}>
        Province Table
      </Link>
      <Link href={`${kingdomHref}?view=gains`} className={`${btnBase} ${btnInactive}`}>
        Gains
      </Link>
      <span className={`${btnBase} ${btnActive}`}>News</span>
      <button type="button" onClick={() => setShowChart((v) => !v)}
        className={`${btnBase} ${showChart ? btnActive : btnInactive} ml-2`}>
        Chart
      </button>
    </div>
  );

  if (events.length === 0) {
    return (
      <>
        {controls}
        <NewsDateFilter kingdom={kingdom} from={from} to={to} latestWarDate={latestWarDate} />
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-5 py-6 text-sm text-gray-400">
          {(from || to)
            ? "No events in the selected date range."
            : "No news events recorded yet. Browse the kingdom news page in Utopia to submit intel."}
        </div>
      </>
    );
  }

  const oursKd = summary.byKingdom.find(k => k.kingdom === summary.ourKingdom);
  const net = oursKd
    ? oursKd.totalMarchAcresGained + oursKd.totalAmbushAcresGained - oursKd.totalMarchAcresLost - oursKd.totalAmbushAcresLost
    : 0;
  const hasSummary = summary.byKingdom.length > 0;

  function Num({ n, color }: { n: number; color: string }) {
    return n > 0 ? <span className={color}>{n.toLocaleString()}</span> : <span className="text-gray-700">—</span>;
  }

  return (
    <>
      {controls}
      <NewsDateFilter kingdom={kingdom} from={from} to={to} latestWarDate={latestWarDate} />

      {showChart && <NewsChart events={events} ourKingdom={summary.ourKingdom} />}

      {hasSummary && (
        <div className="mb-4">
          {/* Headline stats */}
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-gray-400">
            <span>March lost <span className="text-red-300 font-medium">{summary.totalMarchAcresIn.toLocaleString()}a</span></span>
            {(oursKd?.totalAmbushAcresLost ?? 0) > 0 && <><span>·</span><span>Ambush lost <span className="text-red-300 font-medium">{oursKd!.totalAmbushAcresLost.toLocaleString()}a</span></span></>}
            {summary.totalRazeAcresIn > 0 && <><span>·</span><span>Razed <span className="text-red-300 font-medium">{summary.totalRazeAcresIn.toLocaleString()}a</span></span></>}
            <span>·</span>
            <span>March gained <span className="text-green-300 font-medium">{summary.totalMarchAcresOut.toLocaleString()}a</span></span>
            {(oursKd?.totalAmbushAcresGained ?? 0) > 0 && <><span>·</span><span>Ambush gained <span className="text-green-300 font-medium">{oursKd!.totalAmbushAcresGained.toLocaleString()}a</span></span></>}
            {summary.totalRazeAcresOut > 0 && <><span>·</span><span>Razed them <span className="text-green-300 font-medium">{summary.totalRazeAcresOut.toLocaleString()}a</span></span></>}
            <span>·</span>
            <span>Net <span className={`font-medium ${net >= 0 ? "text-green-300" : "text-red-300"}`}>{net >= 0 ? "+" : ""}{net.toLocaleString()}a</span></span>
            <span>·</span>
            <span><span className="text-gray-300 font-medium">{summary.uniqueAttackers}</span> unique attacker{summary.uniqueAttackers !== 1 ? "s" : ""}</span>
          </div>

          {/* Per-kingdom tables */}
          <div className="flex flex-col gap-3">
            {summary.byKingdom.map((kd) => {
              const isOurs = kd.kingdom === summary.ourKingdom;
              const kdNet = kd.totalMarchAcresGained + kd.totalAmbushAcresGained - kd.totalMarchAcresLost - kd.totalAmbushAcresLost;
              const gc = isOurs ? "text-green-300" : "text-red-300";
              const lc = isOurs ? "text-red-300" : "text-green-300";
              return (
                <div key={kd.kingdom} className="rounded-lg border border-gray-800 overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-800/60 border-b border-gray-800 text-xs">
                    <Link href={`/kingdom/${encodeURIComponent(kd.kingdom)}`} className="font-mono font-medium text-gray-200 hover:text-blue-300 transition-colors">
                      {kd.kingdom}{isOurs && <span className="ml-1 text-blue-400">★</span>}
                    </Link>
                    {kd.totalHitsMade > 0  && <span className={gc}>{kd.totalHitsMade} hits · {kd.totalMarchAcresGained.toLocaleString()}a gained{kd.totalRazeAcresDealt > 0 ? ` · ${kd.totalRazeAcresDealt.toLocaleString()}a razed` : ""}</span>}
                    {kd.totalHitsTaken > 0 && <span className={lc}>{kd.totalHitsTaken} hits taken · {kd.totalMarchAcresLost.toLocaleString()}a lost{kd.totalRazeAcresLost > 0 ? ` · ${kd.totalRazeAcresLost.toLocaleString()}a razed` : ""}</span>}
                    {kdNet !== 0 && <span className={kdNet > 0 ? "text-green-300" : "text-red-300"}>net {kdNet > 0 ? "+" : ""}{kdNet.toLocaleString()}a</span>}
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500">
                        <th className="px-3 py-1 text-left font-normal" rowSpan={2}>Province</th>
                        <th className="px-2 py-1 text-center font-normal border-l border-gray-800" colSpan={10}>Made →</th>
                        <th className="px-2 py-1 text-center font-normal border-l border-gray-800" colSpan={10}>Taken ←</th>
                        <th className="px-2 py-1 text-right font-normal border-l border-gray-800" rowSpan={2}>Net</th>
                        <th className="px-2 py-1 text-right font-normal" rowSpan={2}>Books</th>
                      </tr>
                      <tr className="border-b border-gray-800 text-gray-500">
                        <th className="px-2 py-1 text-right font-normal border-l border-gray-800">Total</th>
                        <th className="px-2 py-1 text-right font-normal" title="Trad March">M</th>
                        <th className="px-2 py-1 text-right font-normal" title="Ambush">A</th>
                        <th className="px-2 py-1 text-right font-normal" title="Raze">Rz</th>
                        <th className="px-2 py-1 text-right font-normal" title="Plunder">Pl</th>
                        <th className="px-2 py-1 text-right font-normal" title="Learn">Lrn</th>
                        <th className="px-2 py-1 text-right font-normal" title="Failed Attack">Fail</th>
                        <th className="px-2 py-1 text-right font-normal text-gray-600" title="March acres gained">M.a</th>
                        <th className="px-2 py-1 text-right font-normal text-gray-600" title="Ambush acres gained">A.a</th>
                        <th className="px-2 py-1 text-right font-normal text-gray-600" title="Raze acres dealt">Rz.a</th>
                        <th className="px-2 py-1 text-right font-normal border-l border-gray-800">Total</th>
                        <th className="px-2 py-1 text-right font-normal" title="Trad March">M</th>
                        <th className="px-2 py-1 text-right font-normal" title="Ambush">A</th>
                        <th className="px-2 py-1 text-right font-normal" title="Raze">Rz</th>
                        <th className="px-2 py-1 text-right font-normal" title="Plunder">Pl</th>
                        <th className="px-2 py-1 text-right font-normal" title="Learn">Lrn</th>
                        <th className="px-2 py-1 text-right font-normal" title="Failed Attack">Fail</th>
                        <th className="px-2 py-1 text-right font-normal text-gray-600" title="March acres lost">M.a</th>
                        <th className="px-2 py-1 text-right font-normal text-gray-600" title="Ambush acres lost">A.a</th>
                        <th className="px-2 py-1 text-right font-normal text-gray-600" title="Raze acres lost">Rz.a</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kd.provinces.map((p, i) => {
                        const net = p.marchAcresGained + p.ambushAcresGained - p.marchAcresLost - p.ambushAcresLost;
                        return (
                        <tr key={i} className={i % 2 === 0 ? "bg-gray-900/40" : "bg-gray-900/20"}>
                          <td className="px-3 py-1.5 text-gray-300 whitespace-nowrap">
                            {p.slot != null && <span className="text-gray-500 font-mono mr-1.5">{p.slot}</span>}
                            {p.provinceName
                              ? <>
                                  <button type="button" onClick={() => setProvFilter((v) => v === p.provinceName ? "" : p.provinceName!)}
                                    className={`hover:text-blue-300 transition-colors ${provFilter === p.provinceName ? "text-blue-300 underline" : ""}`}>
                                    {p.provinceName}
                                  </button>
                                  <Link href={`/kingdom/${encodeURIComponent(kd.kingdom)}/${encodeURIComponent(p.provinceName)}`}
                                    className="ml-1.5 text-gray-600 hover:text-gray-400 transition-colors text-[10px]" title="Province detail">↗</Link>
                                </>
                              : <span className="text-gray-500 italic">Unknown</span>
                            }
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800"><Num n={p.hitsMade}          color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.marchMade}          color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.ambushMade}         color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.razeMade}           color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.plunderMade}        color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.lootMade}           color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.failedMade}         color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.marchAcresGained}   color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.ambushAcresGained}  color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.razeAcresDealt}     color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800"><Num n={p.hitsTaken}    color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.marchTaken}         color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.ambushTaken}        color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.razeTaken}          color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.plunderTaken}       color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.lootTaken}          color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.failedTaken}        color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.marchAcresLost}     color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.ambushAcresLost}    color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={p.razeAcresLost}      color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800">
                            {net !== 0
                              ? <span className={net > 0 ? "text-green-300" : "text-red-300"}>{net > 0 ? "+" : ""}{net.toLocaleString()}</span>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono"><Num n={p.booksLooted} color="text-amber-300" /></td>
                        </tr>
                        );
                      })}
                    </tbody>
                    {kd.provinces.length > 1 && (() => {
                      const kdTotalNet = kd.totalMarchAcresGained + kd.totalAmbushAcresGained - kd.totalMarchAcresLost - kd.totalAmbushAcresLost;
                      return (
                      <tfoot>
                        <tr className="border-t border-gray-700 text-gray-400 font-medium bg-gray-900/60">
                          <td className="px-3 py-1.5 text-gray-500 text-[11px]">Total</td>
                          <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800"><Num n={kd.totalHitsMade}          color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalMarchMade}          color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalAmbushMade}         color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalRazeMade}           color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalPlunderMade}        color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalLootMade}           color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalFailedMade}         color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalMarchAcresGained}   color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalAmbushAcresGained}  color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalRazeAcresDealt}     color={gc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800"><Num n={kd.totalHitsTaken}    color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalMarchTaken}         color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalAmbushTaken}        color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalRazeTaken}          color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalPlunderTaken}       color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalLootTaken}          color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalFailedTaken}        color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalMarchAcresLost}     color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalAmbushAcresLost}    color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono"><Num n={kd.totalRazeAcresLost}      color={lc} /></td>
                          <td className="px-2 py-1.5 text-right font-mono border-l border-gray-800">
                            {kdTotalNet !== 0
                              ? <span className={kdTotalNet > 0 ? "text-green-300" : "text-red-300"}>{kdTotalNet > 0 ? "+" : ""}{kdTotalNet.toLocaleString()}</span>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono"><Num n={kd.provinces.reduce((s, p) => s + p.booksLooted, 0)} color="text-amber-300" /></td>
                        </tr>
                      </tfoot>
                      );
                    })()}
                  </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-1.5 items-center">
        {TYPE_GROUPS.map((g) => {
          const active = activeGroups.has(g.label);
          return (
            <button key={g.label} type="button"
              onClick={() => { setVisibleCount(50); setActiveGroups((prev) => {
                const next = new Set(prev);
                if (next.has(g.label)) { next.delete(g.label); } else { next.add(g.label); }
                return next;
              }); }}
              className={`${btnBase} ${active ? btnActive : btnInactive}`}>
              {g.label}
            </button>
          );
        })}
        {activeGroups.size < ALL_GROUPS.size && (
          <button type="button" onClick={() => { setVisibleCount(50); setActiveGroups(new Set(ALL_GROUPS)); }}
            className={`${btnBase} ${btnInactive}`}>
            All
          </button>
        )}
        <span className="ml-2 relative">
          <input
            type="text"
            value={provFilter}
            onChange={(e) => { setProvFilter(e.target.value); setVisibleCount(50); }}
            placeholder="Filter province…"
            className="rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 placeholder-gray-600 focus:border-gray-500 focus:outline-none w-40"
          />
          {provFilter && (
            <button type="button" onClick={() => setProvFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">×</button>
          )}
        </span>
      </div>

      {(() => {
        const filtered = events.filter((e) => {
          const group = TYPE_GROUPS.find((g) => g.types.includes(e.eventType));
          if (!(group ? activeGroups.has(group.label) : activeGroups.size === ALL_GROUPS.size)) return false;
          if (provFilter) {
            const pf = provFilter.toLowerCase();
            return (
              e.attackerName?.toLowerCase().includes(pf) ||
              e.defenderName?.toLowerCase().includes(pf) ||
              e.senderName?.toLowerCase().includes(pf) ||
              e.receiverName?.toLowerCase().includes(pf)
            );
          }
          return true;
        });
        const visible = filtered.slice(0, visibleCount);
        const hasMore = filtered.length > visibleCount;
        return <>
      <div className="space-y-1">
        {visible.map((event) => {
          const dir = eventDirection(event, kingdom);
          const badge = DIR_BADGE[dir ?? "neutral"];
          const label = EVENT_LABEL[event.eventType] ?? "Event";
          return (
            <div key={event.id} className="flex items-start gap-3 rounded px-3 py-2 text-sm bg-gray-900/30">
              <span className="shrink-0 text-[11px] text-gray-500 font-mono pt-0.5 w-36">{event.gameDate}</span>
              <span className="shrink-0 w-4 pt-0.5 text-center text-[12px] leading-none">
                {dir === "out" && <span className="text-green-500" title="Outgoing">→</span>}
                {dir === "in"  && <span className="text-red-400"   title="Incoming">←</span>}
              </span>
              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${badge}`}>
                {label}
              </span>
              <span className="min-w-0 text-[13px] leading-snug">
                <EventDescription event={event} />
              </span>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
          <button type="button" onClick={() => setVisibleCount((n) => n + 50)}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-gray-300 hover:border-gray-500 hover:text-gray-100 transition-colors">
            Load more
          </button>
          <span>{visibleCount} of {filtered.length} events</span>
        </div>
      )}
      {(() => {
        const combat = filtered.filter((e) => COMBAT_TYPES_SET.has(e.eventType));
        if (combat.length === 0) return null;
        let hm = 0, mm = 0, am = 0, rm = 0, pm = 0, lm = 0, fm = 0;
        let ht = 0, mt = 0, at = 0, rt = 0, pt = 0, lt = 0, ft = 0;
        let marchOut = 0, ambushOut = 0, razeOut = 0;
        let marchIn = 0, ambushIn = 0, razeIn = 0, books = 0;
        for (const e of combat) {
          const isOut = e.attackerKingdom === kingdom;
          const acres = e.acres ?? 0;
          if (isOut) {
            hm++;
            if      (e.eventType === "march")         { mm++; marchOut  += acres; }
            else if (e.eventType === "ambush")        { am++; ambushOut += acres; }
            else if (e.eventType === "raze")          { rm++; razeOut   += acres; }
            else if (e.eventType === "pillage")       { pm++; }
            else if (e.eventType === "loot")          { lm++; books += e.books ?? 0; }
            else if (e.eventType === "failed_attack") { fm++; }
          } else {
            ht++;
            if      (e.eventType === "march")         { mt++; marchIn  += acres; }
            else if (e.eventType === "ambush")        { at++; ambushIn += acres; }
            else if (e.eventType === "raze")          { rt++; razeIn   += acres; }
            else if (e.eventType === "pillage")       { pt++; }
            else if (e.eventType === "loot")          { lt++; }
            else if (e.eventType === "failed_attack") { ft++; }
          }
        }
        const net = marchOut + ambushOut - marchIn - ambushIn - razeIn;
        return (
          <div className="mt-3 rounded-lg border border-gray-800 overflow-hidden text-xs">
            <div className="px-3 py-1.5 bg-gray-800/60 border-b border-gray-800 text-gray-400 font-medium">
              {provFilter ? `Totals — ${provFilter}` : "Totals"}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="px-2 py-1 text-center font-normal border-r border-gray-800" colSpan={10}>Made →</th>
                  <th className="px-2 py-1 text-center font-normal border-r border-gray-800" colSpan={10}>Taken ←</th>
                  <th className="px-2 py-1 text-right font-normal border-r border-gray-800">Net</th>
                  <th className="px-2 py-1 text-right font-normal">Books</th>
                </tr>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="px-2 py-1 text-right font-normal">Total</th>
                  <th className="px-2 py-1 text-right font-normal" title="Trad March">M</th>
                  <th className="px-2 py-1 text-right font-normal" title="Ambush">A</th>
                  <th className="px-2 py-1 text-right font-normal" title="Raze">Rz</th>
                  <th className="px-2 py-1 text-right font-normal" title="Plunder">Pl</th>
                  <th className="px-2 py-1 text-right font-normal" title="Learn">Lrn</th>
                  <th className="px-2 py-1 text-right font-normal" title="Failed Attack">Fail</th>
                  <th className="px-2 py-1 text-right font-normal text-gray-600" title="March acres gained">M.a</th>
                  <th className="px-2 py-1 text-right font-normal text-gray-600" title="Ambush acres gained">A.a</th>
                  <th className="px-2 py-1 text-right font-normal text-gray-600 border-r border-gray-800" title="Raze acres dealt">Rz.a</th>
                  <th className="px-2 py-1 text-right font-normal">Total</th>
                  <th className="px-2 py-1 text-right font-normal" title="Trad March">M</th>
                  <th className="px-2 py-1 text-right font-normal" title="Ambush">A</th>
                  <th className="px-2 py-1 text-right font-normal" title="Raze">Rz</th>
                  <th className="px-2 py-1 text-right font-normal" title="Plunder">Pl</th>
                  <th className="px-2 py-1 text-right font-normal" title="Learn">Lrn</th>
                  <th className="px-2 py-1 text-right font-normal" title="Failed Attack">Fail</th>
                  <th className="px-2 py-1 text-right font-normal text-gray-600" title="March acres lost">M.a</th>
                  <th className="px-2 py-1 text-right font-normal text-gray-600" title="Ambush acres lost">A.a</th>
                  <th className="px-2 py-1 text-right font-normal text-gray-600 border-r border-gray-800" title="Raze acres lost">Rz.a</th>
                  <th className="px-2 py-1 text-right font-normal border-r border-gray-800"></th>
                  <th className="px-2 py-1 text-right font-normal"></th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-900/40">
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={hm} color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={mm} color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={am} color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={rm} color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={pm} color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={lm} color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={fm} color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={marchOut}  color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={ambushOut} color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono border-r border-gray-800"><Num n={razeOut}   color="text-green-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={ht} color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={mt} color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={at} color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={rt} color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={pt} color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={lt} color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={ft} color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={marchIn}  color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={ambushIn} color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono border-r border-gray-800"><Num n={razeIn}   color="text-red-300" /></td>
                  <td className="px-2 py-1.5 text-right font-mono border-r border-gray-800">
                    {net !== 0
                      ? <span className={net > 0 ? "text-green-300" : "text-red-300"}>{net > 0 ? "+" : ""}{net.toLocaleString()}</span>
                      : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono"><Num n={books} color="text-amber-300" /></td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        );
      })()}
        </>;
      })()}
    </>
  );
}
