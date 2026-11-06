"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export default function MenuScrollRow({ children, merchantName }: { children: ReactNode; merchantName: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const rowId = useId();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const updateNavigation = () => {
      setCanScrollLeft(row.scrollLeft > 1);
      setCanScrollRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    };
    updateNavigation();
    row.addEventListener("scroll", updateNavigation, { passive: true });
    const observer = new ResizeObserver(updateNavigation);
    observer.observe(row);
    for (const card of row.children) observer.observe(card);

    return () => {
      row.removeEventListener("scroll", updateNavigation);
      observer.disconnect();
    };
  }, [children]);

  function scrollMenu(direction: number) {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({
      left: direction * row.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <div className="min-w-0">
      <div className="mb-2 flex justify-end gap-2">
        <button type="button" aria-label={`Previous items from ${merchantName}`} aria-controls={rowId} disabled={!canScrollLeft} onClick={() => scrollMenu(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-xl font-bold text-orange-700 hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-default disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300">
          <span aria-hidden="true">←</span>
        </button>
        <button type="button" aria-label={`Next items from ${merchantName}`} aria-controls={rowId} disabled={!canScrollRight} onClick={() => scrollMenu(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-xl font-bold text-orange-700 hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-default disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300">
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <div id={rowId} ref={rowRef} role="region" aria-label={`${merchantName} menu`} tabIndex={0} className="menu-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 focus-visible:outline-2 focus-visible:outline-orange-600">
        {children}
      </div>
    </div>
  );
}
