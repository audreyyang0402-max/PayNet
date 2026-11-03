// src/app/vendor/rental/page.tsx
// Rentals have been removed from Payvolution. Redirect to home.
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RentalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
