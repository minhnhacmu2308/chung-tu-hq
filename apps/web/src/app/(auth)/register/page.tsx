import type { Metadata } from "next";
import { RegisterPage } from "@/features/auth/register-page";

export const metadata: Metadata = { title: "Đăng ký" };

export default function Page() {
  return <RegisterPage />;
}
