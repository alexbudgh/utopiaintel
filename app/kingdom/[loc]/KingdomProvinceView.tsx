"use client";

import { useEffect, useState } from "react";
import type { KingdomDragon, KingdomRitual, KingdomSnapshot, ProvinceRow } from "@/lib/db";
import type { RelationContext } from "@/lib/relation-context";
import { ProvinceTable } from "./ProvinceTable";
import { KingdomPageShell } from "./KingdomPageShell";

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
  const [kdSnapshot, setKdSnapshot] = useState(initialKdSnapshot);
  const [relationContexts, setRelationContexts] = useState(initialRelationContexts);
  const [dragon, setDragon] = useState(initialDragon);
  const [ritual, setRitual] = useState(initialRitual);

  useEffect(() => {
    setProvinces(initialProvinces);
  }, [initialProvinces]);

  useEffect(() => {
    setKdSnapshot(initialKdSnapshot);
  }, [initialKdSnapshot]);

  useEffect(() => {
    setRelationContexts(initialRelationContexts);
  }, [initialRelationContexts]);

  useEffect(() => {
    setDragon(initialDragon);
  }, [initialDragon]);

  useEffect(() => {
    setRitual(initialRitual);
  }, [initialRitual]);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch(`/api/kingdom/${encodeURIComponent(kingdom)}`);
      if (!res.ok) return;
      const payload = await res.json() as {
        provinces: ProvinceRow[];
        kdSnapshot: KingdomSnapshot | null;
        relationContexts: RelationContext[];
        dragon: KingdomDragon | null;
        ritual: KingdomRitual | null;
      };
      setProvinces(payload.provinces);
      setKdSnapshot(payload.kdSnapshot);
      setRelationContexts(payload.relationContexts);
      setDragon(payload.dragon);
      setRitual(payload.ritual);
    }, 30_000);
    return () => clearInterval(id);
  }, [kingdom]);

  return (
    <KingdomPageShell
      kingdom={kingdom}
      boundKingdom={boundKingdom}
      endpointUrl={endpointUrl}
      kdSnapshot={kdSnapshot}
      relationContexts={relationContexts}
      dragon={dragon}
      ritual={ritual}
      provinceCount={provinces.length}
    >
      <ProvinceTable kingdom={kingdom} provinces={provinces} />
    </KingdomPageShell>
  );
}
