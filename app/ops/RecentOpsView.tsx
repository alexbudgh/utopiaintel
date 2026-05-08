"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { formatLocalDate, formatLocalTimestamp, timeAgo } from "@/lib/ui";
import type { RecentOp } from "@/lib/db";
import { Tooltip } from "@/app/components/Tooltip";

const OP_COLORS: Record<string, string> = {
  SoT:        "border-blue-500/40 bg-blue-500/10 text-blue-300",
  SoM:        "border-violet-500/40 bg-violet-500/10 text-violet-300",
  SoD:        "border-amber-500/40 bg-amber-500/10 text-amber-300",
  SoS:        "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  Survey:     "border-green-500/40 bg-green-500/10 text-green-300",
  Infiltrate: "border-red-500/40 bg-red-500/10 text-red-300",
};

const CATEGORY_COLORS: Record<string, string> = {
  intel:    "border-gray-500/40 bg-gray-500/10 text-gray-300",
  thievery: "border-red-500/40 bg-red-500/10 text-red-300",
  sorcery:  "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  attack:   "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

const MAX_OPS = 200;
const PAGE_SIZE = 50;
const POLL_MS = 10_000;
const ALL_FILTER = "__all__";
const UNKNOWN_FILTER = "__unknown__";
const OP_ORDER = [
  ...Object.keys(OP_COLORS),
  "granaries",
  "towers",
  "vaults",
];

const OP_LABELS: Record<string, string> = {
  granaries: "Rob Granaries",
  towers: "Rob Towers",
  vaults: "Rob Vaults",
};

function formatOpType(type: string): string {
  if (OP_LABELS[type]) return OP_LABELS[type];
  if (OP_COLORS[type]) return type;
  return type
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDetailValue(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDetail(op: RecentOp): string {
  if (op.detail_value == null || !op.detail_kind) return op.summary ?? "";

  const value = formatDetailValue(op.detail_value);
  switch (op.detail_kind) {
    case "amount_stolen":
      if (op.op_type === "granaries") return `${value} bushels`;
      if (op.op_type === "towers") return `${value} runes`;
      if (op.op_type === "vaults") return `${value} gc`;
      return `${value} stolen`;
    case "troops_assassinated":
      return `${value} troops`;
    case "kidnapped":
      return `${value} kidnapped`;
    case "acres_burned":
    case "acres_taken":
      return `${value} acres`;
    case "effect_duration":
    case "duration_days":
    case "return_days":
      return `${value} days`;
    case "thieves_lost":
      return `${value} thieves lost`;
    case "wizards_lost":
      return `${value} wizards lost`;
    case "runes_spent":
      return `${value} runes`;
    case "massacred":
      return `${value} massacred`;
    case "enemy_killed":
      return `${value} killed`;
    case "enemy_imprisoned":
      return `${value} imprisoned`;
    default:
      return value;
  }
}

function formatResult(op: RecentOp): string {
  const outcome = op.outcome ? (op.outcome === "success" ? "Success" : "Failed") : "";
  const detail = formatDetail(op);
  if (outcome && detail) return `${outcome} · ${detail}`;
  return outcome || detail || "—";
}

function outcomeClass(outcome: string): string {
  return outcome === "success" ? "text-emerald-300" : "text-red-300";
}

export function RecentOpsView({ initialOps }: { initialOps: RecentOp[] }) {
  const [ops, setOps] = useState(initialOps);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [activeTypes, setActiveTypes] = useState<Set<string>>(() => new Set());
  const [kingdomFilter, setKingdomFilter] = useState(ALL_FILTER);
  const [targetFilter, setTargetFilter] = useState(ALL_FILTER);
  const [senderFilter, setSenderFilter] = useState(ALL_FILTER);
  const [outcomeFilter, setOutcomeFilter] = useState(ALL_FILTER);
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const latestRef = useRef(initialOps[0]?.received_at ?? "");

  const opTypes = useMemo(() => {
    const types = [...new Set(ops.map((op) => op.op_type))];
    return types.sort((a, b) => {
      const ai = OP_ORDER.indexOf(a);
      const bi = OP_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return formatOpType(a).localeCompare(formatOpType(b));
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [ops]);

  const kingdoms = useMemo(() => [...new Set(ops.map((op) => op.kingdom))].sort(), [ops]);
  const targets = useMemo(() => [...new Set(ops.map((op) => op.province_name))].sort(), [ops]);
  const senders = useMemo(() => {
    const names = [...new Set(ops.map((op) => op.saved_by).filter((v): v is string => !!v))].sort();
    return ops.some((op) => !op.saved_by) ? [UNKNOWN_FILTER, ...names] : names;
  }, [ops]);
  const hasOutcomes = useMemo(() => ops.some((op) => op.outcome), [ops]);

  const visibleOps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ops.filter((op) => {
      if (activeTypes.size > 0 && !activeTypes.has(op.op_type)) return false;
      if (kingdomFilter !== ALL_FILTER && op.kingdom !== kingdomFilter) return false;
      if (targetFilter !== ALL_FILTER && op.province_name !== targetFilter) return false;
      if (senderFilter === UNKNOWN_FILTER && op.saved_by) return false;
      if (senderFilter !== ALL_FILTER && senderFilter !== UNKNOWN_FILTER && op.saved_by !== senderFilter) return false;
      if (outcomeFilter !== ALL_FILTER && op.outcome !== outcomeFilter) return false;
      if (!q) return true;

      return [
        op.op_type,
        formatOpType(op.op_type),
        op.op_category,
        op.province_name,
        op.kingdom,
        op.actor_name ?? "",
        op.actor_kingdom ?? "",
        op.outcome ?? "",
        formatResult(op),
        op.summary ?? "",
        op.detail_kind ?? "",
        op.detail_value != null ? String(op.detail_value) : "",
        op.saved_by ?? "",
        op.slot != null ? `#${op.slot}` : "",
        op.slot != null ? String(op.slot) : "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [ops, activeTypes, kingdomFilter, targetFilter, senderFilter, outcomeFilter, query]);

  const hasFilters = activeTypes.size > 0 || kingdomFilter !== ALL_FILTER || targetFilter !== ALL_FILTER || senderFilter !== ALL_FILTER || outcomeFilter !== ALL_FILTER || query.trim() !== "";
  const pagedOps = visibleOps.slice(0, visibleLimit);
  const groupedOps = useMemo(() => {
    const groups: Array<{ label: string; ops: RecentOp[] }> = [];
    for (const op of pagedOps) {
      const label = formatLocalDate(op.received_at);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.ops.push(op);
      else groups.push({ label, ops: [op] });
    }
    return groups;
  }, [pagedOps]);

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filterToType = (type: string) => {
    setActiveTypes(new Set([type]));
  };

  const filterToSender = (sender: string | null) => {
    setSenderFilter(sender ?? UNKNOWN_FILTER);
  };

  const filterToTarget = (target: string) => {
    setTargetFilter(target);
  };

  const filterToOutcome = (outcome: string) => {
    setOutcomeFilter(outcome);
  };

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [activeTypes, kingdomFilter, targetFilter, senderFilter, outcomeFilter, query]);

  const clearFilters = () => {
    setActiveTypes(new Set());
    setKingdomFilter(ALL_FILTER);
    setTargetFilter(ALL_FILTER);
    setSenderFilter(ALL_FILTER);
    setOutcomeFilter(ALL_FILTER);
    setQuery("");
  };

  useEffect(() => {
    const interval = setInterval(async () => {
      const since = latestRef.current;
      const res = await fetch(`/api/ops${since ? `?since=${encodeURIComponent(since)}` : ""}`);
      if (!res.ok) return;
      const fresh: RecentOp[] = await res.json();
      if (fresh.length === 0) return;

      latestRef.current = fresh[0].received_at;
      const keys = new Set(fresh.map((op) => op.received_at + op.op_type + op.province_name + (op.actor_name ?? "")));
      setNewKeys(keys);
      setOps((prev) => [...fresh, ...prev].slice(0, MAX_OPS));
      setTimeout(() => setNewKeys(new Set()), 2000);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  if (ops.length === 0) {
    return <p className="text-sm text-gray-500">No ops recorded yet.</p>;
  }

  const controlClass = "rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 placeholder-gray-600 focus:border-gray-500 focus:outline-none";
  const buttonBase = "rounded border px-2 py-1 text-xs transition-colors";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter ops..."
          className={`${controlClass} w-44`}
        />
        <select value={kingdomFilter} onChange={(e) => setKingdomFilter(e.target.value)} className={controlClass}>
          <option value={ALL_FILTER}>All kingdoms</option>
          {kingdoms.map((kingdom) => (
            <option key={kingdom} value={kingdom}>{kingdom}</option>
          ))}
        </select>
        <select value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)} className={controlClass}>
          <option value={ALL_FILTER}>All targets</option>
          {targets.map((target) => (
            <option key={target} value={target}>{target}</option>
          ))}
        </select>
        <select value={senderFilter} onChange={(e) => setSenderFilter(e.target.value)} className={controlClass}>
          <option value={ALL_FILTER}>All submitters</option>
          {senders.map((sender) => (
            <option key={sender} value={sender}>{sender === UNKNOWN_FILTER ? "Unknown submitter" : sender}</option>
          ))}
        </select>
        {hasOutcomes && (
          <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)} className={controlClass}>
            <option value={ALL_FILTER}>All results</option>
            <option value="success">Success</option>
            <option value="failure">Failed</option>
          </select>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {opTypes.map((type) => {
            const active = activeTypes.has(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`${buttonBase} ${active ? (OP_COLORS[type] ?? "border-gray-600 bg-gray-800/40 text-gray-300") : "border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-300"}`}
              >
                {formatOpType(type)}
              </button>
            );
          })}
        </div>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className={`${buttonBase} border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-300`}>
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-gray-600">
          {Math.min(visibleLimit, visibleOps.length)} of {visibleOps.length}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
            <th className="pb-2 pr-4 font-medium">Op</th>
            <th className="pb-2 pr-4 font-medium">Target</th>
            <th className="pb-2 pr-4 font-medium">Kingdom</th>
            <th className="pb-2 pr-4 font-medium">Result</th>
            <th className="pb-2 pr-4 font-medium">By</th>
            <th className="pb-2 font-medium text-right">Age</th>
          </tr>
        </thead>
        {groupedOps.map((group) => (
          <tbody key={group.label}>
            <tr>
              <td colSpan={6} className="bg-gray-950 py-2 pt-5 text-xs font-medium uppercase text-gray-500">
                {group.label}
              </td>
            </tr>
            {group.ops.map((op) => {
              const key = op.received_at + op.op_type + op.province_name + (op.actor_name ?? "");
              const kdHref = `/kingdom/${encodeURIComponent(op.kingdom)}`;
              const color = OP_COLORS[op.op_type] ?? CATEGORY_COLORS[op.op_category] ?? "border-gray-600 bg-gray-800/40 text-gray-400";
              const isNew = newKeys.has(key);
              const detail = formatDetail(op);
              return (
                <tr
                  key={key}
                  className={`border-b border-gray-800/50 transition-colors duration-1000 ${isNew ? "bg-gray-700/40" : "hover:bg-gray-800/30"}`}
                >
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => filterToType(op.op_type)}
                      aria-pressed={activeTypes.size === 1 && activeTypes.has(op.op_type)}
                      className={`rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:border-white/40 hover:text-white ${color}`}
                      title={`Filter to ${formatOpType(op.op_type)}`}
                    >
                      {formatOpType(op.op_type)}
                    </button>
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => filterToTarget(op.province_name)}
                      aria-pressed={targetFilter === op.province_name}
                      className="text-left text-gray-200 transition-colors hover:text-white"
                      title={`Filter to ${op.province_name}`}
                    >
                      {op.slot != null && (
                        <span className="mr-1.5 text-xs tabular-nums text-gray-500">#{op.slot}</span>
                      )}
                      {op.province_name}
                    </button>
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={kdHref} className="font-mono text-[11px] text-gray-400 hover:text-gray-200 transition-colors">
                      {op.kingdom || "—"}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-[12px] text-gray-400">
                    {op.outcome ? (
                      <>
                        <button
                          type="button"
                          onClick={() => filterToOutcome(op.outcome!)}
                          aria-pressed={outcomeFilter === op.outcome}
                          className={`${outcomeClass(op.outcome)} transition-colors hover:text-white`}
                          title={`Filter to ${op.outcome === "success" ? "Success" : "Failed"}`}
                        >
                          {op.outcome === "success" ? "Success" : "Failed"}
                        </button>
                        {detail && <span className="text-gray-500"> · {detail}</span>}
                      </>
                    ) : (
                      detail || "—"
                    )}
                  </td>
                  <td className="py-2 pr-4 text-[12px]">
                    <button
                      type="button"
                      onClick={() => filterToSender(op.saved_by)}
                      aria-pressed={senderFilter === (op.saved_by ?? UNKNOWN_FILTER)}
                      className="rounded px-1 py-0.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
                      title={`Filter to ${op.saved_by ?? "unknown submitter"}`}
                    >
                      {op.saved_by ?? <span className="text-gray-600">—</span>}
                    </button>
                  </td>
                  <td className="py-2 text-right text-gray-500 text-[12px] tabular-nums">
                    <Tooltip content={formatLocalTimestamp(op.received_at)}>
                      <span>{timeAgo(op.received_at)}</span>
                    </Tooltip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
        <tbody>
          {visibleOps.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-gray-500">
                No ops match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {visibleLimit < visibleOps.length && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}
            className={`${buttonBase} border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200`}
          >
            Show more
          </button>
        </div>
      )}
    </>
  );
}
