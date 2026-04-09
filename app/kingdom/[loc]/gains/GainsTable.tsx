"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { Tooltip, type TooltipLine } from "@/app/components/Tooltip";
import type { KingdomSnapshotProvince, ProvinceRow } from "@/lib/db";
import { estimateBreakability, estimateTraditionalMarchAcres } from "@/lib/gains";
import type { GainsPageData } from "@/lib/gains-page";
import { formatNum, formatTimestamp } from "@/lib/ui";

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
): ReactNode {
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
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-red-200">
          Missing land, NW, or kingdom snapshot data
        </div>
      </div>
    );
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
  const mutualCeasefire =
    isNonAggressionPact(ourAttitudeToThem) &&
    isNonAggressionPact(theirAttitudeToUs);
  const relationInfo = mutualCeasefire
    ? ([
        {
          text: `Our attitude to them = ${ourAttitudeToThem ?? "Normal"}`,
          tone: "strong",
        },
        {
          text: `Their attitude to us = ${theirAttitudeToUs ?? "Normal"}`,
          tone: "strong",
        },
        {
          text: "Hostile actions are blocked by a Non-Aggression Pact / ceasefire",
          tone: "bad",
        },
      ] satisfies TooltipLine[])
    : relationBreakdown(
        ourAttitudeToThem,
        theirAttitudeToUs,
        estimate.ourRelationFactor,
        estimate.theirRelationFactor,
      );
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="rounded border border-gray-800 bg-gray-950/60 p-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="space-y-1 text-xs text-gray-300">{children}</div>
    </div>
  );
  const Row = ({ label, value, tone = "text-gray-300" }: { label: string; value: ReactNode; tone?: string }) => (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right ${tone}`}>{value}</span>
    </div>
  );
  const formulaTone =
    estimate.rpnwFactor === 0 || estimate.rawAcres === 0 ? "text-red-300"
    : estimate.capApplied ? "text-amber-300"
    : "text-green-300";
  const breakabilityLabel =
    breakability.status === "breakable"
      ? "Breakable"
      : breakability.status === "not_breakable"
        ? "Not breakable"
        : "Unknown";

  return (
    <div className="flex w-[34rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <div className="rounded border border-gray-700 bg-gray-950/80 px-3 py-2">
        <div className="text-sm font-medium text-gray-100">{attacker.name} → {defender.name}</div>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-400">
          <div>Attacker: {formatNum(attacker.networth)} NW / {attacker.land?.toLocaleString() ?? "—"}a</div>
          <div>Defender: {defender.networth.toLocaleString()} NW / {defender.land.toLocaleString()}a</div>
          <div>Self avg NW: {Math.round(selfAvgNetworth).toLocaleString()}</div>
          <div>Target avg NW: {Math.round(targetAvgNetworth).toLocaleString()}</div>
        </div>
        {zeroReason && (
          <div className={`mt-2 rounded border px-2 py-1 text-[11px] ${estimate.rpnwFactor === 0 ? "border-red-900/60 bg-red-950/30 text-red-200" : "border-amber-900/60 bg-amber-950/30 text-amber-200"}`}>
            {zeroReason}
          </div>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <Section title="Relative NW">
          <Row label="RPNW" value={`${fmt(defender.networth)} / ${fmt(attacker.networth ?? 0)} = ${estimate.rpnw.toFixed(3)}`} tone="text-gray-100" />
          <div className={rpnwInfo.tone === "bad" ? "text-red-300" : rpnwInfo.tone === "warn" ? "text-amber-300" : "text-green-300"}>
            {rpnwInfo.branch}
          </div>
          <div className={rpnwInfo.tone === "bad" ? "text-red-300" : rpnwInfo.tone === "warn" ? "text-amber-300" : "text-green-300"}>
            {rpnwInfo.calc}
          </div>
          <Row label="RKNW" value={`${fmt(targetAvgNetworth)} / ${fmt(selfAvgNetworth)} = ${estimate.rknw.toFixed(3)}`} tone="text-gray-100" />
          <div className={rknwInfo.tone === "bad" ? "text-red-300" : rknwInfo.tone === "warn" ? "text-amber-300" : "text-green-300"}>
            {rknwInfo.branch}
          </div>
          <div className={rknwInfo.tone === "bad" ? "text-red-300" : rknwInfo.tone === "warn" ? "text-amber-300" : "text-green-300"}>
            {rknwInfo.calc}
          </div>
        </Section>

        <Section title="Relations And MAP">
          <Row label="Relation" value={relationState === "war" ? "War" : "Out of war"} tone={relationState === "war" ? "text-green-300" : "text-gray-300"} />
          {relationInfo.map((line, i) => (
            <div
              key={i}
              className={
                line.tone === "bad" ? "text-red-300"
                : line.tone === "warn" ? "text-amber-300"
                : line.tone === "good" ? "text-green-300"
                : line.tone === "strong" ? "text-gray-100"
                : line.tone === "muted" ? "text-gray-500"
                : "text-gray-300"
              }
            >
              {line.text}
            </div>
          ))}
          <Row label="MAP status" value={defenderLatest?.hit_status ?? "unknown"} tone={defenderLatest?.hit_status ? "text-gray-100" : "text-gray-500"} />
          <div className={mapInfo.tone === "bad" ? "text-red-300" : mapInfo.tone === "warn" ? "text-amber-300" : mapInfo.tone === "muted" ? "text-gray-500" : "text-green-300"}>
            {mapInfo.branch}
          </div>
          <div className={mapInfo.tone === "bad" ? "text-red-300" : mapInfo.tone === "warn" ? "text-amber-300" : mapInfo.tone === "muted" ? "text-gray-500" : "text-green-300"}>
            {mapInfo.calc}
          </div>
        </Section>
      </div>

      <Section title="Calculation">
        <div className={`rounded border px-2 py-1 ${formulaTone === "text-red-300" ? "border-red-900/60 bg-red-950/20" : formulaTone === "text-amber-300" ? "border-amber-900/60 bg-amber-950/20" : "border-green-900/60 bg-green-950/20"} ${formulaTone}`}>
          {`base acres = ${fmt(defender.land)} * 0.12 * ${estimate.rpnwFactor.toFixed(3)} * ${estimate.rknwFactor.toFixed(3)} * ${estimate.mapFactor.toFixed(3)} * ${estimate.combinedRelationFactor.toFixed(3)} = ${fmt(baseAcres)}`}
        </div>
        <Row label="Cap" value={`min(${fmt(attacker.land ?? 0)}, ${fmt(defender.land)}) * 0.20 = ${fmt(estimate.cap)}`} tone={estimate.capApplied ? "text-amber-300" : "text-gray-300"} />
        <Row label="Raw acres" value={`min(${fmt(baseAcres)}, ${fmt(estimate.cap)}) = ${fmt(estimate.rawAcres)}`} tone={estimate.rawAcres === 0 ? "text-red-300" : estimate.capApplied ? "text-amber-300" : "text-green-300"} />
        <Row label="Displayed" value={estimate.roundedAcres.toLocaleString()} tone={estimate.roundedAcres === 0 ? "text-amber-300" : "text-gray-100"} />
      </Section>

      <div className="grid gap-2 md:grid-cols-2">
        <Section title="Breakability">
          <Row
            label="Status"
            value={breakabilityLabel}
            tone={
              breakability.status === "breakable"
                ? "text-green-300"
                : breakability.status === "not_breakable"
                  ? "text-red-300"
                  : "text-gray-300"
            }
          />
          <Row label="Offense source" value={breakability.offenseSource ?? "missing"} tone={breakability.offenseSource ? "text-gray-300" : "text-amber-300"} />
          <Row label="Defense source" value={breakability.defenseSource ?? "missing"} tone={breakability.defenseSource ? "text-gray-300" : "text-amber-300"} />
        </Section>

        <Section title="Assumptions">
          <div className="text-gray-400">
            Uses MAP bucket midpoint estimates. Still assumes neutral race/personality gains mods, castles, stance, siege, dragons, attack-time, ritual, anonymity, and mist.
          </div>
        </Section>
      </div>
    </div>
  );
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

export function GainsTable({
  initial,
  embedded = false,
}: {
  initial: GainsPageData;
  embedded?: boolean;
}) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch(`/api/kingdom/${encodeURIComponent(data.targetKingdom)}/gains`);
      if (res.ok) setData(await res.json());
    }, 30_000);
    return () => clearInterval(id);
  }, [data.targetKingdom]);

  const { targetKingdom, selfKingdom, selfProvinces, targetLatest, selfSnapshot, targetSnapshot } = data;
  const kingdomHref = `/kingdom/${encodeURIComponent(targetKingdom)}`;
  const gainsHref = `${kingdomHref}?view=gains`;
  const btnBase = "px-2.5 py-1 rounded text-xs border transition-colors";
  const btnActive = "border-blue-500 text-blue-300 bg-blue-950/40";
  const btnInactive = "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300";

  const controls = (
    <div className="mb-4 flex items-center gap-1.5 flex-wrap">
      <Link href={kingdomHref} className={`${btnBase} ${btnInactive}`}>
        Province Table
      </Link>
      <span className={`${btnBase} ${btnActive}`}>Gains</span>
    </div>
  );

  const wrap = (content: React.ReactNode) =>
    embedded ? (
      <div>
        {controls}
        {content}
      </div>
    ) : (
      <main className="p-6">
        {controls}
        {content}
      </main>
    );

  if (!selfKingdom) {
    return wrap(emptyState("No bound kingdom yet. Submit a self /throne page first so the site can identify your kingdom."));
  }

  if (selfProvinces.length === 0) {
    return wrap(emptyState(`No visible provinces found for your bound kingdom ${selfKingdom}.`));
  }

  if (!selfSnapshot) {
    return wrap(emptyState(`Your kingdom ${selfKingdom} needs a kingdom page submission before gains can be estimated.`));
  }

  if (!targetSnapshot) {
    return wrap(emptyState(`No kingdom page snapshot is available for ${targetKingdom} yet. Submit a kingdom_details page for that target first.`));
  }

  const selfAvgNetworth = averageNetworth(selfSnapshot.provinces);
  const targetAvgNetworth = averageNetworth(targetSnapshot.provinces);
  const relationState = relationStateForSnapshots(selfKingdom, targetKingdom, selfSnapshot, targetSnapshot);

  if (!selfAvgNetworth || !targetAvgNetworth) {
    return wrap(emptyState("One of the kingdom snapshots is missing networth data, so gains cannot be estimated."));
  }

  const targetLatestByName = new Map(targetLatest.map((p) => [p.name, p] as const));

  return wrap(
    <>
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
    </>
  );
}
