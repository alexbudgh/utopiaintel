import type { ProvinceRow } from "@/lib/db";

export type Op = "vaults" | "granaries" | "towers" | "night_strike";
export type ResourceOp = Exclude<Op, "night_strike">;
export type NightStrikeUnitKey = "soldiers" | "off_specs" | "def_specs" | "elites";

export interface ResourceOpConfig {
  kind: "resource";
  label: string;
  resource: (p: ProvinceRow) => number | null;
  capOow: number;
  capWar: number;
  unit: string;
}

export interface NightStrikeOpConfig {
  kind: "night_strike";
  label: string;
}

export type OpConfig = ResourceOpConfig | NightStrikeOpConfig;

export const OPS = {
  vaults:       { kind: "resource", label: "Vaults",       resource: (p) => p.money, capOow: 0.052, capWar: 0.14,  unit: "gc" },
  granaries:    { kind: "resource", label: "Granaries",    resource: (p) => p.food,  capOow: 0.315, capWar: 0.46,  unit: "bushels" },
  towers:       { kind: "resource", label: "Towers",       resource: (p) => p.runes, capOow: 0.245, capWar: 0.35,  unit: "runes" },
  night_strike: { kind: "night_strike", label: "Night Strike" },
} satisfies Record<Op, OpConfig>;

export interface NightStrikeUnitResult {
  key: NightStrikeUnitKey;
  label: string;
  targetTotal: number | null;
  capRate: number;
  ratePerThief: number;
  rawCap: number | null;
  rawActual: number | null;
  adjustedCap: number | null;
  adjustedActual: number | null;
  usedFallback: boolean;
}

export interface CellResult {
  kind: "resource" | "night_strike";
  value: number | null;
  rawCap: number | null;
  nwRatio: number | null;
  shieldingFactor: number;
  watchtowersFactor: number;
  resource?: number | null;
  capRate?: number;
  unit?: string;
  nightStrike?: {
    actualValue: number | null;
    capValue: number | null;
    attackerThieves: number | null;
    partial: boolean;
    usedFallback: boolean;
    hasAnyTroopData: boolean;
    breakdown: NightStrikeUnitResult[];
  };
}

export const NIGHT_STRIKE_UNITS: Record<NightStrikeUnitKey, {
  label: string;
  total: (p: ProvinceRow) => number | null;
  warCap: number;
  warRate: number;
  oowCap: number | null;
  oowRate: number | null;
}> = {
  soldiers: {
    label: "Soldiers",
    total: (p) => p.soldiers,
    warCap: 0.13,
    warRate: 0.6,
    oowCap: 0.11,
    oowRate: 0.84,
  },
  off_specs: {
    label: "Off specs",
    total: (p) => p.off_specs,
    warCap: 0.0036,
    warRate: 0.0228,
    oowCap: null,
    oowRate: 0.23,
  },
  def_specs: {
    label: "Def specs",
    total: (p) => p.def_specs,
    warCap: 0.0048,
    warRate: 0.022,
    oowCap: null,
    oowRate: null,
  },
  elites: {
    label: "Elites",
    total: (p) => p.elites,
    warCap: 0.0048,
    warRate: 0.022,
    oowCap: null,
    oowRate: null,
  },
};

function getNwRatio(attacker: ProvinceRow, defender: ProvinceRow): number | null {
  return attacker.networth && defender.networth
    ? Math.min(attacker.networth / defender.networth, defender.networth / attacker.networth)
    : null;
}

function getShieldingFactor(defender: ProvinceRow): number {
  return defender.shielding_effect != null ? 1 - defender.shielding_effect / 100 : 1;
}

function getWatchtowersFactor(defender: ProvinceRow): number {
  return defender.watch_towers_effect != null ? 1 - defender.watch_towers_effect / 100 : 1;
}

function sumKnown(values: Array<number | null>): number | null {
  let hasValue = false;
  let total = 0;
  for (const value of values) {
    if (value == null) continue;
    hasValue = true;
    total += value;
  }
  return hasValue ? total : null;
}

function computeNightStrikeCell(attacker: ProvinceRow, defender: ProvinceRow, isWar: boolean): CellResult {
  const nwRatio = getNwRatio(attacker, defender);
  const shieldingFactor = getShieldingFactor(defender);
  const watchtowersFactor = getWatchtowersFactor(defender);
  const factor = (nwRatio ?? 1) * shieldingFactor * watchtowersFactor;

  const breakdown = (Object.entries(NIGHT_STRIKE_UNITS) as Array<[NightStrikeUnitKey, typeof NIGHT_STRIKE_UNITS[NightStrikeUnitKey]]>)
    .map(([key, config]) => {
      const targetTotal = config.total(defender);
      const capRate = isWar ? config.warCap : (config.oowCap ?? config.warCap);
      const ratePerThief = isWar ? config.warRate : (config.oowRate ?? config.warRate);
      const rawCap = targetTotal != null ? targetTotal * capRate : null;
      const rawActual = rawCap != null && attacker.thieves != null
        ? Math.min(rawCap, attacker.thieves * ratePerThief)
        : null;

      return {
        key,
        label: config.label,
        targetTotal,
        capRate,
        ratePerThief,
        rawCap,
        rawActual,
        adjustedCap: rawCap != null ? rawCap * factor : null,
        adjustedActual: rawActual != null ? rawActual * factor : null,
        usedFallback: !isWar && (config.oowCap == null || config.oowRate == null),
      };
    });

  const capValue = sumKnown(breakdown.map((unit) => unit.adjustedCap));
  const actualValue = sumKnown(breakdown.map((unit) => unit.adjustedActual));
  const partial = breakdown.some((unit) => unit.targetTotal == null) && breakdown.some((unit) => unit.targetTotal != null);
  const hasAnyTroopData = breakdown.some((unit) => unit.targetTotal != null);

  return {
    kind: "night_strike",
    value: actualValue ?? capValue,
    rawCap: null,
    nwRatio,
    shieldingFactor,
    watchtowersFactor,
    nightStrike: {
      actualValue,
      capValue,
      attackerThieves: attacker.thieves,
      partial,
      usedFallback: breakdown.some((unit) => unit.usedFallback),
      hasAnyTroopData,
      breakdown,
    },
  };
}

export function computeCell(attacker: ProvinceRow, defender: ProvinceRow, op: Op, isWar: boolean): CellResult {
  const config = OPS[op];
  if (config.kind === "night_strike") {
    return computeNightStrikeCell(attacker, defender, isWar);
  }

  const resource = config.resource(defender);
  if (resource == null) {
    return {
      kind: "resource",
      value: null,
      rawCap: null,
      nwRatio: null,
      shieldingFactor: 1,
      watchtowersFactor: 1,
      resource: null,
      capRate: isWar ? config.capWar : config.capOow,
      unit: config.unit,
    };
  }

  const capRate = isWar ? config.capWar : config.capOow;
  const rawCap = resource * capRate;
  const nwRatio = getNwRatio(attacker, defender);
  const shieldingFactor = getShieldingFactor(defender);
  const watchtowersFactor = getWatchtowersFactor(defender);

  const value = rawCap * (nwRatio ?? 1) * shieldingFactor * watchtowersFactor;

  return {
    kind: "resource",
    value,
    rawCap,
    nwRatio,
    shieldingFactor,
    watchtowersFactor,
    resource,
    capRate,
    unit: config.unit,
  };
}
