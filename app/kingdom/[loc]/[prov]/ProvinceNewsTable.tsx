"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProvinceNewsRow } from "@/lib/db-api";

// ── Date filter helpers (mirrors KingdomNewsTable) ────────────────────────────

const UTOPIA_MONTHS = ["January","February","March","April","May","June","July"];
interface DateParts { month: string; day: string; year: string }

function parseDateParts(s?: string): DateParts {
  if (!s) return { month: "", day: "", year: "" };
  const m = /^(\w+)\s+(\d+)\s+of\s+YR(\d+)$/i.exec(s.trim());
  if (!m) return { month: "", day: "", year: "" };
  return { month: m[1], day: m[2], year: m[3] };
}

function formatDateParts({ month, day, year }: DateParts): string {
  if (!month || !day || !year) return "";
  return `${month} ${day} of YR${year}`;
}

function DateSelector({ value, onChange }: { value: DateParts; onChange: (v: DateParts) => void }) {
  const sel = "rounded border border-gray-700 bg-gray-900 px-1.5 py-1 text-gray-300 focus:border-gray-500 focus:outline-none text-xs";
  return (
    <span className="inline-flex items-center gap-1">
      <select value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })} className={sel}>
        <option value="">Month</option>
        {UTOPIA_MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input type="number" min={1} max={24} value={value.day}
        onChange={(e) => onChange({ ...value, day: e.target.value })}
        placeholder="Day" className={`${sel} w-14`} />
      <span className="text-gray-600 text-[11px]">YR</span>
      <input type="number" min={0} value={value.year}
        onChange={(e) => onChange({ ...value, year: e.target.value })}
        placeholder="Yr" className={`${sel} w-12`} />
    </span>
  );
}

function NewsDateFilter({ loc, prov, from, to, effectiveFrom }: {
  loc: string; prov: string; from?: string; to?: string; effectiveFrom?: string;
}) {
  const router = useRouter();
  const [fromParts, setFromParts] = useState<DateParts>(() => parseDateParts(from ?? effectiveFrom));
  const [toParts,   setToParts]   = useState<DateParts>(() => parseDateParts(to));
  const [toLatest,  setToLatest]  = useState(!to);
  const btnBase = "rounded border px-2.5 py-1 transition-colors text-xs";

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    const f = formatDateParts(fromParts);
    const t = toLatest ? "" : formatDateParts(toParts);
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const qs = params.toString();
    router.push(`/kingdom/${loc}/${prov}${qs ? `?${qs}` : ""}`);
  }

  function clear() {
    setFromParts({ month: "", day: "", year: "" });
    setToParts({   month: "", day: "", year: "" });
    setToLatest(true);
    router.push(`/kingdom/${loc}/${prov}`);
  }

  const hasFilter = !!(from || to);

  return (
    <form onSubmit={apply} className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-500">Date range:</span>
      <DateSelector value={fromParts} onChange={setFromParts} />
      <span className="text-gray-600">–</span>
      {toLatest
        ? <button type="button" onClick={() => setToLatest(false)}
            className={`${btnBase} border-blue-700 bg-blue-950/40 text-blue-300 hover:border-blue-500`}>
            Latest
          </button>
        : <>
            <DateSelector value={toParts} onChange={setToParts} />
            <button type="button" onClick={() => { setToParts({ month: "", day: "", year: "" }); setToLatest(true); }}
              className={`${btnBase} border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300`}>
              Latest
            </button>
          </>
      }
      <button type="submit" className={`${btnBase} border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-400 hover:text-gray-100`}>
        Filter
      </button>
      {hasFilter && (
        <button type="button" onClick={clear} className="text-gray-500 hover:text-gray-300 transition-colors text-xs">
          ✕ clear
        </button>
      )}
    </form>
  );
}

// ── Category definitions ──────────────────────────────────────────────────────

type Category = "Combat" | "Thievery" | "Sorcery" | "Dragon" | "Aid" | "Misc";

const CATEGORY_TYPES: Record<Category, string[]> = {
  Combat: [
    "attack_trad_march", "attack_conquest", "attack_razed", "attack_massacre",
    "attack_learn", "attack_plunder", "attack_ambush", "attack_failed",
  ],
  Thievery: [
    "thief_detected", "thief_detected_unknown", "thief_foiled",
    "thief_foiled_shadowlight", "thief_propaganda", "arson",
    "resource_stolen", "troops_killed", "peasants_kidnapped", "desertions",
    "rioting", "turncoat_general", "turncoat_thieves",
    "thief_sabotage_wizards",
  ],
  Sorcery: [
    "spell_detected", "spell_fireball", "spell_lightning", "spell_meteor_start",
    "spell_meteor", "spell_blizzard", "spell_gluttony", "spell_greed",
    "spell_explosions", "spell_tornado", "spell_land_lust",
    "spell_mystic_vortex", "spell_drought", "spell_pitfalls",
    "spell_chastity", "spell_sloth", "spell_nightmares", "spell_animate_dead",
    "spell_vermin", "spell_storms", "spell_expose_thieves",
    "spell_fools_gold",
  ],
  Dragon:   ["dragon_damage"],
  Aid:      ["aid_received"],
  Misc: [
    "exploration", "monthly_dedication", "war_ended", "war_loss_penalty",
    "war_victory_reward", "starvation", "ritual_shortened", "plague_ended",
    "utopian_lords_reward", "new_scientist", "inactivity_penalty", "other",
  ],
};

const TYPE_TO_CATEGORY = new Map<string, Category>(
  (Object.entries(CATEGORY_TYPES) as [Category, string[]][]).flatMap(([cat, types]) => types.map((t) => [t, cat]))
);

function getCategory(eventType: string): Category {
  return TYPE_TO_CATEGORY.get(eventType) ?? "Misc";
}

// ── Labels & colors ───────────────────────────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  // Combat
  attack_trad_march: "Traditional March",
  attack_conquest:   "Conquest",
  attack_razed:      "Raze",
  attack_massacre:   "Massacre",
  attack_learn:      "Learn",
  attack_plunder:    "Plunder",
  attack_ambush:     "Ambush",
  attack_failed:     "Failed Attack",
  // Thievery
  thief_detected:          "Thief Detected",
  thief_detected_unknown:  "Thief Detected",
  thief_foiled:            "Thief Foiled",
  thief_foiled_shadowlight:"Shadowlight",
  thief_propaganda:        "Propaganda",
  arson:                   "Arson",
  resource_stolen:         "Robbery",
  troops_killed:           "Night Strike",
  peasants_kidnapped:      "Kidnapping",
  desertions:              "Desertion",
  rioting:                 "Incite Riots",
  turncoat_general:        "Bribe Generals",
  turncoat_thieves:        "Turncoat Thieves",
  thief_sabotage_wizards:  "Sabotage Wizards",
  // Sorcery
  spell_detected:      "Spell Detected",
  spell_fireball:      "Fireball",
  spell_lightning:     "Lightning Strike",
  spell_meteor_start:  "Meteor Showers",
  spell_meteor:        "Meteor Showers",
  spell_blizzard:      "Blizzard",
  spell_gluttony:      "Gluttony",
  spell_greed:         "Greed",
  spell_explosions:    "Explosions",
  spell_tornado:       "Tornado",
  spell_land_lust:     "Land Lust",
  spell_mystic_vortex: "Mystic Vortex",
  spell_drought:       "Drought",
  spell_pitfalls:      "Pitfalls",
  spell_chastity:      "Chastity",
  spell_sloth:         "Sloth",
  spell_nightmares:    "Nightmares",
  spell_animate_dead:  "Animate Dead",
  spell_vermin:        "Vermin",
  spell_storms:        "Storms",
  spell_expose_thieves:"Expose Thieves",
  spell_fools_gold:    "Fool's Gold",
  // Dragon
  dragon_damage:       "Dragon Attack",
  // Aid
  aid_received:        "Aid Received",
  // Misc
  exploration:           "Exploration",
  monthly_dedication:    "Monthly Dedication",
  war_ended:             "War Ended",
  war_loss_penalty:      "War Loss",
  war_victory_reward:    "War Victory",
  starvation:            "Starvation",
  ritual_shortened:      "Ritual Shortened",
  plague_ended:          "Plague Ended",
  utopian_lords_reward:  "Utopian Lords",
  new_scientist:         "New Scientist",
  inactivity_penalty:    "Inactivity",
  other:                 "Unknown",
};

const CATEGORY_BADGE: Record<Category, string> = {
  Combat:   "border-red-500/40 bg-red-500/10 text-red-300",
  Thievery: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  Sorcery:  "border-purple-500/40 bg-purple-500/10 text-purple-300",
  Dragon:   "border-rose-500/40 bg-rose-500/10 text-rose-300",
  Aid:      "border-green-500/40 bg-green-500/10 text-green-300",
  Misc:     "border-gray-600 bg-gray-800/40 text-gray-400",
};

const CATEGORY_PILL_ACTIVE: Record<Category, string> = {
  Combat:   "border-red-500/60 bg-red-500/20 text-red-200",
  Thievery: "border-amber-500/60 bg-amber-500/20 text-amber-200",
  Sorcery:  "border-purple-500/60 bg-purple-500/20 text-purple-200",
  Dragon:   "border-rose-500/60 bg-rose-500/20 text-rose-200",
  Aid:      "border-green-500/60 bg-green-500/20 text-green-200",
  Misc:     "border-gray-500/60 bg-gray-700/40 text-gray-300",
};

const PILL_INACTIVE = "border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-300";

// ── Detail formatting ─────────────────────────────────────────────────────────

function resLabel(rt: string | null): string {
  switch (rt) {
    case "gold":     return "gc";
    case "food":     return "bushels";
    case "runes":    return "runes";
    case "books":    return "books";
    case "horses":   return "horses";
    case "soldiers": return "soldiers";
    default:         return rt ?? "";
  }
}

function n(v: number) { return v.toLocaleString(); }

function formatDetail(row: ProvinceNewsRow): string | null {
  const { eventType, amount, resourceType } = row;

  switch (eventType) {
    // Combat
    case "attack_trad_march":  return amount != null ? `${n(amount)} acres taken`        : null;
    case "attack_conquest":    return amount != null ? `${n(amount)} acres (turned away)` : null;
    case "attack_razed":       return amount != null ? `${n(amount)} bldgs razed`         : null;
    case "attack_ambush":      return amount != null ? `${n(amount)} acres recaptured`    : null;
    case "attack_massacre":    return "troops massacred";
    case "attack_learn":       return amount != null ? `${n(amount)} books learned`      : null;
    case "attack_plunder":     return amount != null ? `${n(amount)} ${resLabel(resourceType)} plundered` : null;
    case "attack_failed":      return "attack repelled";
    // Thievery
    case "resource_stolen":    return amount != null ? `${n(amount)} ${resLabel(resourceType)} stolen`  : null;
    case "troops_killed":      return amount != null ? `${n(amount)} troops killed`       : null;
    case "peasants_kidnapped": return amount != null ? `${n(amount)} kidnapped`           : null;
    case "desertions":         return amount != null ? `${n(amount)} men deserted`        : null;
    case "arson":              return amount != null ? `${n(amount)} bldgs burned`        : null;
    case "thief_propaganda":   return amount != null ? `${n(amount)} abandoned`           : null;
    case "thief_sabotage_wizards": return amount != null ? `${n(amount)} ticks affected` : null;
    // Sorcery — damage
    case "spell_fireball":     return amount != null ? `${n(amount)} peasants killed`    : null;
    case "spell_lightning":    return amount != null ? `${n(amount)} runes destroyed`    : null;
    case "spell_meteor":       return amount != null ? `${n(amount)} ${resLabel(resourceType)} killed` : null;
    case "spell_land_lust":    return amount != null ? `${n(amount)} acres vanished`     : null;
    case "spell_tornado":      return amount != null ? `${n(amount)} bldgs razed`        : null;
    case "spell_fools_gold":   return amount != null ? `${n(amount)} gc → lead`          : null;
    case "spell_vermin":       return amount != null ? `${n(amount)} bushels devoured`   : null;
    case "spell_animate_dead": return amount != null ? `${n(amount)} peasants lost`      : null;
    // Sorcery — duration
    case "spell_meteor_start":
    case "spell_blizzard":
    case "spell_gluttony":
    case "spell_greed":
    case "spell_explosions":
    case "spell_drought":
    case "spell_pitfalls":
    case "spell_chastity":
    case "spell_sloth":
    case "spell_nightmares":   return amount != null ? `${n(amount)} ticks`              : null;
    // Dragon
    case "dragon_damage":      return amount != null ? `${n(amount)} soldiers killed`    : null;
    // Aid
    case "aid_received":       return amount != null ? `${n(amount)} ${resLabel(resourceType)} received` : null;
    // Misc
    case "exploration":        return amount != null ? `${n(amount)} acres settled`      : null;
    case "war_ended":          return amount != null ? `${n(amount)} acres returned`     : null;
    case "monthly_dedication": return amount != null ? `${n(amount)} gc`                 : null;
    case "utopian_lords_reward": return amount != null ? `${n(amount)} ${resLabel(resourceType)}` : null;
    default:                   return null;
  }
}

// Verb shown between actor and "us" for combat/thievery events that have an actor
function attackVerb(eventType: string): string | null {
  switch (eventType) {
    case "attack_trad_march": return "marched on us";
    case "attack_conquest":   return "conquered us";
    case "attack_razed":      return "razed us";
    case "attack_massacre":   return "massacred us";
    case "attack_learn":      return "learned from us";
    case "attack_plunder":    return "plundered us";
    case "attack_ambush":     return "ambushed our army";
    case "attack_failed":     return "failed to attack us";
    case "arson":             return "set fire to us";
    default:                  return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = Object.keys(CATEGORY_TYPES) as Category[];
const PAGE_SIZE = 50;

export function ProvinceNewsTable({ events, loc, prov, from, to, effectiveFrom }: {
  events: ProvinceNewsRow[];
  loc: string;
  prov: string;
  from?: string;
  to?: string;
  effectiveFrom?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set(ALL_CATEGORIES));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(
    () => events.filter((e) => activeCategories.has(getCategory(e.eventType))),
    [events, activeCategories],
  );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  function toggleCategory(cat: Category) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }

  const allActive = activeCategories.size === ALL_CATEGORIES.length;
  const pillBase = "rounded border px-2 py-1 text-[11px] transition-colors";

  if (events.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        No province news recorded. Browse the province news page in Utopia to submit intel.
      </div>
    );
  }

  if (!expanded) {
    const counts = new Map<Category, number>();
    for (const e of events) {
      const cat = getCategory(e.eventType);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    const summary = ALL_CATEGORIES.filter((c) => counts.has(c))
      .map((c) => `${counts.get(c)} ${c.toLowerCase()}`)
      .join(", ");
    const dateLabel = from ?? effectiveFrom;
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors text-left"
      >
        {events.length} events{dateLabel ? ` from ${dateLabel}` : ""} — {summary} · <span className="text-gray-600">show</span>
      </button>
    );
  }

  return (
    <>
      <NewsDateFilter loc={loc} prov={prov} from={from} to={to} effectiveFrom={effectiveFrom} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setExpanded(false)} className={`${pillBase} border-gray-700 bg-gray-900 text-gray-600 hover:text-gray-300`}>
          hide
        </button>
        {ALL_CATEGORIES.map((cat) => {
          const active = activeCategories.has(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`${pillBase} ${active ? CATEGORY_PILL_ACTIVE[cat] : PILL_INACTIVE}`}
            >
              {cat}
            </button>
          );
        })}
        {!allActive && (
          <button
            type="button"
            onClick={() => { setActiveCategories(new Set(ALL_CATEGORIES)); setVisibleCount(PAGE_SIZE); }}
            className={`${pillBase} ${PILL_INACTIVE}`}
          >
            All
          </button>
        )}
        <span className="ml-auto text-xs text-gray-600">{Math.min(visibleCount, filtered.length)} of {filtered.length}</span>
      </div>

      <div className="space-y-0.5">
        {visible.map((row) => {
          const cat = getCategory(row.eventType);
          const badge = CATEGORY_BADGE[cat];
          const label = EVENT_LABEL[row.eventType] ?? row.eventType;
          const detail = formatDetail(row);
          const verb = attackVerb(row.eventType);

          const actorNode = (() => {
            if (row.actorName && row.actorKingdom) {
              return (
                <Link
                  href={`/kingdom/${encodeURIComponent(row.actorKingdom)}/${encodeURIComponent(row.actorName)}`}
                  className="text-gray-300 hover:text-blue-300 transition-colors"
                >
                  {row.actorName}
                  <span className="text-gray-500 font-mono text-[10px]"> ({row.actorKingdom})</span>
                </Link>
              );
            }
            if (row.actorKingdom) {
              return (
                <Link
                  href={`/kingdom/${encodeURIComponent(row.actorKingdom)}`}
                  className="text-gray-400 hover:text-blue-300 transition-colors font-mono text-[11px]"
                >
                  ({row.actorKingdom})
                </Link>
              );
            }
            if (row.actorName) {
              return <span className="text-gray-300">{row.actorName}</span>;
            }
            return null;
          })();

          return (
            <div key={row.id} className="flex items-start gap-3 rounded px-3 py-1.5 text-sm hover:bg-gray-800/30">
              <span className="shrink-0 text-[11px] text-gray-500 font-mono pt-0.5 w-36">{row.gameDate}</span>
              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${badge}`}>
                {label}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-gray-400 leading-snug">
                {actorNode}
                {actorNode && verb && <span className="text-gray-600"> {verb}</span>}
              </span>
              {detail && (
                <span className="shrink-0 text-[12px] tabular-nums text-gray-500">{detail}</span>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-gray-300 hover:border-gray-500 hover:text-gray-100 transition-colors"
          >
            Load more
          </button>
          <span>{visibleCount} of {filtered.length} events</span>
        </div>
      )}
    </>
  );
}
