// SQLite datetime('now') produces "YYYY-MM-DD HH:MM:SS" without timezone —
// treat as UTC by normalising to an ISO 8601 string with Z suffix.
function parseUtc(iso: string): number {
  return new Date(iso.replace(" ", "T") + "Z").getTime();
}

// Returns true when all non-null timestamps are within one game tick (1 hour) of each other
export function sameTick(...ages: (string | null)[]): boolean {
  const valid = ages.filter(Boolean) as string[];
  if (valid.length < 2) return false;
  const times = valid.map(parseUtc);
  return Math.max(...times) - Math.min(...times) < 3_600_000;
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

export function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  // "2024-04-04 10:30:00" → "Apr 4, 10:30 UTC"
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "UTC",
  }) + " UTC";
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
