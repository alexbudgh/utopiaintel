"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const UTOPIA_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
];

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

function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultRealFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 3);
  date.setSeconds(0, 0);
  return formatDateTimeLocal(date);
}

function DateSelector({
  value,
  onChange,
}: {
  value: DateParts;
  onChange: (v: DateParts) => void;
}) {
  const sel =
    "rounded border border-gray-700 bg-gray-900 px-1.5 py-1 text-gray-300 focus:border-gray-500 focus:outline-none";
  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={value.month}
        onChange={(e) => onChange({ ...value, month: e.target.value })}
        className={sel}
      >
        <option value="">Month</option>
        {UTOPIA_MONTHS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
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
  const [fromParts, setFromParts] = useState<DateParts>(() =>
    parseDateParts(timeMode === "utopia" ? (from ?? effectiveFrom) : undefined),
  );
  const [toParts, setToParts] = useState<DateParts>(() => parseDateParts(to));
  const [realFrom, setRealFrom] = useState(() =>
    timeMode === "real" ? (from ?? defaultRealFrom()) : "",
  );
  const [realTo, setRealTo] = useState(() =>
    timeMode === "real" ? (to ?? "") : "",
  );
  const [mode, setMode] = useState<"real" | "utopia">(timeMode);
  const [toLatest, setToLatest] = useState(!to);

  function apply(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (allowTimeMode && mode === "real") params.set("timeMode", "real");
    const f = mode === "real" ? realFrom : formatDateParts(fromParts);
    const t = toLatest
      ? ""
      : mode === "real"
        ? realTo
        : formatDateParts(toParts);
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const path = basePath ?? `/kingdom/${encodeURIComponent(kingdom ?? "")}`;
    const qs = params.toString();
    router.push(qs ? `${path}?${qs}` : path);
  }

  function clear() {
    setFromParts({ month: "", day: "", year: "" });
    setToParts({ month: "", day: "", year: "" });
    setRealFrom("");
    setRealTo("");
    setToLatest(true);
    const path = basePath ?? `/kingdom/${encodeURIComponent(kingdom ?? "")}`;
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (allowTimeMode && mode === "real") params.set("timeMode", "real");
    const qs = params.toString();
    router.push(qs ? `${path}?${qs}` : path);
  }

  function setWarRange() {
    if (!latestWarDate) return;
    setFromParts(parseDateParts(latestWarDate));
    setToParts({ month: "", day: "", year: "" });
    setToLatest(true);
  }

  const hasFilter = !!(from || to);
  const btnBase = "rounded border px-2.5 py-1 transition-colors";
  const modeBtnBase = "rounded border px-3 py-1.5 transition-colors";
  const modeBtn = (active: boolean) =>
    `${modeBtnBase} ${
      active
        ? "border-blue-600 bg-blue-950/50 text-blue-200"
        : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
    }`;

  return (
    <form
      onSubmit={apply}
      className="mb-3 flex flex-wrap items-center gap-2 text-xs"
    >
      {latestWarDate && mode === "utopia" && (
        <button
          type="button"
          onClick={setWarRange}
          className={`${btnBase} border-amber-700/60 bg-amber-950/30 text-amber-400 hover:border-amber-500 hover:text-amber-300`}
        >
          Since war
        </button>
      )}
      {allowTimeMode && (
        <span className="inline-flex gap-1 rounded border border-gray-800 bg-gray-950 p-1">
          <button
            type="button"
            onClick={() => setMode("utopia")}
            className={modeBtn(mode === "utopia")}
          >
            Utopia
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("real");
              setRealFrom((current) => current || defaultRealFrom());
            }}
            className={modeBtn(mode === "real")}
          >
            Real
          </button>
        </span>
      )}
      <span className="text-gray-500">Date range:</span>
      {mode === "real" ? (
        <input
          type="datetime-local"
          value={realFrom}
          onChange={(e) => setRealFrom(e.target.value)}
          className="rounded border border-gray-700 bg-gray-900 px-1.5 py-1 text-gray-300 focus:border-gray-500 focus:outline-none"
        />
      ) : (
        <DateSelector value={fromParts} onChange={setFromParts} />
      )}
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
          {mode === "real" ? (
            <input
              type="datetime-local"
              value={realTo}
              onChange={(e) => setRealTo(e.target.value)}
              className="rounded border border-gray-700 bg-gray-900 px-1.5 py-1 text-gray-300 focus:border-gray-500 focus:outline-none"
            />
          ) : (
            <DateSelector value={toParts} onChange={setToParts} />
          )}
          <button
            type="button"
            onClick={() => {
              setToParts({ month: "", day: "", year: "" });
              setRealTo("");
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
