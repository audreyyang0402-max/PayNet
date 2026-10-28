// src/app/vendor/rental/page.tsx
"use client";

import { Suspense } from "react";
import RentalContent from "./content";

export default function VendorRentalsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading rentals...</div>}>
      <RentalContent />
    </Suspense>
  );
}
