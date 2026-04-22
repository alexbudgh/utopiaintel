"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IntelSetupCard } from "@/app/components/IntelSetupCard";

export function IntelSetupButton({ endpointUrl }: { endpointUrl: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // Clamp dropdown so it doesn't overflow the left edge of the viewport.
  useLayoutEffect(() => {
    if (!open || !dropdownRef.current) return;
    const el = dropdownRef.current;
    el.style.transform = "";
    const overflow = 8 - el.getBoundingClientRect().left;
    if (overflow > 0) el.style.transform = `translateX(${overflow}px)`;
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center rounded border px-3 py-1.5 text-sm transition-colors ${
          open
            ? "border-blue-700 bg-blue-950/40 text-blue-100"
            : "border-gray-700 text-gray-300 hover:border-gray-500 hover:text-gray-100"
        }`}
      >
        Setup
      </button>
      {open && (
        <div ref={dropdownRef} className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[28rem] max-w-[calc(100vw-2rem)]">
          <IntelSetupCard endpointUrl={endpointUrl} compact />
        </div>
      )}
    </div>
  );
}
