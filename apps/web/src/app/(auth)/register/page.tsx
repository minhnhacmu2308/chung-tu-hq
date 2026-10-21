import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { RegisterPage } from "@/features/auth/register-page";

export const metadata: Metadata = { title: VI_TITLES.register };

export default function Page() {
  return <RegisterPage />;
}
