const UTOPIA_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
];

export const UTOPIA_DAYS_PER_MONTH = 24;

/** Convert "Month D of YRN" → sortable ordinal (year*168 + monthIdx*24 + day-1). Returns -1 if unparseable. */
export function parseUtopiaDate(date: string): number {
  const m = /^(\w+)\s+(\d+)\s+of\s+YR(\d+)$/i.exec(date.trim());
  if (!m) return -1;
  const monthIdx = UTOPIA_MONTHS.indexOf(m[1]);
  if (monthIdx === -1) return -1;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  return year * 7 * 24 + monthIdx * 24 + (day - 1);
}

/** Convert ordinal back to "Month D of YRN". */
export function formatUtopiaDate(ord: number): string {
  const year = Math.floor(ord / (7 * 24));
  const remainder = ord % (7 * 24);
  const monthIdx = Math.floor(remainder / 24);
  const day = (remainder % 24) + 1;
  return `${UTOPIA_MONTHS[monthIdx]} ${day} of YR${year}`;
}

// Stored DB timestamps use "YYYY-MM-DD HH:MM:SS" without timezone; treat them
// as UTC by normalising to an ISO 8601 string with Z suffix.
export function parseUtc(iso: string): number {
  return new Date(iso.replace(" ", "T") + "Z").getTime();
}

// Returns true when all non-null timestamps share the same UTC hour (game tick boundary)
export function sameTick(...ages: (string | null)[]): boolean {
  const valid = ages.filter(Boolean) as string[];
  if (valid.length < 2) return false;
  const hours = valid.map((iso) => Math.floor(parseUtc(iso) / 3_600_000));
  return hours.every((h) => h === hours[0]);
}

export function freshnessColor(age: string | null): string {
  if (!age) return "text-gray-600";
  const hrs = (Date.now() - parseUtc(age)) / 3_600_000;
  if (hrs < 1) return "text-green-400";
  if (hrs < 6) return "text-yellow-400";
  return "text-red-400";
}

export function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "k";
  return n.toLocaleString();
}

export function formatLand(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString()}a`;
}

export function formatNetworth(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString()} gc`;
}

export function formatExactNum(
  n: number | null | undefined,
  maximumFractionDigits = 4,
): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits });
}

export function fullValueTooltip(
  displayed: string,
  n: number | null | undefined,
  {
    suffix = "",
    maximumFractionDigits = 4,
  }: {
    suffix?: string;
    maximumFractionDigits?: number;
  } = {},
): string | null {
  if (n == null) return null;
  const exact = `${formatExactNum(n, maximumFractionDigits)}${suffix}`;
  return displayed === exact ? null : `Full value: ${exact}`;
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  // "2024-04-04 10:30:00" → "Apr 4, 10:30 UTC"
  const d = new Date(iso.replace(" ", "T") + "Z");
  return (
    d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

export function formatLocalTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

export function formatAgeWithLocalTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return `${timeAgo(iso)} · ${formatLocalTimestamp(iso)}`;
}

export function formatLocalDate(iso: string | null): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - parseUtc(iso)) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
