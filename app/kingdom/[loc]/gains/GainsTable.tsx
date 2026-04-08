"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KingdomRelations } from "@/app/components/KingdomRelations";
import { Tooltip, type TooltipLine } from "@/app/components/Tooltip";
import type { KingdomSnapshotProvince, ProvinceRow } from "@/lib/db";
import { estimateBreakability, estimateTraditionalMarchAcres } from "@/lib/gains";
import type { GainsPageData } from "@/lib/gains-page";
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

function fmt(value: number, digits = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function relationStateForSnapshots(
  selfKingdom: string,
  targetKingdom: string,
  selfSnapshot: GainsPageData["selfSnapshot"],
  targetSnapshot: GainsPageData["targetSnapshot"],
): "war" | "oow" {
  if (selfSnapshot?.warTarget === targetKingdom || targetSnapshot?.warTarget === selfKingdom) {
    return "war";
  }
  return "oow";
}

function isNonAggressionPact(status: string | null): boolean {
  const value = (status ?? "").toLowerCase();
  return value.includes("non aggression") || value.includes("ceasefire");
}

function mapBreakdown(
  hitStatus: string | null,
  relationState: "war" | "oow",
  mapFactor: number,
): { branch: string; calc: string; tone: TooltipLine["tone"] } {
  if (!hitStatus) {
    return {
      branch: "MAP branch: no SoT MAP status available",
      calc: "MAP factor: 1",
      tone: "muted",
    };
  }

  const normalized = hitStatus.trim().toLowerCase();
  if (normalized === "a little") {
    return {
      branch: `MAP branch: a little -> Couple bucket midpoint (${relationState === "war" ? "war" : "out of war"})`,
      calc: "MAP factor: midpoint of 80-99% = 0.895",
      tone: "warn",
    };
  }
  if (normalized === "moderately") {
    return {
      branch: `MAP branch: moderately -> Moderately Hit bucket (${relationState === "war" ? "war" : "out of war"})`,
      calc: relationState === "war"
        ? "MAP factor: war bucket = 0.800"
        : "MAP factor: midpoint of 60-79% = 0.695",
      tone: "warn",
    };
  }
  if (normalized === "pretty heavily") {
    return {
      branch: `MAP branch: pretty heavily -> Heavily Hit bucket (${relationState === "war" ? "war" : "out of war"})`,
      calc: relationState === "war"
        ? "MAP factor: war bucket = 0.800"
        : "MAP factor: midpoint of 40-59% = 0.495",
      tone: "warn",
    };
  }
  if (normalized === "extremely badly") {
    return {
      branch: `MAP branch: extremely badly -> Extremely Heavily Hit bucket (${relationState === "war" ? "war" : "out of war"})`,
      calc: relationState === "war"
        ? "MAP factor: war bucket = 0.800"
        : "MAP factor: midpoint of 10-39% = 0.245",
      tone: "bad",
    };
  }
  return {
    branch: `MAP branch: unrecognized status "${hitStatus}"`,
    calc: `MAP factor: ${mapFactor.toFixed(3)}`,
    tone: "muted",
  };
}

function relationBreakdown(
  ourAttitudeToThem: string | null,
  theirAttitudeToUs: string | null,
  ourRelationFactor: number,
  theirRelationFactor: number,
): TooltipLine[] {
  return [
    {
      text: `Our attitude to them = ${ourAttitudeToThem ?? "Normal"} -> relation factor ${ourRelationFactor.toFixed(3)}`,
      tone: ourRelationFactor > 1 ? "good" : "muted",
    },
    {
      text: `Their attitude to us = ${theirAttitudeToUs ?? "Normal"} -> relation factor ${theirRelationFactor.toFixed(3)}`,
      tone: theirRelationFactor > 1 ? "good" : "muted",
    },
    {
      text: `Combined relation factor = ${ourRelationFactor.toFixed(3)} * ${theirRelationFactor.toFixed(3)} = ${(ourRelationFactor * theirRelationFactor).toFixed(3)}`,
      tone: ourRelationFactor > 1 || theirRelationFactor > 1 ? "good" : "muted",
    },
  ];
}

function rpnwBreakdown(rpnw: number): { branch: string; calc: string; tone: TooltipLine["tone"] } {
  if (rpnw <= 0.567) {
    return {
      branch: `RPNW branch: x <= 0.567 (since ${rpnw.toFixed(3)} <= 0.567)`,
      calc: `RPNW factor: 0`,
      tone: "bad",
    };
  }
  if (rpnw < 0.9) {
    return {
      branch: `RPNW branch: 0.567 < x < 0.9 (since 0.567 < ${rpnw.toFixed(3)} < 0.9)`,
      calc: `RPNW factor: 3 * ${rpnw.toFixed(3)} - 1.7 = ${(3 * rpnw - 1.7).toFixed(3)}`,
      tone: "warn",
    };
  }
  if (rpnw <= 1.1) {
    return {
      branch: `RPNW branch: 0.9 <= x <= 1.1 (since 0.9 <= ${rpnw.toFixed(3)} <= 1.1)`,
      calc: "RPNW factor: 1",
      tone: "good",
    };
  }
  if (rpnw < 1.6) {
    return {
      branch: `RPNW branch: 1.1 < x < 1.6 (since 1.1 < ${rpnw.toFixed(3)} < 1.6)`,
      calc: `RPNW factor: -2 * ${rpnw.toFixed(3)} + 3.2 = ${(-2 * rpnw + 3.2).toFixed(3)}`,
      tone: "warn",
    };
  }
  return {
    branch: `RPNW branch: x >= 1.6 (since ${rpnw.toFixed(3)} >= 1.6)`,
    calc: "RPNW factor: 0",
    tone: "bad",
  };
}

function rknwBreakdown(rknw: number): { branch: string; calc: string; tone: TooltipLine["tone"] } {
  if (rknw <= 0.5) {
    return {
      branch: `RKNW branch: x <= 0.5 (since ${rknw.toFixed(3)} <= 0.5)`,
      calc: "RKNW factor: 0.8",
      tone: "warn",
    };
  }
  if (rknw < 0.9) {
    return {
      branch: `RKNW branch: 0.5 < x < 0.9 (since 0.5 < ${rknw.toFixed(3)} < 0.9)`,
      calc: `RKNW factor: ${rknw.toFixed(3)} / 2 + 0.55 = ${(rknw / 2 + 0.55).toFixed(3)}`,
      tone: "warn",
    };
  }
  return {
    branch: `RKNW branch: x >= 0.9 (since ${rknw.toFixed(3)} >= 0.9)`,
    calc: "RKNW factor: 1",
    tone: "good",
  };
}

function estimateTitle(
  attacker: ProvinceRow,
  defender: KingdomSnapshotProvince,
  selfAvgNetworth: number,
  targetAvgNetworth: number,
  defenderLatest: ProvinceRow | null,
  relationState: "war" | "oow",
  ourAttitudeToThem: string | null,
  theirAttitudeToUs: string | null,
) {
  const estimate = estimateTraditionalMarchAcres({
    attackerLand: attacker.land,
    attackerNetworth: attacker.networth,
    defenderLand: defender.land,
    defenderNetworth: defender.networth,
    selfKingdomAvgNetworth: selfAvgNetworth,
    targetKingdomAvgNetworth: targetAvgNetworth,
    defenderHitStatus: defenderLatest?.hit_status ?? null,
    relationState,
    ourAttitudeToThem,
    theirAttitudeToUs,
  });
  if (!estimate) {
    return [{ text: "Missing land, NW, or kingdom snapshot data", tone: "bad" }] satisfies TooltipLine[];
  }

  const breakability = estimateBreakability(attacker, defenderLatest);
  const zeroReason = zeroAcresReason(estimate);
  const baseAcres =
    defender.land *
    0.12 *
    estimate.rpnwFactor *
    estimate.rknwFactor *
    estimate.mapFactor *
    estimate.combinedRelationFactor;
  const rpnwInfo = rpnwBreakdown(estimate.rpnw);
  const rknwInfo = rknwBreakdown(estimate.rknw);
  const mapInfo = mapBreakdown(defenderLatest?.hit_status ?? null, relationState, estimate.mapFactor);
  const relationInfo = relationBreakdown(
    ourAttitudeToThem,
    theirAttitudeToUs,
    estimate.ourRelationFactor,
    estimate.theirRelationFactor,
  );
  return [
    { text: `${attacker.name} -> ${defender.name}`, tone: "strong" },
    ...(zeroReason ? [{ text: zeroReason, tone: estimate.rpnwFactor === 0 ? "bad" : "warn" } satisfies TooltipLine] : []),
    {
      text: `RPNW = ${fmt(defender.networth)} / ${fmt(attacker.networth ?? 0)} = ${estimate.rpnw.toFixed(3)}`,
      tone: "strong",
    },
    { text: rpnwInfo.branch, tone: rpnwInfo.tone },
    { text: rpnwInfo.calc, tone: rpnwInfo.tone },
    {
      text: `RKNW = ${fmt(targetAvgNetworth)} / ${fmt(selfAvgNetworth)} = ${estimate.rknw.toFixed(3)}`,
      tone: "strong",
    },
    { text: rknwInfo.branch, tone: rknwInfo.tone },
    { text: rknwInfo.calc, tone: rknwInfo.tone },
    {
      text: `Relation = ${relationState === "war" ? "War" : "Out of war"}`,
      tone: relationState === "war" ? "good" : "muted",
    },
    {
      text: `MAP status = ${defenderLatest?.hit_status ?? "unknown"}`,
      tone: defenderLatest?.hit_status ? "strong" : "muted",
    },
    { text: mapInfo.branch, tone: mapInfo.tone },
    { text: mapInfo.calc, tone: mapInfo.tone },
    ...relationInfo,
    {
      text: `base acres = ${fmt(defender.land)} * 0.12 * ${estimate.rpnwFactor.toFixed(3)} * ${estimate.rknwFactor.toFixed(3)} * ${estimate.mapFactor.toFixed(3)} * ${estimate.combinedRelationFactor.toFixed(3)} = ${fmt(baseAcres)}`,
      tone: baseAcres === 0 ? "bad" : estimate.capApplied ? "warn" : "good",
    },
    {
      text: `cap = min(${fmt(attacker.land ?? 0)}, ${fmt(defender.land)}) * 0.20 = ${fmt(estimate.cap)}`,
      tone: estimate.capApplied ? "warn" : "muted",
    },
    {
      text: `raw acres = min(${fmt(baseAcres)}, ${fmt(estimate.cap)}) = ${fmt(estimate.rawAcres)}`,
      tone: estimate.rawAcres === 0 ? "bad" : estimate.capApplied ? "warn" : "good",
    },
    { text: `displayed acres: ${estimate.roundedAcres}`, tone: estimate.roundedAcres === 0 ? "warn" : "strong" },
    { text: `attacker NW: ${attacker.networth?.toLocaleString() ?? "—"}` },
    { text: `defender NW: ${defender.networth.toLocaleString()}` },
    { text: `defender land: ${defender.land.toLocaleString()}` },
    { text: `self avg NW: ${Math.round(selfAvgNetworth).toLocaleString()}` },
    { text: `target avg NW: ${Math.round(targetAvgNetworth).toLocaleString()}` },
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
    { text: "Uses MAP bucket midpoint estimates. Still assumes neutral race/personality gains mods, castles, stance, siege, dragons, attack-time, ritual, anonymity, and mist.", tone: "muted" },
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
  if (!estimate) return { cell: "bg-gray-950/40", value: "text-gray-500" };
  if (estimate.roundedAcres === 0) return { cell: "bg-gray-950/60", value: "text-gray-300" };
  if (estimate.roundedAcres < 50) return { cell: "bg-amber-950/20", value: "text-amber-200" };
  if (estimate.roundedAcres < 100) return { cell: "bg-lime-950/25", value: "text-lime-200" };
  return { cell: "bg-green-950/30", value: "text-green-200" };
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
  if (estimate.mapFactor < 1) {
    badges.push(<span key="map" className="text-[9px] font-medium uppercase tracking-wide text-rose-300">MAP</span>);
  }
  if (estimate.combinedRelationFactor > 1) {
    badges.push(<span key="rel" className="text-[9px] font-medium uppercase tracking-wide text-violet-300">REL</span>);
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

export function GainsTable({ initial }: { initial: GainsPageData }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch(`/api/kingdom/${encodeURIComponent(data.targetKingdom)}/gains`);
      if (res.ok) setData(await res.json());
    }, 30_000);
    return () => clearInterval(id);
  }, [data.targetKingdom]);

  const { targetKingdom, selfKingdom, selfProvinces, targetLatest, selfSnapshot, targetSnapshot } = data;

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
  const relationState = relationStateForSnapshots(selfKingdom, targetKingdom, selfSnapshot, targetSnapshot);
  const attackBlockedByRelations =
    isNonAggressionPact(targetSnapshot.ourAttitudeToThem) ||
    isNonAggressionPact(targetSnapshot.theirAttitudeToUs);

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

  const targetLatestByName = new Map(targetLatest.map((p) => [p.name, p] as const));

  return (
    <main className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link href={`/kingdom/${encodeURIComponent(targetKingdom)}`} className="text-gray-400 hover:text-gray-200 text-sm">
          ← {targetKingdom}
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-100 font-mono">
            Gains: {selfKingdom} → {targetKingdom}
          </h1>
          <div className="text-sm text-gray-500">
            {selfSnapshot.name} → {targetSnapshot.name}
          </div>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <KingdomRelations
                kingdom={targetKingdom}
                boundKingdom={selfKingdom}
                snapshot={targetSnapshot}
              />
            </div>
            {attackBlockedByRelations && (
              <div className="rounded-lg border border-sky-500/40 bg-sky-950/30 p-4 text-sm text-sky-100 lg:w-[24rem]">
                <div className="font-semibold uppercase tracking-wide text-sky-200">
                  Non-Aggression Pact
                </div>
                <p className="mt-1">
                  Current relations indicate a ceasefire / non-aggression pact between {selfKingdom} and {targetKingdom}.
                  Hostile actions are not allowed while that relation is active.
                </p>
                <p className="mt-1 text-sky-200/80">
                  The matrix below is still useful as a sizing reference, but not as an action recommendation.
                </p>
              </div>
            )}
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
          MAP uses SoT bucket midpoints. Relations use the current directional Unfriendly and Hostile gains modifiers from the target kingdom snapshot. Neutral assumptions: race/personality gains mods, castles, stance, siege, dragons,
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
                <th className="sticky left-0 z-10 border-b border-r border-gray-800 bg-gray-950 px-3 py-2 text-left font-medium text-gray-200">
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
                  const defenderLatest = targetLatestByName.get(defender.name) ?? null;
                  const estimate = estimateTraditionalMarchAcres({
                    attackerLand: attacker.land,
                    attackerNetworth: attacker.networth,
                    defenderLand: defender.land,
                    defenderNetworth: defender.networth,
                    selfKingdomAvgNetworth: selfAvgNetworth,
                    targetKingdomAvgNetworth: targetAvgNetworth,
                    defenderHitStatus: defenderLatest?.hit_status ?? null,
                    relationState,
                    ourAttitudeToThem: targetSnapshot.ourAttitudeToThem,
                    theirAttitudeToUs: targetSnapshot.theirAttitudeToUs,
                  });
                  const breakability = estimateBreakability(attacker, defenderLatest);
                  const tone = gainsTone(estimate);
                  const badges = stateBadges(estimate, breakability);

                  return (
                    <td
                      key={`${attacker.id}:${defender.name}`}
                      className={`border-b border-r border-gray-800 px-3 py-2 text-right tabular-nums transition-colors ${tone.cell}`}
                    >
                      <Tooltip content={estimateTitle(attacker, defender, selfAvgNetworth, targetAvgNetworth, defenderLatest, relationState, targetSnapshot.ourAttitudeToThem, targetSnapshot.theirAttitudeToUs)}>
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
