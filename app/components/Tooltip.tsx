"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
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
  const lines = content.split("\n");

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
            <span key={i} className={i === 0 ? "text-gray-100 font-medium" : "text-gray-400"}>
              {line}
            </span>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}
