import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { ForgotPasswordPage } from "@/features/auth/forgot-password-page";

export const metadata: Metadata = { title: VI_TITLES.forgotPassword };

/** `?email=` – trang đăng nhập mang sang email đang nhập. */
export default async function Page({ searchParams }: { searchParams: Promise<{ email?: string | string[] }> }) {
  const { email } = await searchParams;
  return <ForgotPasswordPage initialEmail={typeof email === "string" ? email : ""} />;
}
