"use client";
// Lỗi ở chính layout gốc (Providers, font…): Next thay cả <html>, nên tự dựng lại giao diện + ngôn ngữ đã lưu.
import { UiLocaleProvider } from "@kb/ui";
import type { ReactNode } from "react";
import { ErrorScreen, errorKindOf, HomeButton, RetryButton } from "@/components/common/error-screen";
import { AppearanceProvider, useAppearance } from "@/features/appearance/use-appearance";
import "./globals.css";

function Localized({ children }: { children: ReactNode }) {
  const { appearance } = useAppearance();
  return <UiLocaleProvider locale={appearance.locale}>{children}</UiLocaleProvider>;
}

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body>
        <AppearanceProvider>
          <Localized>
            {/* Tải lại hẳn trang: layout gốc hỏng thì dựng lại tại chỗ không đủ. */}
            <ErrorScreen kind={errorKindOf(error)} fullPage reference={error.digest} actions={<><RetryButton onClick={() => window.location.reload()} /><HomeButton /></>} />
          </Localized>
        </AppearanceProvider>
      </body>
    </html>
  );
}
