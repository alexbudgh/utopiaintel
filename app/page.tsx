export const dynamic = "force-dynamic";

import Link from "next/link";
import { ScreenshotCarousel } from "@/app/components/ScreenshotCarousel";
import { cookies, headers } from "next/headers";
import { getDbApi } from "@/lib/db-api";
import { hashKey } from "@/lib/keys";
import { IntelSetupCard } from "@/app/components/IntelSetupCard";
import { freshnessColor, timeAgo } from "@/lib/ui";
import { login } from "@/app/login/action";
import { KingdomRelations } from "@/app/components/KingdomRelations";
import { toRelationContext } from "@/lib/relation-context";
import { AppHeader } from "@/app/components/AppHeader";
import { AGE_GUIDE_URL } from "@/lib/utopia-age";

const FEATURE_SECTIONS = [
  {
    eyebrow: "Collect",
    title: "Automatic ingest from normal Utopia browsing",
    description:
      "Point your kingdom at one endpoint and the app captures SoT, SoM, SoS, Survey, Infiltrate, kingdom pages, kingdom news, and self intel as people play.",
  },
  {
    eyebrow: "Analyze",
    title: "Views built for decisions, not raw dumps",
    description:
      "Browse kingdom-wide province tables, gains matchups, thievery targets, province details, and history without hand-copying intel between tabs and spreadsheets.",
  },
  {
    eyebrow: "Multi-Tenant",
    title: "Shared intel with kingdom-key access control",
    description:
      "Every query is partitioned by your kingdom key, so members see the intel that belongs to their kingdom without mixing data across groups.",
  },
];

const FEATURE_LIST = [
  {
    label: "Age 116 mechanics",
    body: (
      <>
        Updated for the current age.{" "}
        <a
          href={AGE_GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-200 underline decoration-amber-700/40 underline-offset-4 transition-colors hover:text-amber-100"
        >
          Age 116 guide
        </a>
      </>
    ),
  },
  {
    label: "Gains estimates",
    body: "Accounts for relations, war state, castles, science, barrier ritual, and more.",
  },
  {
    label: "Thievery matrix",
    body: "Per-province estimates using current thievery formulas and expected gains.",
  },
  {
    label: "Kingdom news",
    body: "Ingested automatically, with filters for date, province, and related views.",
  },
  {
    label: "Historic kingdom trends",
    body: "Easily see kingdom trends over time, and compare them with other kingdoms for war management and more.",
  },
  {
    label: "Custom saved views",
    body: "Mix and match province-table columns, then keep the layouts you use most.",
  },
  {
    label: "Province detail",
    body: "Military, resources, sciences, buildings, armies, and effects in one place.",
  },
  {
    label: "Derived metrics",
    body: "TPA, WPA, breakability, population, and other same-tick calculations.",
  },
];

function LoggedOutHome({ endpointUrl }: { endpointUrl: string }) {
  return (
    <main className="min-h-screen overflow-hidden">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),_transparent_28%),radial-gradient(circle_at_85%_15%,_rgba(239,68,68,0.12),_transparent_24%),linear-gradient(180deg,_#1a1310_0%,_#0b0a0d_56%,_#050608_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:26px_26px] opacity-20" />
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 lg:px-10">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-bold uppercase tracking-[0.2em] text-amber-200 sm:text-xl">
              Chaos Intel
            </div>
            <p className="mt-2 max-w-xl text-sm text-gray-400">
              Shared intel and kingdom planning for{" "}
              <a
                href="https://utopia-game.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300 transition-colors hover:text-amber-200"
              >
                utopia-game.com
              </a>
              .
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="#setup"
              className="rounded-full border border-stone-700 bg-stone-950/40 px-4 py-2 text-sm text-stone-300 transition-colors hover:border-amber-700/60 hover:text-amber-100"
            >
              Setup instructions
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-amber-700/60 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:border-amber-500 hover:bg-amber-900/30"
            >
              Go to login
            </Link>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_24rem] lg:items-start">
          <div className="space-y-6">
            <div className="inline-flex items-center rounded-full border border-amber-700/40 bg-amber-950/30 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-200 shadow-[0_0_0_1px_rgba(120,53,15,0.15)_inset]">
              Capture intel. Share it instantly. Act faster.
            </div>
            <div className="space-y-5">
              <div className="flex items-center gap-4 text-amber-500/50">
                <div className="h-px w-16 bg-current" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300/70">
                  Kingdom Intel
                </div>
              </div>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
                Shared intel for your kingdom.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-stone-300">
                Sign in with your kingdom key if you already have one. If not,
                set Utopia to send intel here and the site will turn your
                kingdom’s usual browsing into a shared record of targets, news,
                and state.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {FEATURE_SECTIONS.map((section) => (
                <div
                  key={section.title}
                  className="rounded-2xl border border-stone-800 bg-[linear-gradient(180deg,rgba(41,28,24,0.96),rgba(18,18,20,0.92))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.3)]"
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/75">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400/70" />
                    {section.eyebrow}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-stone-100">
                    {section.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-stone-400">
                    {section.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-stone-800 bg-[linear-gradient(180deg,rgba(38,27,22,0.96),rgba(15,14,16,0.95))] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="mb-6">
              <div className="text-sm font-medium text-stone-200">
                Already have a kingdom key?
              </div>
              <p className="mt-2 text-sm leading-6 text-stone-400">
                Sign in here and you will land in your bound kingdom immediately
                if the site has already seen a self throne page for your key.
              </p>
            </div>
            <form action={login} className="space-y-4">
              <div>
                <label
                  htmlFor="home-key"
                  className="mb-1 block text-sm text-stone-400"
                >
                  Kingdom key
                </label>
                <input
                  id="home-key"
                  name="key"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-stone-700 bg-black/25 px-4 py-3 text-stone-100 placeholder-stone-500 outline-none transition-colors focus:border-amber-500"
                  placeholder="Enter your kingdom key"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-[linear-gradient(180deg,#b45309,#92400e)] px-4 py-3 font-medium text-amber-50 transition-colors hover:brightness-110"
              >
                Sign in
              </button>
            </form>
            <p className="mt-4 text-xs leading-5 text-stone-500">
              The same key is also used in Utopia’s “Send intel to your own
              Intel site” setting. Keep it secret inside your kingdom.
            </p>
          </div>
        </section>

        <section className="mt-16">
          <div className="rounded-[2rem] border border-stone-800 bg-[linear-gradient(180deg,rgba(29,24,23,0.92),rgba(12,14,18,0.92))] p-5 sm:p-8">
            <div className="mb-6 max-w-2xl">
              <div className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-300/85">
                Highlights
              </div>
            </div>
            <dl className="divide-y divide-stone-800/80 rounded-2xl border border-stone-800 bg-black/20">
              {FEATURE_LIST.map((feature) => (
                <div
                  key={feature.label}
                  className="grid gap-1.5 px-3.5 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4 sm:px-5 sm:py-4"
                >
                  <dt className="text-[15px] font-semibold leading-6 text-stone-100">
                    {feature.label}
                  </dt>
                  <dd className="text-[15px] leading-7 text-stone-300">
                    {feature.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mt-16 space-y-6">
          <div className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-300/85">
            Screenshots
          </div>
          <ScreenshotCarousel />
        </section>

        <section id="setup" className="mt-16 space-y-4">
          <div className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-300/85">
            Setup
          </div>
          <p className="max-w-2xl text-sm leading-7 text-stone-400">
            If you do not already have a kingdom key, decide on one with your
            kingdom, sign in here once, then configure the game to post intel to
            this endpoint.
          </p>
          <div className="max-w-3xl">
            <IntelSetupCard endpointUrl={endpointUrl} />
          </div>
        </section>
      </div>
    </main>
  );
}

export default async function Home() {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;
  const key = (await cookies()).get("auth")?.value ?? "";
  if (!key) {
    return <LoggedOutHome endpointUrl={`${baseUrl}/api/intel`} />;
  }

  const keyHash = hashKey(key);
  const db = getDbApi();
  const [boundKingdom, kingdoms] = await Promise.all([
    db.getBoundKingdom(keyHash),
    db.getKingdoms(keyHash),
  ]);
  const kingdomRows = await Promise.all(
    kingdoms.map(async (kd) => {
      const [snapshot, ritual, dragon] = await Promise.all([
        db.getLatestKingdomSnapshot(kd.location, keyHash),
        db.getKingdomRitual(kd.location, keyHash),
        db.getKingdomDragon(kd.location, keyHash),
      ]);
      const relationContexts =
        boundKingdom && kd.location === boundKingdom
          ? await Promise.all(
              (snapshot?.openRelations ?? []).map((relation) =>
                db.getLatestKingdomSnapshot(relation.location, keyHash),
              ),
            ).then((snaps) =>
              snaps.map(toRelationContext).filter((ctx) => ctx != null),
            )
          : [];
      return { kd, snapshot, relationContexts, ritual, dragon };
    }),
  );

  const selfWarTarget = boundKingdom
    ? (kingdomRows.find((r) => r.kd.location === boundKingdom)?.snapshot
        ?.warTarget ?? null)
    : null;

  const ourRelationLocations = new Set(
    (
      kingdomRows.find((r) => r.kd.location === boundKingdom)?.snapshot
        ?.openRelations ?? []
    ).map((r) => r.location),
  );

  const groups = [
    {
      label: null,
      collapsible: false,
      rows: kingdomRows.filter((r) => r.kd.location === boundKingdom),
    },
    {
      label: "AT WAR",
      collapsible: false,
      rows: kingdomRows.filter(
        (r) =>
          r.kd.location !== boundKingdom && r.kd.location === selfWarTarget,
      ),
    },
    {
      label: "OPEN RELATIONS",
      collapsible: false,
      rows: kingdomRows.filter(
        (r) =>
          r.kd.location !== boundKingdom &&
          r.kd.location !== selfWarTarget &&
          ourRelationLocations.has(r.kd.location),
      ),
    },
    {
      label: "OTHER",
      collapsible: true,
      rows: kingdomRows.filter(
        (r) =>
          r.kd.location !== boundKingdom &&
          r.kd.location !== selfWarTarget &&
          !ourRelationLocations.has(r.kd.location),
      ),
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <AppHeader
        endpointUrl={`${baseUrl}/api/intel`}
        boundKingdom={boundKingdom}
        selfWarTarget={selfWarTarget}
      />

      {kingdoms.length === 0 ? (
        <IntelSetupCard
          endpointUrl={`${baseUrl}/api/intel`}
          title="No intel received yet."
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label ?? "own"} className="space-y-2">
              {group.collapsible && group.label ? (
                <details className="group/details">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-1 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-gray-500 uppercase hover:text-gray-400">
                    <span className="transition-transform group-open/details:rotate-90">
                      ▶
                    </span>
                    {group.label} ({group.rows.length})
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {group.rows.map(
                      ({ kd, snapshot, relationContexts, ritual, dragon }) => (
                        <li key={kd.location}>
                          <div className="rounded-lg bg-gray-800 px-4 py-3">
                            <Link
                              href={`/kingdom/${kd.location}`}
                              className="flex items-center justify-between gap-4 hover:opacity-80 transition-opacity"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-semibold text-gray-100">
                                  {kd.location}
                                </span>
                                {kd.location === boundKingdom && (
                                  <span className="ml-1.5 text-xs font-medium text-blue-400">
                                    ★
                                  </span>
                                )}
                                {kd.location === selfWarTarget && (
                                  <span className="ml-1.5 text-xs font-medium text-orange-400">
                                    ⚔
                                  </span>
                                )}
                                {snapshot?.name && (
                                  <div className="text-xs text-gray-500">
                                    {snapshot.name}
                                  </div>
                                )}
                              </div>
                              <span className="text-sm text-gray-400">
                                {kd.province_count} province
                                {kd.province_count !== 1 ? "s" : ""}
                              </span>
                              <span
                                className={`text-sm ${freshnessColor(kd.last_seen)}`}
                              >
                                {timeAgo(kd.last_seen)}
                              </span>
                            </Link>
                            {(ritual || dragon) && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {dragon && (
                                  <a
                                    href="https://utopiaguide.chaos-intel.com/main/Dragons/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-300 hover:border-rose-400/60 transition-colors"
                                  >
                                    {dragon.dragonType} Dragon ·{" "}
                                    {dragon.dragonName}
                                  </a>
                                )}
                                {ritual && (
                                  <a
                                    href="https://utopiaguide.chaos-intel.com/misc/Ritual/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 font-medium text-purple-300 hover:border-purple-400/60 transition-colors"
                                  >
                                    {ritual.name}
                                    {ritual.remainingTicks != null &&
                                      ` · ${ritual.remainingTicks}t`}
                                    {ritual.effectivenessPercent != null &&
                                      ` · ${ritual.effectivenessPercent.toFixed(1)}%`}
                                  </a>
                                )}
                              </div>
                            )}
                            <div className="mt-2">
                              <KingdomRelations
                                kingdom={kd.location}
                                boundKingdom={boundKingdom}
                                snapshot={snapshot}
                                relationContexts={relationContexts}
                              />
                            </div>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                </details>
              ) : (
                <>
                  {group.label && (
                    <div className="px-1 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
                      {group.label}
                    </div>
                  )}
                  <ul className="space-y-2">
                    {group.rows.map(
                      ({ kd, snapshot, relationContexts, ritual, dragon }) => (
                        <li key={kd.location}>
                          <div className="rounded-lg bg-gray-800 px-4 py-3">
                            <Link
                              href={`/kingdom/${kd.location}`}
                              className="flex items-center justify-between gap-4 hover:opacity-80 transition-opacity"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-semibold text-gray-100">
                                  {kd.location}
                                </span>
                                {kd.location === boundKingdom && (
                                  <span className="ml-1.5 text-xs font-medium text-blue-400">
                                    ★
                                  </span>
                                )}
                                {kd.location === selfWarTarget && (
                                  <span className="ml-1.5 text-xs font-medium text-orange-400">
                                    ⚔
                                  </span>
                                )}
                                {snapshot?.name && (
                                  <div className="text-xs text-gray-500">
                                    {snapshot.name}
                                  </div>
                                )}
                              </div>
                              <span className="text-sm text-gray-400">
                                {kd.province_count} province
                                {kd.province_count !== 1 ? "s" : ""}
                              </span>
                              <span
                                className={`text-sm ${freshnessColor(kd.last_seen)}`}
                              >
                                {timeAgo(kd.last_seen)}
                              </span>
                            </Link>
                            {(ritual || dragon) && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {dragon && (
                                  <a
                                    href="https://utopiaguide.chaos-intel.com/main/Dragons/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-300 hover:border-rose-400/60 transition-colors"
                                  >
                                    {dragon.dragonType} Dragon ·{" "}
                                    {dragon.dragonName}
                                  </a>
                                )}
                                {ritual && (
                                  <a
                                    href="https://utopiaguide.chaos-intel.com/misc/Ritual/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 font-medium text-purple-300 hover:border-purple-400/60 transition-colors"
                                  >
                                    {ritual.name}
                                    {ritual.remainingTicks != null &&
                                      ` · ${ritual.remainingTicks}t`}
                                    {ritual.effectivenessPercent != null &&
                                      ` · ${ritual.effectivenessPercent.toFixed(1)}%`}
                                  </a>
                                )}
                              </div>
                            )}
                            <div className="mt-2">
                              <KingdomRelations
                                kingdom={kd.location}
                                boundKingdom={boundKingdom}
                                snapshot={snapshot}
                                relationContexts={relationContexts}
                              />
                            </div>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
