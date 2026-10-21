"use client";
import { Toaster, TooltipProvider, UiLocaleProvider } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";
import { AppearanceProvider, useAppearance } from "@/features/appearance/use-appearance";
import { setFormatLocale } from "@/lib/format";

function Localized({ children }: { children: ReactNode }) {
  const { appearance } = useAppearance();
  // Đặt trước khi render con: hàm định dạng (số, ngày) đọc ngôn ngữ này.
  setFormatLocale(appearance.locale);
  return (
    <UiLocaleProvider locale={appearance.locale}>
      <TooltipProvider>
        {/* Đổi ngôn ngữ → dựng lại cả cây để mọi nhãn và số/ngày đổi theo. */}
        <Fragment key={appearance.locale}>{children}</Fragment>
        <Toaster />
      </TooltipProvider>
    </UiLocaleProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <AppearanceProvider>
        <Localized>{children}</Localized>
      </AppearanceProvider>
    </QueryClientProvider>
  );
}
