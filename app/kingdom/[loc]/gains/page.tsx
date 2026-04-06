export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { Tooltip, type TooltipLine } from "@/app/components/Tooltip";
import {
  getBoundKingdom,
  getKingdomProvinces,
  getLatestKingdomSnapshot,
  type KingdomSnapshotProvince,
  type ProvinceRow,
} from "@/lib/db";
import { estimateBreakability, estimateTraditionalMarchAcres } from "@/lib/gains";
import { formatNum, formatTimestamp } from "@/lib/ui";
import { GainsJump } from "./GainsJump";

function averageNetworth(provinces: { networth: number }[]): number | null {
  if (provinces.length === 0) return null;
  return provinces.reduce((sum, p) => sum + p.networth, 0) / provinces.length;
}

function zeroAcresReason(estimate: NonNullable<ReturnType<typeof estimateTraditionalMarchAcres>>): string | null {
  if (estimate.rawAcres === 0 && estimate.rpnwFactor === 0) {
    return "0 acres: province NW range gives no gains";
  }
  if (estimate.roundedAcres === 0) {
    return "0 acres shown: estimate rounds below 0.5 acres";
  }
  return null;
}

function factorTone(factor: number): TooltipLine["tone"] {
  if (factor === 0) return "bad";
  if (factor < 1) return "warn";
  return "good";
}

function estimateTitle(
  attacker: ProvinceRow,
  defender: KingdomSnapshotProvince,
  selfAvgNetworth: number,
  targetAvgNetworth: number,
  defenderLatest: ProvinceRow | null,
) {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: attacker.land,
    attackerNetworth: attacker.networth,
    defenderLand: defender.land,
    defenderNetworth: defender.networth,
    selfKingdomAvgNetworth: selfAvgNetworth,
    targetKingdomAvgNetworth: targetAvgNetworth,
  });
  if (!estimate) {
    return [{ text: "Missing land, NW, or kingdom snapshot data", tone: "bad" }] satisfies TooltipLine[];
  }

  const breakability = estimateBreakability(attacker, defenderLatest);
  const zeroReason = zeroAcresReason(estimate);
  return [
    { text: `${attacker.name} -> ${defender.name}`, tone: "strong" },
    ...(zeroReason ? [{ text: zeroReason, tone: estimate.rpnwFactor === 0 ? "bad" : "warn" } satisfies TooltipLine] : []),
    { text: `raw acres: ${estimate.rawAcres.toFixed(2)}`, tone: estimate.rawAcres === 0 ? "bad" : estimate.capApplied ? "warn" : "good" },
    { text: `displayed acres: ${estimate.roundedAcres}`, tone: estimate.roundedAcres === 0 ? "warn" : "strong" },
    { text: `attacker NW: ${attacker.networth?.toLocaleString() ?? "—"}` },
    { text: `defender NW: ${defender.networth.toLocaleString()}` },
    { text: `defender land: ${defender.land.toLocaleString()}` },
    { text: `rpnw: ${estimate.rpnw.toFixed(3)} -> ${estimate.rpnwFactor.toFixed(3)}`, tone: factorTone(estimate.rpnwFactor) },
    { text: `self avg NW: ${Math.round(selfAvgNetworth).toLocaleString()}` },
    { text: `target avg NW: ${Math.round(targetAvgNetworth).toLocaleString()}` },
    { text: `rknw: ${estimate.rknw.toFixed(3)} -> ${estimate.rknwFactor.toFixed(3)}`, tone: factorTone(estimate.rknwFactor) },
    { text: `cap: ${estimate.cap.toFixed(2)}${estimate.capApplied ? " (applied)" : ""}`, tone: estimate.capApplied ? "warn" : "muted" },
    {
      text: `breakability: ${
        breakability.status === "breakable"
          ? "breakable"
          : breakability.status === "not_breakable"
            ? "not breakable"
            : "unknown"
      }`,
      tone: breakability.status === "breakable" ? "good" : breakability.status === "not_breakable" ? "bad" : "muted",
    },
    { text: `offense source: ${breakability.offenseSource ?? "missing"}`, tone: breakability.offenseSource ? "muted" : "warn" },
    { text: `defense source: ${breakability.defenseSource ?? "missing"}`, tone: breakability.defenseSource ? "muted" : "warn" },
    { text: "Assumes neutral MAP, race/personality gains mods, castles, relations, stance, siege, dragons, attack-time, ritual, anonymity, and mist.", tone: "muted" },
  ] satisfies TooltipLine[];
}

function breakMarker(attacker: ProvinceRow, defenderLatest: ProvinceRow | null) {
  const breakability = estimateBreakability(attacker, defenderLatest);
  if (breakability.status === "breakable") {
    return <span className="text-[10px] uppercase tracking-wide text-green-400">B</span>;
  }
  if (breakability.status === "not_breakable") {
    return <span className="text-[10px] uppercase tracking-wide text-red-400">X</span>;
  }
  return <span className="text-[10px] uppercase tracking-wide text-gray-500">?</span>;
}

function gainsTone(
  estimate: NonNullable<ReturnType<typeof estimateTraditionalMarchAcres>> | null,
): { cell: string; value: string } {
  if (!estimate) {
    return {
      cell: "bg-gray-950/40",
      value: "text-gray-500",
    };
  }
  if (estimate.roundedAcres === 0) {
    return {
      cell: "bg-gray-950/60",
      value: "text-gray-300",
    };
  }
  if (estimate.roundedAcres < 50) {
    return {
      cell: "bg-amber-950/20",
      value: "text-amber-200",
    };
  }
  if (estimate.roundedAcres < 100) {
    return {
      cell: "bg-lime-950/25",
      value: "text-lime-200",
    };
  }
  return {
    cell: "bg-green-950/30",
    value: "text-green-200",
  };
}

function stateBadges(
  estimate: NonNullable<ReturnType<typeof estimateTraditionalMarchAcres>> | null,
  breakability: ReturnType<typeof estimateBreakability>,
) {
  const badges: React.ReactNode[] = [];
  if (!estimate) return badges;
  if (estimate.rpnwFactor === 0) {
    badges.push(<span key="nw0" className="text-[9px] font-medium uppercase tracking-wide text-red-400">NW0</span>);
  } else if (estimate.rpnwFactor < 1 || estimate.rknwFactor < 1) {
    badges.push(<span key="reduced" className="text-[9px] font-medium uppercase tracking-wide text-amber-400">REDUCED</span>);
  }
  if (estimate.capApplied) {
    badges.push(<span key="cap" className="text-[9px] font-medium uppercase tracking-wide text-amber-300">CAP</span>);
  }
  if (breakability.status === "not_breakable") {
    badges.push(<span key="x" className="text-[9px] font-medium uppercase tracking-wide text-red-400">X</span>);
  } else if (breakability.status === "unknown") {
    badges.push(<span key="q" className="text-[9px] font-medium uppercase tracking-wide text-sky-300">?</span>);
  }
  return badges;
}

function emptyState(message: string) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6 text-sm text-gray-400">
      {message}
    </div>
  );
}

export default async function GainsPage({
  params,
}: {
  params: Promise<{ loc: string }>;
}) {
  const { loc } = await params;
  const targetKingdom = decodeURIComponent(loc);
  const key = (await cookies()).get("auth")?.value ?? "";
  const keyHash = createHash("sha256").update(key).digest("hex");
  const selfKingdom = getBoundKingdom(keyHash);

  if (!selfKingdom) {
    return (
      <main className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-200 text-sm">
            ← kingdoms
          </Link>
          <h1 className="text-xl font-bold text-gray-100 font-mono">Gains</h1>
        </div>
        {emptyState("No bound kingdom yet. Submit a self /throne page first so the site can identify your kingdom.")}
      </main>
    );
  }

  const selfProvinces = getKingdomProvinces(selfKingdom, keyHash);
  const selfSnapshot = getLatestKingdomSnapshot(selfKingdom, keyHash);
  const targetSnapshot = getLatestKingdomSnapshot(targetKingdom, keyHash);
  const targetLatest = getKingdomProvinces(targetKingdom, keyHash);
  const targetLatestByName = new Map(targetLatest.map((p) => [p.name, p] as const));

  if (selfProvinces.length === 0) {
    return (
      <main className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Link href={`/kingdom/${encodeURIComponent(targetKingdom)}`} className="text-gray-400 hover:text-gray-200 text-sm">
            ← {targetKingdom}
          </Link>
          <h1 className="text-xl font-bold text-gray-100 font-mono">Gains</h1>
          <div className="ml-auto">
            <GainsJump initialTarget={targetKingdom} />
          </div>
        </div>
        {emptyState(`No visible provinces found for your bound kingdom ${selfKingdom}.`)}
      </main>
    );
  }

  if (!selfSnapshot) {
    return (
      <main className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Link href={`/kingdom/${encodeURIComponent(targetKingdom)}`} className="text-gray-400 hover:text-gray-200 text-sm">
            ← {targetKingdom}
          </Link>
          <h1 className="text-xl font-bold text-gray-100 font-mono">Gains</h1>
          <div className="ml-auto">
            <GainsJump initialTarget={targetKingdom} />
          </div>
        </div>
        {emptyState(`Your kingdom ${selfKingdom} needs a kingdom page submission before gains can be estimated.`)}
      </main>
    );
  }

  if (!targetSnapshot) {
    return (
      <main className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Link href={`/kingdom/${encodeURIComponent(targetKingdom)}`} className="text-gray-400 hover:text-gray-200 text-sm">
            ← {targetKingdom}
          </Link>
          <h1 className="text-xl font-bold text-gray-100 font-mono">Gains</h1>
          <div className="ml-auto">
            <GainsJump initialTarget={targetKingdom} />
          </div>
        </div>
        {emptyState(`No kingdom page snapshot is available for ${targetKingdom} yet. Submit a kingdom_details page for that target first.`)}
      </main>
    );
  }

  const selfAvgNetworth = averageNetworth(selfSnapshot.provinces);
  const targetAvgNetworth = averageNetworth(targetSnapshot.provinces);

  if (!selfAvgNetworth || !targetAvgNetworth) {
    return (
      <main className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Link href={`/kingdom/${encodeURIComponent(targetKingdom)}`} className="text-gray-400 hover:text-gray-200 text-sm">
            ← {targetKingdom}
          </Link>
          <h1 className="text-xl font-bold text-gray-100 font-mono">Gains</h1>
          <div className="ml-auto">
            <GainsJump initialTarget={targetKingdom} />
          </div>
        </div>
        {emptyState("One of the kingdom snapshots is missing networth data, so gains cannot be estimated.")}
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link href={`/kingdom/${encodeURIComponent(targetKingdom)}`} className="text-gray-400 hover:text-gray-200 text-sm">
          ← {targetKingdom}
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-100 font-mono">
            Gains: {selfKingdom} → {targetKingdom}
          </h1>
          <div className="text-sm text-gray-500">
            {selfSnapshot.name} → {targetSnapshot.name}
          </div>
        </div>
        <div className="ml-auto">
          <GainsJump initialTarget={targetKingdom} />
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4 text-sm text-gray-400">
        <p>
          Traditional March land gains only. Both kingdom averages come from the latest accessible kingdom page snapshots.
          Row provinces use your latest visible intel; target columns use the latest target kingdom snapshot.
        </p>
        <p className="mt-2">
          Self snapshot: <span className="text-gray-200">{formatTimestamp(selfSnapshot.receivedAt)}</span>
          {" · "}
          Target snapshot: <span className="text-gray-200">{formatTimestamp(targetSnapshot.receivedAt)}</span>
        </p>
        <p className="mt-2">
          Neutral assumptions: MAP, race/personality gains mods, castles, relations, stance, siege, dragons,
          attack-time adjustment, ritual, anonymity, and mist.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-gray-800 bg-gray-950 px-3 py-2 text-left font-medium text-gray-300">
                {selfKingdom}
                <div className="mt-1 text-[10px] font-normal text-gray-500">
                  avg NW {formatNum(Math.round(selfAvgNetworth))}
                </div>
              </th>
              {targetSnapshot.provinces.map((defender) => (
                <th
                  key={defender.name}
                  className="border-b border-r border-gray-800 bg-gray-950 px-3 py-2 text-right font-medium text-gray-300"
                >
                  <Tooltip content={`${defender.name}\nNW ${defender.networth.toLocaleString()}\nLand ${defender.land.toLocaleString()}`}>
                    <div>{defender.name}</div>
                    <div className="mt-1 text-[10px] font-normal text-gray-500">
                      {formatNum(defender.networth)} / {formatNum(defender.land)}a
                    </div>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selfProvinces.map((attacker) => (
              <tr key={attacker.id} className="hover:bg-gray-900/40">
                <th
                  className="sticky left-0 z-10 border-b border-r border-gray-800 bg-gray-950 px-3 py-2 text-left font-medium text-gray-200"
                >
                  <Tooltip content={`${attacker.name}\nNW ${attacker.networth?.toLocaleString() ?? "—"}\nLand ${attacker.land?.toLocaleString() ?? "—"}`}>
                    <Link
                      href={`/kingdom/${encodeURIComponent(selfKingdom)}/${encodeURIComponent(attacker.name)}`}
                      className="hover:text-blue-400"
                    >
                      {attacker.name}
                    </Link>
                    <div className="mt-1 text-[10px] font-normal text-gray-500">
                      {formatNum(attacker.networth)} / {formatNum(attacker.land)}a
                    </div>
                  </Tooltip>
                </th>
                {targetSnapshot.provinces.map((defender) => {
                  const estimate = estimateTraditionalMarchAcres({
                    attackerLand: attacker.land,
                    attackerNetworth: attacker.networth,
                    defenderLand: defender.land,
                    defenderNetworth: defender.networth,
                    selfKingdomAvgNetworth: selfAvgNetworth,
                    targetKingdomAvgNetworth: targetAvgNetworth,
                  });
                  const defenderLatest = targetLatestByName.get(defender.name) ?? null;
                  const breakability = estimateBreakability(attacker, defenderLatest);
                  const tone = gainsTone(estimate);
                  const badges = stateBadges(estimate, breakability);

                  return (
                    <td
                      key={`${attacker.id}:${defender.name}`}
                      className={`border-b border-r border-gray-800 px-3 py-2 text-right tabular-nums transition-colors ${tone.cell}`}
                    >
                      <Tooltip content={estimateTitle(attacker, defender, selfAvgNetworth, targetAvgNetworth, defenderLatest)}>
                        <div className={tone.value}>
                          {estimate ? estimate.roundedAcres.toLocaleString() : "—"}
                        </div>
                        <div className="mt-1 flex items-center justify-end gap-1">
                          {badges}
                          {!badges.length && breakMarker(attacker, defenderLatest)}
                        </div>
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
