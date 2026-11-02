// Tracks whether the current admin has a "live" session in THIS browser tab.
//
// Deliberately kept in memory only — never localStorage/sessionStorage — so a
// hard page reload always clears it, forcing a fresh login. Customer and
// merchant sessions are unaffected; they keep using the normal token in
// localStorage, which survives reloads indefinitely as before. This file is
// imported by both the login page (to mark the start of an admin session)
// and the admin layout (to check it on every admin page).

const ADMIN_SESSION_MAX_MS = 8 * 60 * 1000; // 8 minutes

let verifiedAt: number | null = null;

export function markAdminSessionStart() {
  verifiedAt = Date.now();
}

export function clearAdminSession() {
  verifiedAt = null;
}

export function isAdminSessionLive(): boolean {
  return verifiedAt !== null && Date.now() - verifiedAt <= ADMIN_SESSION_MAX_MS;
}

export function adminSessionMaxMs() {
  return ADMIN_SESSION_MAX_MS;
}
