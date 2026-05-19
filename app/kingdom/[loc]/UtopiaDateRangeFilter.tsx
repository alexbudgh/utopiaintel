"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  initialDateRangeValue,
  UtopiaDateRangeControls,
  type UtopiaDateRangeValue,
} from "@/app/components/UtopiaDateRangeControls";

export function UtopiaDateRangeFilter({
  basePath,
  kingdom,
  view,
  from,
  to,
  timeMode = "utopia",
  allowTimeMode = false,
  effectiveFrom,
  latestWarDate,
}: {
  basePath?: string;
  kingdom?: string;
  view?: "news" | "events" | "ops";
  from?: string;
  to?: string;
  timeMode?: "real" | "utopia";
  allowTimeMode?: boolean;
  effectiveFrom?: string;
  latestWarDate?: string;
}) {
  const router = useRouter();
  const [range, setRange] = useState<UtopiaDateRangeValue>(() =>
    initialDateRangeValue({ from, to, timeMode, effectiveFrom }),
  );

  function apply(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (allowTimeMode && range.mode === "real") params.set("timeMode", "real");
    if (range.from) params.set("from", range.from);
    if (!range.toLatest && range.to) params.set("to", range.to);
    const path = basePath ?? `/kingdom/${encodeURIComponent(kingdom ?? "")}`;
    const qs = params.toString();
    router.push(qs ? `${path}?${qs}` : path);
  }

  function clear() {
    setRange({ mode: range.mode, from: "", to: "", toLatest: true });
    const path = basePath ?? `/kingdom/${encodeURIComponent(kingdom ?? "")}`;
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (allowTimeMode && range.mode === "real") params.set("timeMode", "real");
    const qs = params.toString();
    router.push(qs ? `${path}?${qs}` : path);
  }

  const hasFilter = !!(from || to);
  const btnBase = "rounded border px-2.5 py-1 transition-colors";

  return (
    <form
      onSubmit={apply}
      className="mb-3 flex flex-wrap items-center gap-2 text-xs"
    >
      <UtopiaDateRangeControls
        value={range}
        onChange={setRange}
        allowTimeMode={allowTimeMode}
        latestWarDate={latestWarDate}
      />
      <button
        type="submit"
        className={`${btnBase} border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-400 hover:text-gray-100`}
      >
        Filter
      </button>
      {hasFilter && (
        <button
          type="button"
          onClick={clear}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          x clear
        </button>
      )}
    </form>
  );
}
