// src/app/admin/login/page.tsx
// Everyone logs in at /login — this page redirects there.
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login");
  }, [router]);
  return null;
}
