"use client";

import { useId, type ReactNode } from "react";

// The left/right arrow buttons were removed -- every browser already shows its
// own scrollbar/trackpad-swipe affordance for a horizontally-scrolling row like
// this, so the extra buttons were just visual clutter repeating what's already
// obvious. Horizontal scroll + snap still works the same without them.
export default function MenuScrollRow({ children, merchantName }: { children: ReactNode; merchantName: string }) {
  const rowId = useId();

  return (
    <div className="min-w-0">
      <div id={rowId} role="region" aria-label={`${merchantName} menu`} tabIndex={0} className="menu-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 focus-visible:outline-2 focus-visible:outline-orange-600">
        {children}
      </div>
    </div>
  );
}
