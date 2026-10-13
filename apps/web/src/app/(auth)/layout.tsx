import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-dvh bg-surface">{children}</main>;
}
