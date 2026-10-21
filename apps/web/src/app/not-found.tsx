"use client";
// @kb/ui là thư viện component phía client (dùng hook) nên trang này phải là Client Component.
import { BrandMark, Button, EmptyState, useMessages } from "@kb/ui";
import { ArrowLeft, House } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_TITLES } from "./app-titles.messages";
import { NOT_FOUND_MESSAGES } from "./app-pages.messages";

export default function NotFound() {
  const t = useMessages(NOT_FOUND_MESSAGES);
  const router = useRouter();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg p-6">
      <Link href="/" className="flex items-center gap-2 text-base font-semibold text-fg">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-fg">
          <BrandMark small decorative className="h-6 w-6" />
        </span>
        {APP_TITLES.vi.brand}
      </Link>
      <EmptyState
        illustration="not-found"
        illustrationSize="lg"
        title={<span className="text-xl">{t.title}</span>}
        description={
          <>
            <span className="sr-only">{t.code}. </span>
            {t.description}
          </>
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/">
                <House className="h-4 w-4" aria-hidden="true" />
                {t.home}
              </Link>
            </Button>
            <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.back()}>
              {t.back}
            </Button>
          </div>
        }
      />
    </main>
  );
}
