"use client";

import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
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

function isTooltipLines(content: ReactNode | string | TooltipLine[]): content is TooltipLine[] {
  return Array.isArray(content) && content.every((item) =>
    typeof item === "object" &&
    item !== null &&
    "text" in item &&
    typeof (item as { text?: unknown }).text === "string",
  );
}

export function Tooltip({ content, children }: { content: ReactNode | string | TooltipLine[]; children: ReactNode }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!tipRef.current || !anchor) return;
    const rect = tipRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const anchorCenter = anchor.left + anchor.width / 2;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding);
    const maxTop = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding);

    const centeredLeft = anchorCenter - rect.width / 2;
    const left = Math.min(Math.max(centeredLeft, viewportPadding), maxLeft);

    const aboveTop = anchor.top - rect.height - viewportPadding;
    const belowTop = anchor.bottom + viewportPadding;

    let top: number;
    if (aboveTop >= viewportPadding) {
      top = aboveTop;
    } else if (belowTop + rect.height <= window.innerHeight - viewportPadding) {
      top = belowTop;
    } else {
      top = Math.min(Math.max(belowTop, viewportPadding), maxTop);
    }

    setStyle({ left, top });
  }, [anchor]);

  useLayoutEffect(() => {
    if (!anchor) {
      setStyle(null);
    }
  }, [anchor]);

  if (!content) return <>{children}</>;
  const lines: TooltipLine[] | null = typeof content === "string"
    ? content.split("\n").map((text) => ({ text }))
    : isTooltipLines(content)
      ? content
      : null;
  const customContent: ReactNode | null = lines ? null : (content as ReactNode);

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
          className={`fixed z-50 pointer-events-none rounded bg-gray-900 border border-gray-700 shadow-lg ${
            lines ? "flex flex-col gap-0.5 w-max max-w-xs px-2 py-1.5 text-xs" : "p-2"
          }`}
          style={style ?? { left: anchor.left, top: anchor.top - 8 }}
        >
          {lines
            ? lines.map((line, i) => (
                <span key={i} className={lineClass(line.tone, i === 0)}>
                  {line.text}
                </span>
              ))
            : customContent}
        </div>,
        document.body,
      )}
    </span>
  );
}
