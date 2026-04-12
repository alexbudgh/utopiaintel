"use client";

import Link from "next/link";
import type { KingdomNewsRow, KingdomNewsSummary } from "@/lib/db";

const EVENT_LABEL: Record<string, string> = {
  march:               "Trad. March",
  invasion:            "Trad. March",
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

  if (eventType === "march" || eventType === "invasion") {
    return (
      <span>
        <KdLink name={attackerName} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">→</span>{" "}
        <KdLink name={defenderName} kingdom={defenderKingdom} />
        {acres != null && <span className="text-gray-400"> · {acres.toLocaleString()}a</span>}
      </span>
    );
  }

  if (eventType === "ambush" || eventType === "pillage") {
    const verb = eventType === "pillage" ? "pillaged" : "ambushed";
    return (
      <span>
        <KdLink name={attackerName} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">{verb}</span>{" "}
        <KdLink name={defenderName} kingdom={defenderKingdom} />
        {acres != null && <span className="text-gray-400"> · {acres.toLocaleString()}a</span>}
      </span>
    );
  }

  if (eventType === "raze") {
    return (
      <span>
        <KdLink name={attackerName} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">razed</span>{" "}
        <KdLink name={defenderName} kingdom={defenderKingdom} />
        {acres != null && <span className="text-gray-400"> · {acres.toLocaleString()}a</span>}
      </span>
    );
  }

  if (eventType === "loot") {
    return (
      <span>
        <KdLink name={attackerName} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">looted</span>{" "}
        <KdLink name={defenderName} kingdom={defenderKingdom} />
        {books != null && <span className="text-gray-400"> · {books.toLocaleString()} books</span>}
      </span>
    );
  }

  if (eventType === "failed_attack") {
    return (
      <span>
        <span className="text-gray-500">Unknown from </span>
        <KdLink name={null} kingdom={attackerKingdom} />{" "}
        <span className="text-gray-500">→</span>{" "}
        <KdLink name={defenderName} kingdom={defenderKingdom} />
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

export function KingdomNewsTable({ events, summary, kingdom }: { events: KingdomNewsRow[]; summary: KingdomNewsSummary; kingdom: string }) {
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
    </div>
  );

  if (events.length === 0) {
    return (
      <>
        {controls}
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-5 py-6 text-sm text-gray-400">
          No news events recorded yet. Browse the kingdom news page in Utopia to submit intel.
        </div>
      </>
    );
  }

  const net = summary.totalAcresOut - summary.totalAcresIn;
  const hasSummary = summary.byKingdom.length > 0;

  function Num({ n, color }: { n: number; color: string }) {
    return n > 0 ? <span className={color}>{n.toLocaleString()}</span> : <span className="text-gray-700">—</span>;
  }

  return (
    <>
      {controls}

      {hasSummary && (
        <div className="mb-4">
          {/* Headline stats */}
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-gray-400">
            <span>Lost <span className="text-red-300 font-medium">{summary.totalAcresIn.toLocaleString()}a</span></span>
            <span>·</span>
            <span>Gained <span className="text-green-300 font-medium">{summary.totalAcresOut.toLocaleString()}a</span></span>
            <span>·</span>
            <span>Net <span className={`font-medium ${net >= 0 ? "text-green-300" : "text-red-300"}`}>{net >= 0 ? "+" : ""}{net.toLocaleString()}a</span></span>
            <span>·</span>
            <span><span className="text-gray-300 font-medium">{summary.uniqueAttackers}</span> unique attacker{summary.uniqueAttackers !== 1 ? "s" : ""}</span>
          </div>

          {/* Per-kingdom tables */}
          <div className="flex flex-col gap-3">
            {summary.byKingdom.map((kd) => {
              const isOurs = kd.kingdom === summary.ourKingdom;
              return (
                <div key={kd.kingdom} className="rounded-lg border border-gray-800 overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-800/60 border-b border-gray-800 text-xs">
                    <Link href={`/kingdom/${encodeURIComponent(kd.kingdom)}`} className="font-mono font-medium text-gray-200 hover:text-blue-300 transition-colors">
                      {kd.kingdom}{isOurs && <span className="ml-1 text-blue-400">★</span>}
                    </Link>
                    {kd.totalHitsMade > 0  && <span className={isOurs ? "text-green-300" : "text-red-300"}>{kd.totalHitsMade} hits · {kd.totalAcresGained.toLocaleString()}a gained</span>}
                    {kd.totalHitsTaken > 0 && <span className={isOurs ? "text-red-300"   : "text-green-300"}>{kd.totalHitsTaken} hits taken · {kd.totalAcresLost.toLocaleString()}a lost</span>}
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500">
                        <th className="px-3 py-1 text-left font-normal">Province</th>
                        <th className="px-3 py-1 text-right font-normal">Hits Made</th>
                        <th className="px-3 py-1 text-right font-normal">Acres Gained</th>
                        <th className="px-3 py-1 text-right font-normal">Hits Taken</th>
                        <th className="px-3 py-1 text-right font-normal">Acres Lost</th>
                        <th className="px-3 py-1 text-right font-normal">Books Looted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kd.provinces.map((p, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-gray-900/40" : "bg-gray-900/20"}>
                          <td className="px-3 py-1.5 text-gray-300">
                            {p.provinceName
                              ? <Link href={`/kingdom/${encodeURIComponent(kd.kingdom)}/${encodeURIComponent(p.provinceName)}`} className="hover:text-blue-300 transition-colors">{p.provinceName}</Link>
                              : <span className="text-gray-500 italic">Unknown</span>
                            }
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono"><Num n={p.hitsMade}    color={isOurs ? "text-green-300" : "text-red-300"} /></td>
                          <td className="px-3 py-1.5 text-right font-mono"><Num n={p.acresGained} color={isOurs ? "text-green-300" : "text-red-300"} /></td>
                          <td className="px-3 py-1.5 text-right font-mono"><Num n={p.hitsTaken}   color={isOurs ? "text-red-300"   : "text-green-300"} /></td>
                          <td className="px-3 py-1.5 text-right font-mono"><Num n={p.acresLost}   color={isOurs ? "text-red-300"   : "text-green-300"} /></td>
                          <td className="px-3 py-1.5 text-right font-mono"><Num n={p.booksLooted} color="text-amber-300" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1">
        {events.map((event) => {
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
    </>
  );
}
