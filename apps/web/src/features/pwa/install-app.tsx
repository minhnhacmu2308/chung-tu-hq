"use client";
// Lối vào cài ứng dụng máy tính: thẻ ở Cài đặt › Ngưỡng & giao diện và mục trong menu người dùng.
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DropdownMenuItem, IconTile, Stack, toast, useMessages } from "@kb/ui";
import { AppWindow, MonitorDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useInstallApp, type BrowserKind } from "./install-prompt";
import { INSTALL_APP_MESSAGES } from "./install-app.messages";

type T = Record<keyof (typeof INSTALL_APP_MESSAGES)["vi"], string>;

/** Bấm cài: hiện hộp thoại của trình duyệt rồi báo kết quả. */
function useInstallAction() {
  const t = useMessages(INSTALL_APP_MESSAGES);
  const app = useInstallApp();
  const run = async () => {
    const ok = await app.install();
    toast({ tone: ok ? "success" : "info", title: ok ? t.installedToast : t.dismissedToast });
  };
  return { ...app, t, run };
}

const manualHint = (browser: BrowserKind, t: T) => (browser === "safari" ? t.safari : browser === "firefox" ? t.firefox : browser === "chromium" ? t.chromium : t.other);

export function InstallAppCard() {
  const { state, browser, t, run } = useInstallAction();
  return (
    <Card id="install-app">
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconTile icon={<AppWindow />} tone="primary" />
          <div className="min-w-0">
            <CardTitle>{t.title}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Stack gap="sm">
          {state === "installed" && (
            <Alert tone="success" title={t.installed}>
              {t.installedHint}
            </Alert>
          )}
          {state === "available" && (
            <div>
              <Button leftIcon={<MonitorDown className="h-4 w-4" />} onClick={() => void run()}>
                {t.install}
              </Button>
            </div>
          )}
          {(state === "manual" || state === "unsupported") && <Alert tone={state === "unsupported" ? "warning" : "info"}>{manualHint(browser, t)}</Alert>}
        </Stack>
      </CardContent>
    </Card>
  );
}

/** Mục trong menu người dùng: cài ngay nếu trình duyệt cho phép, không thì mở thẻ hướng dẫn. Ẩn khi đã cài. */
export function InstallAppMenuItem() {
  const router = useRouter();
  const { state, t, run } = useInstallAction();
  if (state === "installed" || state === "unsupported") return null;
  return (
    <DropdownMenuItem
      icon={<MonitorDown className="h-4 w-4" />}
      onSelect={() => (state === "available" ? void run() : router.push("/settings?tab=preferences#install-app"))}
    >
      {t.menuItem}
    </DropdownMenuItem>
  );
}
