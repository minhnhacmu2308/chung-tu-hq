import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { Suspense } from "react";
import { DeclarationFormPrototype } from "@/features/declaration-form/declaration-form";

export const metadata: Metadata = { title: VI_TITLES.declarationSample };

export default function Page() {
  return (
    <Suspense>
      <DeclarationFormPrototype />
    </Suspense>
  );
}
