// frontend/src/app/vendor/login/page.tsx
// Redirect to unified login page
import { redirect } from "next/navigation";

export default function VendorLoginPage() {
  redirect("/login");
}
