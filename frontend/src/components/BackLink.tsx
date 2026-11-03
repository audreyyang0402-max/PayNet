// frontend/src/components/BackLink.tsx
// The one "go back to X" pill button, used on every page instead of each page
// writing its own plain-text "← Back to X" link. Keep all back navigation
// visually identical by changing BACK_LINK_CLASS in lib/ui.ts, not this markup.

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BACK_LINK_CLASS } from "@/lib/ui";

export default function BackLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={className ? `${BACK_LINK_CLASS} ${className}` : BACK_LINK_CLASS}>
      {children}
    </Link>
  );
}
