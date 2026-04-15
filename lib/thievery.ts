import type { ProvinceRow } from "@/lib/db";

export type Op = "vaults" | "granaries" | "towers";

export interface OpConfig {
  label: string;
  resource: (p: ProvinceRow) => number | null;
  capOow: number;
  capWar: number;
  unit: string;
}

export const OPS: Record<Op, OpConfig> = {
  vaults:    { label: "Vaults",    resource: (p) => p.money, capOow: 0.052, capWar: 0.14,  unit: "gc" },
  granaries: { label: "Granaries", resource: (p) => p.food,  capOow: 0.315, capWar: 0.46,  unit: "bu" },
  towers:    { label: "Towers",    resource: (p) => p.runes, capOow: 0.245, capWar: 0.35,  unit: "ru" },
};

export interface CellResult {
  value: number | null;
  rawCap: number | null;
  nwRatio: number | null;
  shieldingFactor: number;
  watchtowersFactor: number;
}

export function computeCell(attacker: ProvinceRow, defender: ProvinceRow, op: Op, isWar: boolean): CellResult {
  const config = OPS[op];
  const resource = config.resource(defender);
  if (resource == null) {
    return { value: null, rawCap: null, nwRatio: null, shieldingFactor: 1, watchtowersFactor: 1 };
  }

  const capRate = isWar ? config.capWar : config.capOow;
  const rawCap = resource * capRate;

  const nwRatio =
    attacker.networth && defender.networth
      ? Math.min(attacker.networth / defender.networth, defender.networth / attacker.networth)
      : null;

  const shieldingFactor =
    defender.shielding_effect != null ? 1 - defender.shielding_effect / 100 : 1;
  const watchtowersFactor =
    defender.watch_towers_effect != null ? 1 - defender.watch_towers_effect / 100 : 1;

  const value = rawCap * (nwRatio ?? 1) * shieldingFactor * watchtowersFactor;

  return { value, rawCap, nwRatio, shieldingFactor, watchtowersFactor };
}
