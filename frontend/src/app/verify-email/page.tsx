import { redirect } from "next/navigation";
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  const { purpose } = await searchParams;
  redirect(purpose === "reset" ? "/forgot-password" : "/vendor/register");
}
