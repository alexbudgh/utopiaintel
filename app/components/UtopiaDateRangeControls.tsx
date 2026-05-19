"use client";

import {
  utcTimestampToUtopiaDate,
  utopiaDateToUtcTimestamp,
} from "@/lib/utopia-age";

const UTOPIA_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
];

export type DateRangeMode = "real" | "utopia";

export interface DateParts {
  month: string;
  day: string;
  year: string;
}

export interface UtopiaDateRangeValue {
  mode: DateRangeMode;
  from: string;
  to: string;
  toLatest: boolean;
}

export function emptyDateParts(): DateParts {
  return { month: "", day: "", year: "" };
}

export function parseDateParts(s?: string): DateParts {
  if (!s) return emptyDateParts();
  const m = /^(\w+)\s+(\d+)\s+of\s+YR(\d+)$/i.exec(s.trim());
  if (!m) return emptyDateParts();
  return { month: m[1], day: m[2], year: m[3] };
}

export function formatDateParts({ month, day, year }: DateParts): string {
  if (!month || !day || !year) return "";
  return `${month} ${day} of YR${year}`;
}

export function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultRealFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 3);
  date.setSeconds(0, 0);
  return formatDateTimeLocal(date);
}

export function realInputToDbTimestamp(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function dbTimestampToRealInput(value: string): string {
  if (!value) return "";
  const d = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  return formatDateTimeLocal(d);
}

export function realInputToUtopiaDate(value: string): string {
  const timestamp = realInputToDbTimestamp(value);
  return timestamp ? (utcTimestampToUtopiaDate(timestamp) ?? "") : "";
}

export function utopiaDateToRealInput(value: string): string {
  const timestamp = utopiaDateToUtcTimestamp(value);
  return timestamp ? dbTimestampToRealInput(timestamp) : "";
}

export function convertDateRangeMode(
  value: UtopiaDateRangeValue,
  mode: DateRangeMode,
): UtopiaDateRangeValue {
  if (value.mode === mode) return value;
  if (mode === "real") {
    return {
      mode,
      from: utopiaDateToRealInput(value.from) || defaultRealFrom(),
      to: value.toLatest ? "" : utopiaDateToRealInput(value.to),
      toLatest: value.toLatest,
    };
  }
  return {
    mode,
    from: realInputToUtopiaDate(value.from),
    to: value.toLatest ? "" : realInputToUtopiaDate(value.to),
    toLatest: value.toLatest,
  };
}

export function initialDateRangeValue({
  from,
  to,
  timeMode = "utopia",
  effectiveFrom,
}: {
  from?: string;
  to?: string;
  timeMode?: DateRangeMode;
  effectiveFrom?: string;
}): UtopiaDateRangeValue {
  return {
    mode: timeMode,
    from: timeMode === "utopia" ? (from ?? effectiveFrom ?? "") : (from ?? ""),
    to: to ?? "",
    toLatest: !to,
  };
}

const dateInputClass =
  "rounded border border-gray-700 bg-gray-900 px-1.5 py-1 text-gray-300 focus:border-gray-500 focus:outline-none";

export function RealDateTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={dateInputClass}
    />
  );
}

export function UtopiaDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parts = parseDateParts(value);
  const setParts = (next: DateParts) => onChange(formatDateParts(next));

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={parts.month}
        onChange={(e) => setParts({ ...parts, month: e.target.value })}
        className={dateInputClass}
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
        value={parts.day}
        onChange={(e) => setParts({ ...parts, day: e.target.value })}
        placeholder="Day"
        className={`${dateInputClass} w-14`}
      />
      <span className="text-[11px] text-gray-600">YR</span>
      <input
        type="number"
        min={0}
        value={parts.year}
        onChange={(e) => setParts({ ...parts, year: e.target.value })}
        placeholder="Yr"
        className={`${dateInputClass} w-12`}
      />
    </span>
  );
}

function DateRangeEndpointPicker({
  mode,
  value,
  onChange,
}: {
  mode: DateRangeMode;
  value: string;
  onChange: (value: string) => void;
}) {
  return mode === "real" ? (
    <RealDateTimePicker value={value} onChange={onChange} />
  ) : (
    <UtopiaDatePicker value={value} onChange={onChange} />
  );
}

export function UtopiaDateRangeControls({
  value,
  onChange,
  allowTimeMode = false,
  latestWarDate,
}: {
  value: UtopiaDateRangeValue;
  onChange: (value: UtopiaDateRangeValue) => void;
  allowTimeMode?: boolean;
  latestWarDate?: string;
}) {
  const btnBase = "rounded border px-2.5 py-1 transition-colors";
  const modeBtnBase = "rounded border px-3 py-1.5 transition-colors";
  const modeBtn = (active: boolean) =>
    `${modeBtnBase} ${
      active
        ? "border-blue-600 bg-blue-950/50 text-blue-200"
        : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
    }`;

  function setFrom(from: string) {
    onChange({ ...value, from });
  }

  function setTo(to: string) {
    onChange({ ...value, to });
  }

  function setWarRange() {
    if (!latestWarDate) return;
    onChange({
      ...value,
      from:
        value.mode === "real"
          ? utopiaDateToRealInput(latestWarDate)
          : latestWarDate,
      to: "",
      toLatest: true,
    });
  }

  return (
    <>
      {latestWarDate && (
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
            onClick={() => onChange(convertDateRangeMode(value, "utopia"))}
            className={modeBtn(value.mode === "utopia")}
          >
            Utopia
          </button>
          <button
            type="button"
            onClick={() => onChange(convertDateRangeMode(value, "real"))}
            className={modeBtn(value.mode === "real")}
          >
            Real
          </button>
        </span>
      )}
      <span className="text-gray-500">Date range:</span>
      <DateRangeEndpointPicker
        mode={value.mode}
        value={value.from}
        onChange={setFrom}
      />
      <span className="text-gray-600">-</span>
      {value.toLatest ? (
        <button
          type="button"
          onClick={() => onChange({ ...value, toLatest: false })}
          className={`${btnBase} border-blue-700 bg-blue-950/40 text-blue-300 hover:border-blue-500`}
        >
          Latest
        </button>
      ) : (
        <>
          <DateRangeEndpointPicker
            mode={value.mode}
            value={value.to}
            onChange={setTo}
          />
          <button
            type="button"
            onClick={() => onChange({ ...value, to: "", toLatest: true })}
            className={`${btnBase} border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300`}
          >
            Latest
          </button>
        </>
      )}
    </>
  );
}
