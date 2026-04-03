import type { IntelType } from "./types";

// Detect intel type from the URL sent by the game client
export function detectIntelType(url: string): IntelType | null {
  const lower = url.toLowerCase();

  if (lower.includes("throne") && !lower.includes("kingdom")) return "sot";
  if (lower.includes("survey")) return "survey";
  if (lower.includes("spy_on_military") || lower.includes("train_army") || lower.includes("army_training")) return "som";
  if (lower.includes("spy_on_sciences") || lower.includes("science")) return "sos";
  if (lower.includes("spy_on_defense")) return "sod";
  if (lower.includes("kingdom_details") || lower.includes("kingdom")) return "kingdom";

  return null;
}
