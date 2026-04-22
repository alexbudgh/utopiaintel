// Computes ambush raw offense required to break a defending army.
// Formula: (elites*eliteDefStr + offSpecs*defSpecStr + soldiers*soldierStr) * 0.8 + 1
// Off specs defend at the racial def spec's defense value (their own is 0).
// Def specs cannot be sent on attacks — ignored.

import { getRaceByName } from "./game";

export function computeAmbushRawOff(
  race: string | null | undefined,
  army: { elites: number; offSpecs: number; soldiers: number },
): number | null {
  if (!race) return null;
  const r = getRaceByName(race);
  if (!r) return null;
  const totalDef =
    army.elites   * r.eliteDefStr +
    army.offSpecs * r.defSpecStr  +
    army.soldiers * r.soldierStr;
  return totalDef * 0.8 + 1;
}
