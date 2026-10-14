import type { Metadata } from "next";
import { PlanListPage } from "@/features/admin/plans/plan-list-page";

export const metadata: Metadata = { title: "Gói dịch vụ" };

export default function Page() {
  return <PlanListPage />;
}
