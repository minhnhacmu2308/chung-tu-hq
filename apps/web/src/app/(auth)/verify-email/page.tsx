import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { VerifyEmailPage } from "@/features/auth/verify-email-page";

export const metadata: Metadata = { title: VI_TITLES.verifyEmail };

/** Mở từ liên kết trong email: `?token=…` (packages/core identity `_mail-templates.ts`). */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <VerifyEmailPage token={typeof token === "string" ? token : ""} />;
}
