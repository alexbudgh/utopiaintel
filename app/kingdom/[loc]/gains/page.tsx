export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import { createHash } from "crypto";
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
    return "Missing land, NW, or kingdom snapshot data";
  }

  const breakability = estimateBreakability(attacker, defenderLatest);
  return [
    `${attacker.name} -> ${defender.name}`,
    `raw acres: ${estimate.rawAcres.toFixed(2)}`,
    `displayed acres: ${estimate.roundedAcres}`,
    `attacker NW: ${attacker.networth?.toLocaleString() ?? "—"}`,
    `defender NW: ${defender.networth.toLocaleString()}`,
    `defender land: ${defender.land.toLocaleString()}`,
    `rpnw: ${estimate.rpnw.toFixed(3)} -> ${estimate.rpnwFactor.toFixed(3)}`,
    `self avg NW: ${Math.round(selfAvgNetworth).toLocaleString()}`,
    `target avg NW: ${Math.round(targetAvgNetworth).toLocaleString()}`,
    `rknw: ${estimate.rknw.toFixed(3)} -> ${estimate.rknwFactor.toFixed(3)}`,
    `cap: ${estimate.cap.toFixed(2)}${estimate.capApplied ? " (applied)" : ""}`,
    `breakability: ${
      breakability.status === "breakable"
        ? "breakable"
        : breakability.status === "not_breakable"
          ? "not breakable"
          : "unknown"
    }`,
    `offense source: ${breakability.offenseSource ?? "missing"}`,
    `defense source: ${breakability.defenseSource ?? "missing"}`,
    "Assumes neutral MAP, race/personality gains mods, castles, relations, stance, siege, dragons, attack-time, ritual, anonymity, and mist.",
  ].join("\n");
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
        <h1 className="text-xl font-bold text-gray-100 font-mono">
          Gains: {selfKingdom} → {targetKingdom}
        </h1>
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
                  title={`${defender.name}\nNW ${defender.networth.toLocaleString()}\nLand ${defender.land.toLocaleString()}`}
                >
                  <div>{defender.name}</div>
                  <div className="mt-1 text-[10px] font-normal text-gray-500">
                    {formatNum(defender.networth)} / {formatNum(defender.land)}a
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selfProvinces.map((attacker) => (
              <tr key={attacker.id} className="hover:bg-gray-900/40">
                <th
                  className="sticky left-0 z-10 border-b border-r border-gray-800 bg-gray-950 px-3 py-2 text-left font-medium text-gray-200"
                  title={`${attacker.name}\nNW ${attacker.networth?.toLocaleString() ?? "—"}\nLand ${attacker.land?.toLocaleString() ?? "—"}`}
                >
                  <Link
                    href={`/kingdom/${encodeURIComponent(selfKingdom)}/${encodeURIComponent(attacker.name)}`}
                    className="hover:text-blue-400"
                  >
                    {attacker.name}
                  </Link>
                  <div className="mt-1 text-[10px] font-normal text-gray-500">
                    {formatNum(attacker.networth)} / {formatNum(attacker.land)}a
                  </div>
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

                  return (
                    <td
                      key={`${attacker.id}:${defender.name}`}
                      className="border-b border-r border-gray-800 px-3 py-2 text-right tabular-nums"
                      title={estimateTitle(attacker, defender, selfAvgNetworth, targetAvgNetworth, defenderLatest)}
                    >
                      <div className={estimate ? "text-gray-100" : "text-gray-500"}>
                        {estimate ? estimate.roundedAcres.toLocaleString() : "—"}
                      </div>
                      <div className="mt-1">
                        {breakMarker(attacker, defenderLatest)}
                      </div>
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
