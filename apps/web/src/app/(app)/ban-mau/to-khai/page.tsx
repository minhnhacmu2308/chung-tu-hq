import type { Metadata } from "next";
import { Suspense } from "react";
import { DeclarationFormPrototype } from "@/features/declaration-form/declaration-form";

export const metadata: Metadata = { title: "Bản mẫu tờ khai đầy đủ" };

export default function Page() {
  return (
    <Suspense>
      <DeclarationFormPrototype />
    </Suspense>
  );
}
