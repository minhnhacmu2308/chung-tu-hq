import type { Metadata } from "next";
import { SystemHealthPage } from "@/features/admin/system/system-health-page";

export const metadata: Metadata = { title: "Sức khỏe hệ thống" };

export default function Page() {
  return <SystemHealthPage />;
}
