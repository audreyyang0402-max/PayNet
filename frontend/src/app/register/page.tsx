// frontend/src/app/register/page.tsx
// Redirect to /vendor/register
import { redirect } from "next/navigation";

export default function RegisterPage() {
  redirect("/vendor/register");
}
