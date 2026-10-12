"use client";
import { Toaster, TooltipProvider, UiLocaleProvider } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AppearanceProvider, useAppearance } from "@/features/appearance/use-appearance";

function Localized({ children }: { children: ReactNode }) {
  const { appearance } = useAppearance();
  return (
    <UiLocaleProvider locale={appearance.locale}>
      <TooltipProvider>
        {children}
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
