"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TooltipLine {
  text: string;
  tone?: "default" | "muted" | "strong" | "good" | "warn" | "bad";
}

function lineClass(tone: TooltipLine["tone"], isFirst: boolean): string {
  if (tone === "bad") return "text-red-300 font-medium";
  if (tone === "warn") return "text-amber-300 font-medium";
  if (tone === "good") return "text-green-300 font-medium";
  if (tone === "strong") return "text-gray-100 font-medium";
  if (tone === "muted") return "text-gray-500";
  return isFirst ? "text-gray-100 font-medium" : "text-gray-400";
}

export function Tooltip({ content, children }: { content: string | TooltipLine[]; children: React.ReactNode }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!tipRef.current || !anchor) return;
    const rect = tipRef.current.getBoundingClientRect();
    const overshoot = rect.right - (window.innerWidth - 8);
    if (overshoot > 0) {
      tipRef.current.style.left = `${anchor.left + anchor.width / 2 - overshoot}px`;
    }
  }, [anchor]);

  if (!content) return <>{children}</>;
  const lines: TooltipLine[] = typeof content === "string"
    ? content.split("\n").map((text) => ({ text }))
    : content;

  return (
    <span
      className="inline-block"
      onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
    >
      {children}
      {anchor && createPortal(
        <div
          ref={tipRef}
          className="fixed z-50 pointer-events-none flex flex-col gap-0.5 w-max max-w-xs rounded bg-gray-900 border border-gray-700 px-2 py-1.5 text-xs shadow-lg"
          style={{ left: anchor.left + anchor.width / 2, top: anchor.top - 8, transform: "translate(-50%, -100%)" }}
        >
          {lines.map((line, i) => (
            <span key={i} className={lineClass(line.tone, i === 0)}>
              {line.text}
            </span>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}
