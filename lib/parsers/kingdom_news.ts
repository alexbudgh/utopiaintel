import { INT, KDLOC, parseNum } from "./util";

export interface KingdomNewsEvent {
  gameDate: string;
  eventType: string;
  rawText: string;
  attackerName: string | null;
  attackerKingdom: string | null;
  defenderName: string | null;
  defenderKingdom: string | null;
  acres: number | null;
  books: number | null;
  senderName: string | null;
  receiverName: string | null;
  relationKingdom: string | null;
  dragonType: string | null;
  dragonName: string | null;
}

export interface KingdomNewsData {
  events: KingdomNewsEvent[];
}

// Matches optional slot prefix "N - " followed by name and (X:Y)
const PROV_REF = `(?:\\d+ - )?([^(]+?)\\s*${KDLOC}`;
const PROV_REF_RE = new RegExp(`^${PROV_REF}$`);

// Unknown attacker prefix
const UNKNOWN_PROV_RE = new RegExp(`An unknown province from ([^(]+?)\\s*${KDLOC}`);

function parseProvRef(text: string): { name: string; kingdom: string } | null {
  const m = PROV_REF_RE.exec(text.trim());
  if (!m) return null;
  return { name: m[1].trim(), kingdom: m[2] };
}

// Patterns for each event type. Capture groups named inline via positional indices.
// Format: attacker PROV_REF ... verb ... defender PROV_REF
const INVASION_RE   = new RegExp(`^${PROV_REF} invaded ${PROV_REF} and captured (${INT}) acres`);
// Unknown province variants — must be checked before general patterns
const INVASION_UNKNOWN_RE    = new RegExp(`^An unknown province from ([^(]+?)\\s*${KDLOC} invaded ${PROV_REF} and captured (${INT}) acres`);
const AMBUSH_ARMIES_UNKNOWN_RE = new RegExp(`^An unknown province from ([^(]+?)\\s*${KDLOC} ambushed armies from ${PROV_REF} and took (${INT}) acres`);
// Both "ambushed armies from Y and took N acres" and "recaptured N acres [of land] from Y"
// are the Ambush attack type in Utopia.
const AMBUSH_ARMIES_RE = new RegExp(`^${PROV_REF} ambushed armies from ${PROV_REF} and took (${INT}) acres`);
const AMBUSH_RE     = new RegExp(`^${PROV_REF} recaptured (${INT}) acres(?:\\s+of\\s+land)?\\s+from ${PROV_REF}`);
const RAZE_RE       = new RegExp(`^${PROV_REF} razed (${INT}) acres of ${PROV_REF}`);
const PILLAGE_RE    = new RegExp(`^${PROV_REF} (?:attacked and pillaged the lands of|invaded and pillaged) ${PROV_REF}`);
// "invaded/attacked and looted N books from"
const LOOT_RE       = new RegExp(`^${PROV_REF} (?:invaded|attacked) and looted (${INT}) books from ${PROV_REF}`);
// Traditional march: "captured N acres of land from"
const MARCH_RE      = new RegExp(`^${PROV_REF} captured (${INT}) acres of land from ${PROV_REF}`);
// Unknown province march: "An unknown province from X captured N acres of land from Y"
const MARCH_UNKNOWN_RE = new RegExp(`^An unknown province from ([^(]+?)\\s*${KDLOC} captured (${INT}) acres of land from ${PROV_REF}`);
// Unknown province failed: standard and intra-kingdom war variant
const FAILED_RE     = new RegExp(`^(?:In intra-kingdom war )?${UNKNOWN_PROV_RE.source} attempted to invade ${PROV_REF}`);
// Dragon arrived against us from news (different from SoT ravage)
const DRAGON_ARRIVED_RE = new RegExp(`^A (\\w+) Dragon, ([^,]+), from ([^(]+?)\\s*${KDLOC} has begun ravaging our lands!`);
// Dragon completed and launched by us: "X has completed our dragon, Name, and it sets flight to ravage Y (X:Y)!"
const DRAGON_LAUNCHED_RE = new RegExp(`^(.+?) has completed our dragon, ([^,]+), and it sets flight to ravage ([^(]+?)\\s*${KDLOC}!`);
// Dragon slain
const DRAGON_SLAIN_RE   = /^(.+?) has slain the dragon, ([^,]+), ravaging our lands!/;
// Ritual started
const RITUAL_STARTED_RE = /^We have started developing a ritual! \((.+?)\)!/;
// Ritual now active
const RITUAL_ACTIVE_RE  = /^A ritual is covering our lands! \((.+?)\)/;

const AID_RE                    = /^(.+?) has sent an aid shipment to (.+?)\.$/;
const WAR_DECLARED_RE           = new RegExp(`^We have declared WAR on ([^(]+?)\\s*${KDLOC}!`);
const CEASEFIRE_PROPOSED_RE     = new RegExp(`^We have proposed a ceasefire offer to ([^(]+?)\\s*${KDLOC}\\.`);
const CEASEFIRE_ACCEPTED_RE     = new RegExp(`^([^(]+?)\\s*${KDLOC} has accepted our ceasefire proposal!`);
const CEASEFIRE_BROKEN_RE       = new RegExp(`^([^(]+?)\\s*${KDLOC} has broken their ceasefire agreement with us!`);
const CEASEFIRE_WITHDRAWN_RE    = new RegExp(`^We have withdrawn our ceasefire proposal to ([^(]+?)\\s*${KDLOC}`);
const DRAGON_BY_US_RE           = new RegExp(`^Our kingdom has begun the (\\w+) Dragon project, ([^,]+), targeted at ([^(]+?)\\s*${KDLOC}`);
const DRAGON_AGAINST_US_RE      = new RegExp(`^([^(]+?)\\s*${KDLOC} has begun the (\\w+) Dragon project, ([^,]+), against us!`);

function classifyEvent(text: string): Omit<KingdomNewsEvent, "gameDate" | "rawText"> {
  let m: RegExpExecArray | null;

  m = INVASION_UNKNOWN_RE.exec(text);
  if (m) return {
    eventType: "march",
    attackerName: null, attackerKingdom: m[2],
    defenderName: m[3].trim(), defenderKingdom: m[4],
    acres: parseNum(m[5]), books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = AMBUSH_ARMIES_UNKNOWN_RE.exec(text);
  if (m) return {
    eventType: "ambush",
    attackerName: null, attackerKingdom: m[2],
    defenderName: m[3].trim(), defenderKingdom: m[4],
    acres: parseNum(m[5]), books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = INVASION_RE.exec(text);
  if (m) return {
    eventType: "march",
    attackerName: m[1].trim(), attackerKingdom: m[2],
    defenderName: m[3].trim(), defenderKingdom: m[4],
    acres: parseNum(m[5]), books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = AMBUSH_ARMIES_RE.exec(text);
  if (m) return {
    eventType: "ambush",
    attackerName: m[1].trim(), attackerKingdom: m[2],
    defenderName: m[3].trim(), defenderKingdom: m[4],
    acres: parseNum(m[5]), books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = AMBUSH_RE.exec(text);
  if (m) return {
    eventType: "ambush",
    attackerName: m[1].trim(), attackerKingdom: m[2],
    defenderName: m[4].trim(), defenderKingdom: m[5],
    acres: parseNum(m[3]), books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = RAZE_RE.exec(text);
  if (m) return {
    eventType: "raze",
    attackerName: m[1].trim(), attackerKingdom: m[2],
    defenderName: m[4].trim(), defenderKingdom: m[5],
    acres: parseNum(m[3]), books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = PILLAGE_RE.exec(text);
  if (m) return {
    eventType: "pillage",
    attackerName: m[1].trim(), attackerKingdom: m[2],
    defenderName: m[3].trim(), defenderKingdom: m[4],
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = LOOT_RE.exec(text);
  if (m) return {
    eventType: "loot",
    attackerName: m[1].trim(), attackerKingdom: m[2],
    defenderName: m[4].trim(), defenderKingdom: m[5],
    acres: null, books: parseNum(m[3]),
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = MARCH_RE.exec(text);
  if (m) return {
    eventType: "march",
    attackerName: m[1].trim(), attackerKingdom: m[2],
    defenderName: m[4].trim(), defenderKingdom: m[5],
    acres: parseNum(m[3]), books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = MARCH_UNKNOWN_RE.exec(text);
  if (m) return {
    eventType: "march",
    attackerName: null, attackerKingdom: m[2],
    defenderName: m[4].trim(), defenderKingdom: m[5],
    acres: parseNum(m[3]), books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = FAILED_RE.exec(text);
  if (m) return {
    eventType: "failed_attack",
    attackerName: null, attackerKingdom: m[1],
    defenderName: m[2].trim(), defenderKingdom: m[3],
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = DRAGON_LAUNCHED_RE.exec(text);
  if (m) return {
    eventType: "dragon_by_us",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: m[4],
    dragonType: null, dragonName: m[2].trim(),
  };

  m = DRAGON_ARRIVED_RE.exec(text);
  if (m) return {
    eventType: "dragon_against_us",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: m[4],
    dragonType: m[1], dragonName: m[2].trim(),
  };

  m = DRAGON_SLAIN_RE.exec(text);
  if (m) return {
    eventType: "dragon_slain",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: m[2].trim(),
  };

  m = RITUAL_STARTED_RE.exec(text);
  if (m) return {
    eventType: "ritual_started",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: m[1].trim(),
  };

  m = RITUAL_ACTIVE_RE.exec(text);
  if (m) return {
    eventType: "ritual_started",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: m[1].trim(),
  };

  m = AID_RE.exec(text);
  if (m) return {
    eventType: "aid",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: m[1].trim(), receiverName: m[2].trim(), relationKingdom: null,
    dragonType: null, dragonName: null,
  };

  m = WAR_DECLARED_RE.exec(text);
  if (m) return {
    eventType: "war_declared",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: m[2],
    dragonType: null, dragonName: null,
  };

  m = CEASEFIRE_PROPOSED_RE.exec(text);
  if (m) return {
    eventType: "ceasefire_proposed",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: m[2],
    dragonType: null, dragonName: null,
  };

  m = CEASEFIRE_ACCEPTED_RE.exec(text);
  if (m) return {
    eventType: "ceasefire_accepted",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: m[2],
    dragonType: null, dragonName: null,
  };

  m = CEASEFIRE_BROKEN_RE.exec(text);
  if (m) return {
    eventType: "ceasefire_broken",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: m[2],
    dragonType: null, dragonName: null,
  };

  m = CEASEFIRE_WITHDRAWN_RE.exec(text);
  if (m) return {
    eventType: "ceasefire_withdrawn",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: m[2],
    dragonType: null, dragonName: null,
  };

  m = DRAGON_BY_US_RE.exec(text);
  if (m) return {
    eventType: "dragon_by_us",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: m[4],
    dragonType: m[1], dragonName: m[2].trim(),
  };

  m = DRAGON_AGAINST_US_RE.exec(text);
  if (m) return {
    eventType: "dragon_against_us",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: m[2],
    dragonType: m[3], dragonName: m[4].trim(),
  };

  return {
    eventType: "other",
    attackerName: null, attackerKingdom: null,
    defenderName: null, defenderKingdom: null,
    acres: null, books: null,
    senderName: null, receiverName: null, relationKingdom: null,
    dragonType: null, dragonName: null,
  };
}

export function parseKingdomNews(text: string): KingdomNewsData | null {
  const events: KingdomNewsEvent[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Lines are tab-separated: "DATE\tEVENT TEXT"
    const tabIdx = trimmed.indexOf("\t");
    if (tabIdx === -1) continue;

    const gameDate = trimmed.slice(0, tabIdx).trim();
    const rawText = trimmed.slice(tabIdx + 1).trim();
    if (!rawText) continue;

    const classified = classifyEvent(rawText);
    events.push({ gameDate, rawText, ...classified });
  }

  if (events.length === 0) return null;
  return { events };
}
