"use client";

import { useCallback, useEffect, useState } from "react";
import type { KingdomDragon, KingdomRitual, KingdomSnapshot, ProvinceRow } from "@/lib/db";
import type { RelationContext } from "@/lib/relation-context";
import { ProvinceTable } from "./ProvinceTable";
import { KingdomShellWrapper, type KingdomPollPayload } from "./KingdomShellWrapper";

export function KingdomProvinceView({
  kingdom,
  boundKingdom,
  endpointUrl,
  initialProvinces,
  initialKdSnapshot,
  initialRelationContexts,
  initialDragon,
  initialRitual,
}: {
  kingdom: string;
  boundKingdom: string | null;
  endpointUrl: string;
  initialProvinces: ProvinceRow[];
  initialKdSnapshot: KingdomSnapshot | null;
  initialRelationContexts: RelationContext[];
  initialDragon: KingdomDragon | null;
  initialRitual: KingdomRitual | null;
}) {
  const [provinces, setProvinces] = useState(initialProvinces);

  useEffect(() => { setProvinces(initialProvinces); }, [initialProvinces]);

  const onPollResult = useCallback((payload: KingdomPollPayload) => {
    setProvinces(payload.provinces);
  }, []);

  return (
    <KingdomShellWrapper
      kingdom={kingdom}
      boundKingdom={boundKingdom}
      endpointUrl={endpointUrl}
      initialKdSnapshot={initialKdSnapshot}
      initialRelationContexts={initialRelationContexts}
      initialDragon={initialDragon}
      initialRitual={initialRitual}
      initialProvinceCount={initialProvinces.length}
      onPollResult={onPollResult}
    >
      <ProvinceTable kingdom={kingdom} provinces={provinces} />
    </KingdomShellWrapper>
  );
}
