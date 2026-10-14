import type { Metadata } from "next";
import { UsagePage } from "@/features/admin/usage/usage-page";

export const metadata: Metadata = { title: "Sử dụng & chi phí" };

export default function Page() {
  return <UsagePage />;
}
