import type { IntelType } from "./types";

export function getIntelPathname(url: string): string | null {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
}

// Sitter URLs use /wol/sit/game/... instead of /wol/game/... — normalize to the canonical form.
function normalizeGamePath(pathname: string): string {
  return pathname.startsWith("/wol/sit/game/")
    ? "/wol/game/" + pathname.slice("/wol/sit/game/".length)
    : pathname;
}

export function matchesGamePath(pathname: string | null, page: string): boolean {
  return !!pathname && normalizeGamePath(pathname) === `/wol/game/${page}`;
}

function isThieveryPathname(pathname: string): boolean {
  const p = normalizeGamePath(pathname);
  return p === "/wol/game/thievery" || p.startsWith("/wol/game/province_operations/");
}

function getUtopiaThieveryOp(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!isThieveryPathname(parsed.pathname.toLowerCase())) return null;
    return parsed.searchParams.get("o")?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

// Detect intel type from the URL sent by the game client.
// Self-intel pages (council_*) share the same data format as spy results but without
// a province preamble — parsers accept a selfProv fallback for those.
export function detectIntelType(url: string): IntelType | null {
  const raw = getIntelPathname(url);
  if (!raw) return null;
  const pathname = normalizeGamePath(raw);

  // Self-intel pages (use prov field as province name, kingdom="")
  if (matchesGamePath(pathname, "council_science")) return "sos";
  if (matchesGamePath(pathname, "council_military")) return "som";
  if (matchesGamePath(pathname, "council_state")) return "state";
  if (matchesGamePath(pathname, "council_internal")) return "survey";
  if (matchesGamePath(pathname, "throne")) return "sot";
  // council_spells, council_history — no structured data

  // Spy/thievery operations
  const thieveryOp = getUtopiaThieveryOp(url);
  if (thieveryOp === "SPY_ON_THRONE") return "sot";
  if (thieveryOp === "SPY_ON_MILITARY") return "som";
  if (thieveryOp === "SPY_ON_SCIENCES") return "sos";
  if (thieveryOp === "SPY_ON_DEFENSE") return "sod";
  if (thieveryOp === "SURVEY") return "survey";
  if (thieveryOp === "INFILTRATE") return "infiltrate";
  if (thieveryOp === "SNATCH_NEWS") return "kingdom_news";
  if (thieveryOp === "ROB_THE_TOWERS") return "rob";
  if (thieveryOp === "ROB_THE_VAULTS") return "rob";
  if (thieveryOp === "ROB_THE_GRANARIES") return "rob";
  if (thieveryOp === "NIGHT_STRIKE") return "rob";
  if (thieveryOp === "KIDNAP") return "rob";
  if (thieveryOp === "BRIBE_GENERALS") return "rob";
  if (thieveryOp === "INCITE_RIOTS") return "rob";
  if (thieveryOp === "SABOTAGE_WIZARDS") return "rob";
  if (thieveryOp === "ARSON") return "rob";
  if (thieveryOp === "GREATER_ARSON") return "rob";
  if (thieveryOp === "DESTABILIZE_GUILDS") return "rob";
  if (thieveryOp === "BRIBE_THIEVES") return "rob";
  // TODO: Add parsers/storage for other thievery ops we see in production,
  // such as SPY_ON_EXPLORATION.

  if (matchesGamePath(pathname, "spy_on_throne")) return "sot";
  if (matchesGamePath(pathname, "spy_on_military")) return "som";
  if (matchesGamePath(pathname, "train_army") || matchesGamePath(pathname, "army_training")) return "train_army";
  if (matchesGamePath(pathname, "build")) return "build";
  if (matchesGamePath(pathname, "spy_on_sciences")) return "sos";
  if (matchesGamePath(pathname, "spy_on_defense")) return "sod";
  if (matchesGamePath(pathname, "infiltrate")) return "infiltrate";

  // Non-thievery pages
  if (matchesGamePath(pathname, "survey")) return "survey";
  // Sorcery ops use ?s= param; only route when a spell is specified
  if (matchesGamePath(pathname, "sorcery")) {
    try {
      if (new URL(url).searchParams.has("s")) return "sorcery";
    } catch { /* ignore */ }
  }

  if (matchesGamePath(pathname, "send_armies")) return "attack";

  if (pathname === "/wol/game/kingdom" || pathname.startsWith("/wol/game/kingdom_details")) return "kingdom";
  if (pathname === "/wol/game/kingdom_news" || pathname.startsWith("/wol/game/kingdom_news/")) return "kingdom_news";

  return null;
}
