import { formatUtopiaDate, parseUtc, parseUtopiaDate } from "./ui";

const HOUR_MS = 3_600_000;

// Age 115 start. Update this alongside other age-specific constants.
export const CURRENT_AGE_START_UTC = "2026-04-28 18:00:00";
// Unix seconds at age start — used in SQL to convert received_at to game_date_ord:
//   (UNIX_TIMESTAMP(received_at) - AGE_START_UNIX_SECS) DIV 3600
export const AGE_START_UNIX_SECS = Math.floor(
  Date.parse(CURRENT_AGE_START_UTC.replace(" ", "T") + "Z") / 1000,
);

export function utopiaDateOrdToUtcMs(gameDateOrd: number): number {
  return (
    Date.parse(CURRENT_AGE_START_UTC.replace(" ", "T") + "Z") +
    gameDateOrd * HOUR_MS
  );
}

export function utcMsToUtopiaDateOrd(ms: number): number {
  return Math.floor(
    (ms - Date.parse(CURRENT_AGE_START_UTC.replace(" ", "T") + "Z")) / HOUR_MS,
  );
}

export function utopiaDateOrdToUtcTimestamp(gameDateOrd: number): string {
  return new Date(utopiaDateOrdToUtcMs(gameDateOrd))
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

export function utopiaDateToUtcTimestamp(gameDate: string): string | null {
  const ord = parseUtopiaDate(gameDate);
  if (ord < 0) return null;
  return utopiaDateOrdToUtcTimestamp(ord);
}

export function utcTimestampToUtopiaDate(timestamp: string): string | null {
  const ms = parseUtc(timestamp);
  if (!Number.isFinite(ms)) return null;
  return formatUtopiaDate(utcMsToUtopiaDateOrd(ms));
}
