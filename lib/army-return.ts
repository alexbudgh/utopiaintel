import { parseUtc } from "./ui";

const HOUR_MS = 3_600_000;

export type ArmyReturnStatus = {
  returnAtMs: number;
  returnAtIso: string;
  remainingHours: number;
  returned: boolean;
  durationLabel: string;
  shortLabel: string;
  detailLabel: string;
};

export function utcMillisToDbTimestamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export function formatArmyDurationHours(hours: number): string {
  const value = Math.abs(hours);
  if (value < 0.05) return "now";
  if (value < 10) return `${value.toFixed(1)}h`;
  return `${Math.round(value)}h`;
}

export function armyReturnStatus(
  receivedAt: string,
  etaHours: number,
  nowMs = Date.now(),
): ArmyReturnStatus {
  const returnAtMs = parseUtc(receivedAt) + etaHours * HOUR_MS;
  const remainingHours = (returnAtMs - nowMs) / HOUR_MS;
  const returned = remainingHours <= 0;
  const durationLabel = formatArmyDurationHours(remainingHours);
  const detailLabel = returned
    ? durationLabel === "now"
      ? "Returned now"
      : `Returned ${durationLabel} ago`
    : `Returns in ${durationLabel}`;

  return {
    returnAtMs,
    returnAtIso: utcMillisToDbTimestamp(returnAtMs),
    remainingHours,
    returned,
    durationLabel,
    shortLabel: returned ? "returned" : durationLabel,
    detailLabel,
  };
}
