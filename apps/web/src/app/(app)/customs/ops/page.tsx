import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { CustomsOpsPage } from "@/features/customs-ops/customs-ops-page";

export const metadata: Metadata = { title: VI_TITLES.customsOps };

export default function Page() {
  return <CustomsOpsPage />;
}
