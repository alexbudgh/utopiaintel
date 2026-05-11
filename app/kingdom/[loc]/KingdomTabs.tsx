import Link from "next/link";
import type { ReactNode } from "react";

export type KingdomView = "table" | "gains" | "thievery" | "news" | "history" | "ops";

const TABS: { view: KingdomView; label: string; param?: string }[] = [
  { view: "table", label: "Province Table" },
  { view: "gains", label: "Gains", param: "gains" },
  { view: "thievery", label: "Thievery", param: "thievery" },
  { view: "news", label: "News", param: "news" },
  { view: "ops", label: "Ops", param: "ops" },
  { view: "history", label: "History", param: "history" },
];

const btnBase = "px-2.5 py-1 rounded text-xs border transition-colors";
const btnActive = "border-blue-500 text-blue-300 bg-blue-950/40";
const btnInactive = "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300";

export function KingdomTabs({
  kingdomHref,
  active,
  children,
}: {
  kingdomHref: string;
  active: KingdomView;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-1.5 flex-wrap">
      {TABS.map(({ view, label, param }) =>
        view === active ? (
          <span key={view} className={`${btnBase} ${btnActive}`}>{label}</span>
        ) : (
          <Link
            key={view}
            href={param ? `${kingdomHref}?view=${param}` : kingdomHref}
            className={`${btnBase} ${btnInactive}`}
          >
            {label}
          </Link>
        ),
      )}
      {children}
    </div>
  );
}

// Wrapper used by every kingdom view. Renders the tab strip then the view's
// content so that adding a new tab to TABS automatically appears everywhere.
export function KingdomViewShell({
  kingdom,
  active,
  tabExtras,
  children,
}: {
  kingdom: string;
  active: KingdomView;
  tabExtras?: ReactNode;
  children: ReactNode;
}) {
  const kingdomHref = `/kingdom/${encodeURIComponent(kingdom)}`;
  return (
    <>
      <KingdomTabs kingdomHref={kingdomHref} active={active}>{tabExtras}</KingdomTabs>
      {children}
    </>
  );
}

export { btnBase, btnActive, btnInactive };
