"use client";

import { Tooltip } from "@/app/components/Tooltip";
import {
  TACTICIAN_AMBUSH_LAND_RETURN_FACTOR,
  ambushLandReturnFactor,
} from "@/lib/ambush";

export function AmbushLandReturnMarker({
  targetPersonality,
}: {
  targetPersonality: string | null | undefined;
}) {
  if (
    ambushLandReturnFactor(targetPersonality) !==
    TACTICIAN_AMBUSH_LAND_RETURN_FACTOR
  ) {
    return null;
  }

  return (
    <Tooltip content="Tactician target: Ambush returns 25% land instead of the normal 50%.">
      <sup className="ml-0.5 cursor-help text-[10px] font-semibold leading-none text-amber-300">
        *
      </sup>
    </Tooltip>
  );
}
