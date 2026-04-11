import type { IntelType } from "./types";

export function getIntelPathname(url: string): string | null {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
}

function getUtopiaThieveryOp(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.toLowerCase() !== "/wol/game/thievery") return null;
    return parsed.searchParams.get("o")?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

// Detect intel type from the URL sent by the game client.
// Self-intel pages (council_*) share the same data format as spy results but without
// a province preamble — parsers accept a selfProv fallback for those.
export function detectIntelType(url: string): IntelType | null {
  const pathname = getIntelPathname(url);
  if (!pathname) return null;

  // Self-intel pages (use prov field as province name, kingdom="")
  if (pathname.endsWith("/council_science")) return "sos";
  if (pathname.endsWith("/council_military")) return "som";
  if (pathname.endsWith("/council_state")) return "state";
  if (pathname.endsWith("/council_internal")) return "survey";
  if (pathname.endsWith("/throne")) return "sot";
  // council_spells, council_history — no structured data

  // Spy/thievery operations
  const thieveryOp = getUtopiaThieveryOp(url);
  if (thieveryOp === "SPY_ON_THRONE") return "sot";
  if (thieveryOp === "SPY_ON_MILITARY") return "som";
  if (thieveryOp === "SPY_ON_SCIENCES") return "sos";
  if (thieveryOp === "SPY_ON_DEFENSE") return "sod";
  if (thieveryOp === "SURVEY") return "survey";
  if (thieveryOp === "INFILTRATE") return "infiltrate";
  // TODO: Add parsers/storage for other thievery ops we see in production,
  // such as SNATCH_NEWS and SPY_ON_EXPLORATION.

  if (pathname.endsWith("/spy_on_throne")) return "sot";
  if (pathname.endsWith("/spy_on_military") || pathname.endsWith("/train_army") || pathname.endsWith("/army_training")) return "som";
  if (pathname.endsWith("/spy_on_sciences")) return "sos";
  if (pathname.endsWith("/spy_on_defense")) return "sod";
  if (pathname.endsWith("/infiltrate")) return "infiltrate";

  // Non-thievery pages
  if (pathname.endsWith("/survey")) return "survey";
  if (pathname === "/wol/game/kingdom" || pathname.startsWith("/wol/game/kingdom_details")) return "kingdom";
  if (pathname === "/wol/game/kingdom_news" || pathname.startsWith("/wol/game/kingdom_news/")) return "kingdom_news";

  return null;
}
