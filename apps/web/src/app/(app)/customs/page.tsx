import type { Metadata } from "next";
import { CustomsPage } from "@/features/customs/customs-page";

export const metadata: Metadata = { title: "Khai báo Hải quan" };

export default function Page() {
  return <CustomsPage />;
}
