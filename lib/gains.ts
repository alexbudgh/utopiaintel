import type { ProvinceRow } from "@/lib/db";

export interface TraditionalMarchEstimate {
  rawAcres: number;
  roundedAcres: number;
  cap: number;
  capApplied: boolean;
  rpnw: number;
  rpnwFactor: number;
  rknw: number;
  rknwFactor: number;
}

export interface BreakabilityEstimate {
  status: "breakable" | "not_breakable" | "unknown";
  offense: number | null;
  defense: number | null;
  offenseSource: "off_home" | "off_points" | null;
  defenseSource: "def_home" | "def_points" | null;
}

export function provinceNetworthFactor(rpnw: number): number {
  if (rpnw <= 0.567) return 0;
  if (rpnw < 0.9) return 3 * rpnw - 1.7;
  if (rpnw <= 1.1) return 1;
  if (rpnw < 1.6) return -2 * rpnw + 3.2;
  return 0;
}

export function kingdomNetworthFactor(rknw: number): number {
  if (rknw <= 0.5) return 0.8;
  if (rknw < 0.9) return rknw / 2 + 0.55;
  return 1;
}

export function estimateTraditionalMarchAcres(input: {
  attackerLand: number | null;
  attackerNetworth: number | null;
  defenderLand: number | null;
  defenderNetworth: number | null;
  selfKingdomAvgNetworth: number | null;
  targetKingdomAvgNetworth: number | null;
}): TraditionalMarchEstimate | null {
  const {
    attackerLand,
    attackerNetworth,
    defenderLand,
    defenderNetworth,
    selfKingdomAvgNetworth,
    targetKingdomAvgNetworth,
  } = input;

  if (
    !attackerLand || !attackerNetworth ||
    !defenderLand || !defenderNetworth ||
    !selfKingdomAvgNetworth || !targetKingdomAvgNetworth
  ) {
    return null;
  }

  const rpnw = defenderNetworth / attackerNetworth;
  const rknw = targetKingdomAvgNetworth / selfKingdomAvgNetworth;
  const rpnwFactor = provinceNetworthFactor(rpnw);
  const rknwFactor = kingdomNetworthFactor(rknw);
  const baseAcres = defenderLand * 0.12 * rpnwFactor * rknwFactor;
  const cap = Math.min(attackerLand, defenderLand) * 0.2;
  const rawAcres = Math.min(baseAcres, cap);

  return {
    rawAcres,
    roundedAcres: Math.round(rawAcres),
    cap,
    capApplied: rawAcres < baseAcres,
    rpnw,
    rpnwFactor,
    rknw,
    rknwFactor,
  };
}

export function estimateBreakability(attacker: ProvinceRow, defender: ProvinceRow | null): BreakabilityEstimate {
  const offense = attacker.off_home ?? attacker.off_points ?? null;
  const defense = defender ? (defender.def_home ?? defender.def_points ?? null) : null;
  const offenseSource = attacker.off_home != null ? "off_home" : attacker.off_points != null ? "off_points" : null;
  const defenseSource = defender
    ? (defender.def_home != null ? "def_home" : defender.def_points != null ? "def_points" : null)
    : null;

  if (offense == null || defense == null) {
    return {
      status: "unknown",
      offense,
      defense,
      offenseSource,
      defenseSource,
    };
  }

  return {
    status: offense > defense ? "breakable" : "not_breakable",
    offense,
    defense,
    offenseSource,
    defenseSource,
  };
}
