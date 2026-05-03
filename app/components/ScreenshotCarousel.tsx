"use client";

import { useState } from "react";
import Image from "next/image";

const SLIDES = [
  {
    src: "/static/screenshot-news.png",
    width: 2812,
    height: 1534,
    alt: "Kingdom news view",
    caption: "Kingdom news — combat events broken down by province, with march gains, ambushes, and raze totals at a glance.",
  },
  {
    src: "/static/screenshot-history.png",
    width: 2828,
    height: 1086,
    alt: "Kingdom history charts",
    caption: "Snapshot history — compare NW, land, and honor trends across kingdoms over time to track war progress and growth.",
  },
];

export function ScreenshotCarousel() {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-stone-800 bg-stone-900">
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((s) => (
            <div key={s.src} className="w-full shrink-0">
              <Image
                src={s.src}
                alt={s.alt}
                width={s.width}
                height={s.height}
                className="w-full"
              />
            </div>
          ))}
        </div>

        {/* Prev / Next */}
        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-stone-700 bg-stone-900/80 p-2 text-stone-300 backdrop-blur-sm transition-colors hover:border-stone-500 hover:text-stone-100"
          aria-label="Previous screenshot"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-stone-700 bg-stone-900/80 p-2 text-stone-300 backdrop-blur-sm transition-colors hover:border-stone-500 hover:text-stone-100"
          aria-label="Next screenshot"
        >
          ›
        </button>
      </div>

      {/* Caption + dots */}
      <div className="flex items-center gap-4 px-1">
        <p className="flex-1 text-sm leading-6 text-stone-400">{slide.caption}</p>
        <div className="flex shrink-0 gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to screenshot ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-amber-400" : "w-1.5 bg-stone-600 hover:bg-stone-400"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
