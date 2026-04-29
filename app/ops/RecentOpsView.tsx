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

export function RecentOpsView({ ops }: { ops: RecentOp[] }) {
  if (ops.length === 0) {
    return <p className="text-sm text-gray-500">No ops recorded yet.</p>;
  }

  return (
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
        {ops.map((op, i) => {
          const kdHref = `/kingdom/${encodeURIComponent(op.kingdom)}`;
          const provHref = `${kdHref}/${encodeURIComponent(op.province_name)}`;
          const color = OP_COLORS[op.op_type] ?? "border-gray-600 bg-gray-800/40 text-gray-400";
          return (
            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
              <td className="py-2 pr-4">
                <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${color}`}>
                  {op.op_type}
                </span>
              </td>
              <td className="py-2 pr-4">
                <Link href={provHref} className="text-gray-200 hover:text-white transition-colors">
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
      </tbody>
    </table>
  );
}
