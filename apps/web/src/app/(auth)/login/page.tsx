import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { LoginPage } from "@/features/auth/login-page";

export const metadata: Metadata = { title: VI_TITLES.login };

export default function Page() {
  return <LoginPage />;
}
