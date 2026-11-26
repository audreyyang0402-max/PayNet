import { clearAdminSession } from "@/lib/admin-session";

export function signOut() {
  clearAdminSession();
  for (const key of ["token", "user_id", "userRole", "userName"]) {
    localStorage.removeItem(key);
  }
}
