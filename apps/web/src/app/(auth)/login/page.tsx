import type { Metadata } from "next";
import { LoginPage } from "@/features/auth/login-page";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function Page() {
  return <LoginPage />;
}
