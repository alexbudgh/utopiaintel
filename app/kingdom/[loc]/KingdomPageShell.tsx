import type { ReactNode } from "react";
import type { KingdomDragon, KingdomRitual, KingdomSnapshot } from "@/lib/db";
import type { RelationContext } from "@/lib/relation-context";
import { KingdomHeader } from "./KingdomHeader";

export function KingdomPageShell({
  kingdom,
  boundKingdom,
  endpointUrl,
  kdSnapshot,
  relationContexts,
  dragon,
  ritual,
  provinceCount,
  children,
}: {
  kingdom: string;
  boundKingdom: string | null;
  endpointUrl: string;
  kdSnapshot: KingdomSnapshot | null;
  relationContexts: RelationContext[];
  dragon: KingdomDragon | null;
  ritual: KingdomRitual | null;
  provinceCount: number;
  children: ReactNode;
}) {
  return (
    <>
      <KingdomHeader
        kingdom={kingdom}
        boundKingdom={boundKingdom}
        endpointUrl={endpointUrl}
        kdSnapshot={kdSnapshot}
        relationContexts={relationContexts}
        dragon={dragon}
        ritual={ritual}
        provinceCount={provinceCount}
      />
      {children}
    </>
  );
}
