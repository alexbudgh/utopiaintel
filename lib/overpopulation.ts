export interface OverpopulationTone {
  textClass: string;
  barClass: string;
}

export function overpopulationTone(pct: number): OverpopulationTone {
  if (pct <= 1) return { textClass: "text-green-400", barClass: "bg-green-500" };
  if (pct < 1.15) return { textClass: "text-yellow-400", barClass: "bg-yellow-500" };
  if (pct < 1.3) return { textClass: "text-orange-400", barClass: "bg-orange-500" };
  if (pct < 1.4) return { textClass: "text-red-400", barClass: "bg-red-500" };
  return { textClass: "text-fuchsia-400", barClass: "bg-fuchsia-500" };
}
