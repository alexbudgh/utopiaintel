"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function KingdomJump() {
  const router = useRouter();
  const [location, setLocation] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const kingdom = location.trim();
    if (!kingdom) return;
    router.push(`/kingdom/${encodeURIComponent(kingdom)}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Jump to 7:5"
        aria-label="Jump to kingdom"
        className="w-28 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-100 placeholder-gray-500 focus:border-gray-500 focus:outline-none"
      />
      <button
        type="submit"
        className="rounded bg-gray-800 px-2 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-gray-100"
      >
        Go
      </button>
    </form>
  );
}
