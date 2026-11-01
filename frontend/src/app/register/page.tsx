// frontend/src/app/register/page.tsx
// Sign-up goes through the PayNet backend on /vendor/register (it creates the PayNet account and login token).
// This page used to call Supabase Auth directly, which made accounts the backend didn't know about.
import { redirect } from "next/navigation";

export default function RegisterPage() {
  redirect("/vendor/register");
}
