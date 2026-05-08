"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/ui";
import type { RecentOp } from "@/lib/db";

const OP_COLORS: Record<string, string> = {
  SoT:        "border-blue-500/40 bg-blue-500/10 text-blue-300",
  SoM:        "border-violet-500/40 bg-violet-500/10 text-violet-300",
  SoD:        "border-amber-500/40 bg-amber-500/10 text-amber-300",
  SoS:        "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  Survey:     "border-green-500/40 bg-green-500/10 text-green-300",
  Infiltrate: "border-red-500/40 bg-red-500/10 text-red-300",
};

const MAX_OPS = 50;
const POLL_MS = 10_000;
const ALL_FILTER = "__all__";
const UNKNOWN_FILTER = "__unknown__";
const OP_ORDER = Object.keys(OP_COLORS);

export function RecentOpsView({ initialOps }: { initialOps: RecentOp[] }) {
  const [ops, setOps] = useState(initialOps);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [activeTypes, setActiveTypes] = useState<Set<string>>(() => new Set());
  const [kingdomFilter, setKingdomFilter] = useState(ALL_FILTER);
  const [senderFilter, setSenderFilter] = useState(ALL_FILTER);
  const [query, setQuery] = useState("");
  const latestRef = useRef(initialOps[0]?.received_at ?? "");

  const opTypes = useMemo(() => {
    const types = [...new Set(ops.map((op) => op.op_type))];
    return types.sort((a, b) => {
      const ai = OP_ORDER.indexOf(a);
      const bi = OP_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [ops]);

  const kingdoms = useMemo(() => [...new Set(ops.map((op) => op.kingdom))].sort(), [ops]);
  const senders = useMemo(() => {
    const names = [...new Set(ops.map((op) => op.saved_by).filter((v): v is string => !!v))].sort();
    return ops.some((op) => !op.saved_by) ? [UNKNOWN_FILTER, ...names] : names;
  }, [ops]);

  const visibleOps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ops.filter((op) => {
      if (activeTypes.size > 0 && !activeTypes.has(op.op_type)) return false;
      if (kingdomFilter !== ALL_FILTER && op.kingdom !== kingdomFilter) return false;
      if (senderFilter === UNKNOWN_FILTER && op.saved_by) return false;
      if (senderFilter !== ALL_FILTER && senderFilter !== UNKNOWN_FILTER && op.saved_by !== senderFilter) return false;
      if (!q) return true;

      return [
        op.op_type,
        op.province_name,
        op.kingdom,
        op.saved_by ?? "",
        op.slot != null ? `#${op.slot}` : "",
        op.slot != null ? String(op.slot) : "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [ops, activeTypes, kingdomFilter, senderFilter, query]);

  const hasFilters = activeTypes.size > 0 || kingdomFilter !== ALL_FILTER || senderFilter !== ALL_FILTER || query.trim() !== "";

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

  const clearFilters = () => {
    setActiveTypes(new Set());
    setKingdomFilter(ALL_FILTER);
    setSenderFilter(ALL_FILTER);
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
      const keys = new Set(fresh.map((op) => op.received_at + op.op_type + op.province_name));
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
        <select value={senderFilter} onChange={(e) => setSenderFilter(e.target.value)} className={controlClass}>
          <option value={ALL_FILTER}>All senders</option>
          {senders.map((sender) => (
            <option key={sender} value={sender}>{sender === UNKNOWN_FILTER ? "Unknown sender" : sender}</option>
          ))}
        </select>
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
                {type}
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
          {visibleOps.length} of {ops.length}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
            <th className="pb-2 pr-4 font-medium">Op</th>
            <th className="pb-2 pr-4 font-medium">Province</th>
            <th className="pb-2 pr-4 font-medium">Kingdom</th>
            <th className="pb-2 pr-4 font-medium">By</th>
            <th className="pb-2 font-medium text-right">Age</th>
          </tr>
        </thead>
        <tbody>
          {visibleOps.map((op) => {
            const key = op.received_at + op.op_type + op.province_name;
            const kdHref = `/kingdom/${encodeURIComponent(op.kingdom)}`;
            const provHref = `${kdHref}/${encodeURIComponent(op.province_name)}`;
            const color = OP_COLORS[op.op_type] ?? "border-gray-600 bg-gray-800/40 text-gray-400";
            const isNew = newKeys.has(key);
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
                    title={`Filter to ${op.op_type}`}
                  >
                    {op.op_type}
                  </button>
                </td>
                <td className="py-2 pr-4">
                  <Link href={provHref} className="text-gray-200 hover:text-white transition-colors">
                    {op.slot != null && (
                      <span className="mr-1.5 text-xs tabular-nums text-gray-500">#{op.slot}</span>
                    )}
                    {op.province_name}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  <Link href={kdHref} className="font-mono text-[11px] text-gray-400 hover:text-gray-200 transition-colors">
                    {op.kingdom}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-gray-400 text-[12px]">
                  {op.saved_by ?? <span className="text-gray-600">—</span>}
                </td>
                <td className="py-2 text-right text-gray-500 text-[12px] tabular-nums">
                  {timeAgo(op.received_at)}
                </td>
              </tr>
            );
          })}
          {visibleOps.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-sm text-gray-500">
                No ops match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
