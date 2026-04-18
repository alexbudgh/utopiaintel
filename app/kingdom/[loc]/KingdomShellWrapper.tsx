"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { KingdomDragon, KingdomRitual, KingdomSnapshot, ProvinceRow } from "@/lib/db";
import type { RelationContext } from "@/lib/relation-context";
import { KingdomPageShell } from "./KingdomPageShell";

export type KingdomPollPayload = {
  provinces: ProvinceRow[];
  kdSnapshot: KingdomSnapshot | null;
  relationContexts: RelationContext[];
  dragon: KingdomDragon | null;
  ritual: KingdomRitual | null;
};

export function KingdomShellWrapper({
  kingdom,
  boundKingdom,
  endpointUrl,
  initialKdSnapshot,
  initialRelationContexts,
  initialDragon,
  initialRitual,
  initialProvinceCount,
  onPollResult,
  children,
}: {
  kingdom: string;
  boundKingdom: string | null;
  endpointUrl: string;
  initialKdSnapshot: KingdomSnapshot | null;
  initialRelationContexts: RelationContext[];
  initialDragon: KingdomDragon | null;
  initialRitual: KingdomRitual | null;
  initialProvinceCount: number;
  onPollResult?: (payload: KingdomPollPayload) => void;
  children: ReactNode;
}) {
  const [kdSnapshot, setKdSnapshot] = useState(initialKdSnapshot);
  const [relationContexts, setRelationContexts] = useState(initialRelationContexts);
  const [dragon, setDragon] = useState(initialDragon);
  const [ritual, setRitual] = useState(initialRitual);
  const [provinceCount, setProvinceCount] = useState(initialProvinceCount);

  useEffect(() => { setKdSnapshot(initialKdSnapshot); }, [initialKdSnapshot]);
  useEffect(() => { setRelationContexts(initialRelationContexts); }, [initialRelationContexts]);
  useEffect(() => { setDragon(initialDragon); }, [initialDragon]);
  useEffect(() => { setRitual(initialRitual); }, [initialRitual]);
  useEffect(() => { setProvinceCount(initialProvinceCount); }, [initialProvinceCount]);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch(`/api/kingdom/${encodeURIComponent(kingdom)}`);
      if (!res.ok) return;
      const payload = await res.json() as KingdomPollPayload;
      setKdSnapshot(payload.kdSnapshot);
      setRelationContexts(payload.relationContexts);
      setDragon(payload.dragon);
      setRitual(payload.ritual);
      setProvinceCount(payload.provinces.length);
      onPollResult?.(payload);
    }, 30_000);
    return () => clearInterval(id);
  }, [kingdom, onPollResult]);

  return (
    <KingdomPageShell
      kingdom={kingdom}
      boundKingdom={boundKingdom}
      endpointUrl={endpointUrl}
      kdSnapshot={kdSnapshot}
      relationContexts={relationContexts}
      dragon={dragon}
      ritual={ritual}
      provinceCount={provinceCount}
    >
      {children}
    </KingdomPageShell>
  );
}
