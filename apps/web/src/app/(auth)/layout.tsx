import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center bg-surface-muted p-4">{children}</main>;
}
