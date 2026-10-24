import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { PlanListPage } from "@/features/admin/plans/plan-list-page";

export const metadata: Metadata = { title: ADMIN_TITLES.plans };

export default function Page() {
  return <PlanListPage />;
}
