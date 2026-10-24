"use client";
// @kb/ui là thư viện component phía client (dùng hook) nên trang này phải là Client Component.
import { BackButton, ErrorScreen, HomeButton } from "@/components/common/error-screen";

export default function NotFound() {
  return <ErrorScreen kind="not-found" fullPage actions={<><HomeButton primary /><BackButton /></>} />;
}
