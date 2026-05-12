"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const UTOPIA_MONTHS = ["January", "February", "March", "April", "May", "June", "July"];

interface DateParts {
  month: string;
  day: string;
  year: string;
}

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

function DateSelector({
  value,
  onChange,
}: {
  value: DateParts;
  onChange: (v: DateParts) => void;
}) {
  const sel = "rounded border border-gray-700 bg-gray-900 px-1.5 py-1 text-gray-300 focus:border-gray-500 focus:outline-none";
  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={value.month}
        onChange={(e) => onChange({ ...value, month: e.target.value })}
        className={sel}
      >
        <option value="">Month</option>
        {UTOPIA_MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input
        type="number"
        min={1}
        max={24}
        value={value.day}
        onChange={(e) => onChange({ ...value, day: e.target.value })}
        placeholder="Day"
        className={`${sel} w-14`}
      />
      <span className="text-gray-600 text-[11px]">YR</span>
      <input
        type="number"
        min={0}
        value={value.year}
        onChange={(e) => onChange({ ...value, year: e.target.value })}
        placeholder="Yr"
        className={`${sel} w-12`}
      />
    </span>
  );
}

export function UtopiaDateRangeFilter({
  basePath,
  kingdom,
  view,
  from,
  to,
  effectiveFrom,
  latestWarDate,
}: {
  basePath?: string;
  kingdom?: string;
  view?: "news" | "events" | "ops";
  from?: string;
  to?: string;
  effectiveFrom?: string;
  latestWarDate?: string;
}) {
  const router = useRouter();
  const [fromParts, setFromParts] = useState<DateParts>(() => parseDateParts(from ?? effectiveFrom));
  const [toParts, setToParts] = useState<DateParts>(() => parseDateParts(to));
  const [toLatest, setToLatest] = useState(!to);

  function apply(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    const f = formatDateParts(fromParts);
    const t = toLatest ? "" : formatDateParts(toParts);
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const path = basePath ?? `/kingdom/${encodeURIComponent(kingdom ?? "")}`;
    const qs = params.toString();
    router.push(qs ? `${path}?${qs}` : path);
  }

  function clear() {
    setFromParts({ month: "", day: "", year: "" });
    setToParts({ month: "", day: "", year: "" });
    setToLatest(true);
    const path = basePath ?? `/kingdom/${encodeURIComponent(kingdom ?? "")}`;
    router.push(view ? `${path}?view=${view}` : path);
  }

  function setWarRange() {
    if (!latestWarDate) return;
    setFromParts(parseDateParts(latestWarDate));
    setToParts({ month: "", day: "", year: "" });
    setToLatest(true);
  }

  const hasFilter = !!(from || to);
  const btnBase = "rounded border px-2.5 py-1 transition-colors";

  return (
    <form onSubmit={apply} className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      {latestWarDate && (
        <button
          type="button"
          onClick={setWarRange}
          className={`${btnBase} border-amber-700/60 bg-amber-950/30 text-amber-400 hover:border-amber-500 hover:text-amber-300`}
        >
          Since war
        </button>
      )}
      <span className="text-gray-500">Date range:</span>
      <DateSelector value={fromParts} onChange={setFromParts} />
      <span className="text-gray-600">-</span>
      {toLatest ? (
        <button
          type="button"
          onClick={() => setToLatest(false)}
          className={`${btnBase} border-blue-700 bg-blue-950/40 text-blue-300 hover:border-blue-500`}
        >
          Latest
        </button>
      ) : (
        <>
          <DateSelector value={toParts} onChange={setToParts} />
          <button
            type="button"
            onClick={() => {
              setToParts({ month: "", day: "", year: "" });
              setToLatest(true);
            }}
            className={`${btnBase} border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300`}
          >
            Latest
          </button>
        </>
      )}
      <button
        type="submit"
        className={`${btnBase} border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-400 hover:text-gray-100`}
      >
        Filter
      </button>
      {hasFilter && (
        <button type="button" onClick={clear} className="text-gray-500 hover:text-gray-300 transition-colors">
          x clear
        </button>
      )}
    </form>
  );
}
