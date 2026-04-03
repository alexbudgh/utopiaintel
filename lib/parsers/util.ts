// Shared parsing utilities

/** Parse a number string with commas, e.g. "1,234" → 1234 */
export function parseNum(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10) || 0;
}

/** Parse a float string, e.g. "1,234.5" → 1234.5 */
export function parseFloat_(s: string): number {
  return parseFloat(s.replace(/,/g, "")) || 0;
}

/** Extract province name and kingdom location from a pattern match */
export function parseProvinceKd(
  text: string,
  pattern: RegExp,
): { name: string; kingdom: string } | null {
  const m = pattern.exec(text);
  if (!m) return null;
  return {
    name: m[1].trim(),
    kingdom: m[2].replace(/[()]/g, ""),
  };
}

/** INT pattern: matches numbers with optional commas */
export const INT = "[\\d,]+";
export const SIGNED_INT = "-?[\\d,]+";
export const FLOAT = "[\\d,]*\\.?\\d+";

/** KDLOC pattern: matches (X:Y) */
export const KDLOC = "\\((\\d{1,2}:\\d{1,2})\\)";

/** Accuracy pattern used by most spy ops */
export const ACCURACY_RE = /we have\s*([\d,]+)%\s*confidence in the information retrieved/;

export function parseAccuracy(text: string): number {
  const m = ACCURACY_RE.exec(text);
  return m ? parseNum(m[1]) : 100;
}
