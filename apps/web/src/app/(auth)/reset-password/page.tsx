import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { ResetPasswordPage } from "@/features/auth/reset-password-page";

export const metadata: Metadata = { title: VI_TITLES.resetPassword };

/** Mở từ liên kết trong email: `?token=…` (packages/core identity `_mail-templates.ts`). */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <ResetPasswordPage token={typeof token === "string" ? token : ""} />;
}
