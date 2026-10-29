// Public API address, embedded by Next.js when the frontend is built.
export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://payvolution.onrender.com"
    : "http://127.0.0.1:8000")
).replace(/\/+$/, "");
