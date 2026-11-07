import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { AcceptInvitePage } from "@/features/auth/accept-invite-page";

export const metadata: Metadata = { title: VI_TITLES.acceptInvite };

/** Mở từ liên kết trong email: `?token=…` (packages/core identity `_mail-templates.ts`). */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <AcceptInvitePage token={typeof token === "string" ? token : ""} />;
}
