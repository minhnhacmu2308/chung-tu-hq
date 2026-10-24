import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { InboxPage } from "@/features/inbox/inbox-page";

export const metadata: Metadata = { title: VI_TITLES.inbox };

export default function Page() {
  return <InboxPage />;
}
