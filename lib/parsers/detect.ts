import type { IntelType } from "./types";

// Detect intel type from the URL sent by the game client.
// Self-intel pages (council_*) share the same data format as spy results but without
// a province preamble — parsers accept a selfProv fallback for those.
export function detectIntelType(url: string): IntelType | null {
  const lower = url.toLowerCase();

  // Self-intel pages (use prov field as province name, kingdom="")
  if (lower.includes("council_science")) return "sos";
  if (lower.includes("council_military")) return "som";
  if (lower.includes("council_state")) return "state";
  // council_spells, council_history, council_internal, throne — no structured data

  // Spy/thievery operations
  if (lower.includes("spy_on_throne")) return "sot";
  if (lower.includes("spy_on_military") || lower.includes("train_army") || lower.includes("army_training")) return "som";
  if (lower.includes("spy_on_sciences")) return "sos";
  if (lower.includes("spy_on_defense")) return "sod";

  // Non-thievery pages
  if (lower.includes("survey")) return "survey";
  if (lower.includes("kingdom_details") || lower.includes("kingdom")) return "kingdom";

  return null;
}
