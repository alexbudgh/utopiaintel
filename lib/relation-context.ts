import type { KingdomSnapshot } from "@/lib/db";

export interface RelationContext {
  location: string;
  name: string;
  warTarget: string | null;
  theirAttitudeToUs: string | null;
  theirAttitudePoints: number | null;
  ourAttitudeToThem: string | null;
  ourAttitudePoints: number | null;
  hostilityMeterVisibleUntil: string | null;
}

export function toRelationContext(snapshot: KingdomSnapshot | null): RelationContext | null {
  if (!snapshot) return null;
  return {
    location: snapshot.location,
    name: snapshot.name,
    warTarget: snapshot.warTarget,
    theirAttitudeToUs: snapshot.theirAttitudeToUs,
    theirAttitudePoints: snapshot.theirAttitudePoints,
    ourAttitudeToThem: snapshot.ourAttitudeToThem,
    ourAttitudePoints: snapshot.ourAttitudePoints,
    hostilityMeterVisibleUntil: snapshot.hostilityMeterVisibleUntil,
  };
}
