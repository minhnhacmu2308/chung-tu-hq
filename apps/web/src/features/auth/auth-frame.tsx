"use client";
import { AiBackdrop, AiScanCard, BrandMark, RobotAvatar, useMessages, type RobotAvatarState } from "@kb/ui";
import { FileCheck2, ScanText, Send } from "lucide-react";
import type { ReactNode } from "react";
import { APP_TITLES } from "@/app/app-titles.messages";
import { LanguageSelect } from "@/features/appearance/language-switcher";
import { usePageTitle } from "@/features/shell/use-page-title";
import { AUTH_FRAME_MESSAGES } from "./auth.messages";

const BRAND = APP_TITLES.vi.brand;

/**
 * Khung trang đăng nhập/đăng ký, phủ kín màn hình: panel thương hiệu bên trái (ẩn trên mobile) + form canh giữa bên phải.
 * `robot` = trạng thái linh vật trợ lý, phản ứng theo thao tác trên form (đang gõ, đang gửi, lỗi…).
 */
export function AuthFrame({ children, robot = "idle" }: { children: ReactNode; robot?: RobotAvatarState }) {
  const t = useMessages(AUTH_FRAME_MESSAGES);
  usePageTitle();
  const points = [
    { icon: <ScanText className="h-4 w-4" />, text: t.pointRead },
    { icon: <FileCheck2 className="h-4 w-4" />, text: t.pointCheck },
    { icon: <Send className="h-4 w-4" />, text: t.pointSubmit },
  ];
  // Minh họa "AI vừa đọc được" – dữ liệu mẫu, chỉ để trang trí.
  const scanFields = [
    { label: t.scanInvoiceNo, value: "HP-2610-078" },
    { label: t.scanValue, value: "20.850,00 USD" },
    { label: t.scanTerms, value: "FCA" },
    { label: t.scanHs, value: "8482.10.00" },
  ];
  return (
    <div className="grid min-h-dvh motion-safe:animate-fade-in cq-md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-primary p-10 text-primary-fg cq-md:block cq-lg:p-16">
        <AiBackdrop />
        <div className="stagger-children relative mx-auto flex h-full max-w-xl flex-col justify-between gap-8">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-fg text-primary">
              <BrandMark decorative className="h-7 w-7" />
            </span>
            {BRAND}
          </div>
          <AiScanCard title="COMMERCIAL INVOICE" fields={scanFields} className="origin-left cq-lg:scale-125 cq-xl:scale-150" />
          <div className="flex flex-col gap-5">
            <p className="text-2xl font-semibold leading-snug cq-lg:text-3xl">{t.headline}</p>
            <ul className="stagger-children flex flex-col gap-3 text-sm cq-lg:text-base">
              {points.map((p) => (
                <li key={p.text} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-hover" aria-hidden="true">
                    {p.icon}
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs opacity-80">{t.isolation}</p>
        </div>
      </div>
      {/* Form giữ bề rộng dễ đọc và canh giữa theo chiều dọc dù màn hình rộng tới đâu. */}
      <div className="flex items-center justify-center p-6 cq-sm:p-10">
      <div className="stagger-children flex w-full max-w-lg flex-col gap-6">
        {/* Hàng đầu: logo (chỉ mobile – desktop đã có ở panel trái) + linh vật. -mb kéo tiêu đề form lên sát hơn. */}
        <div className="-mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-base font-semibold text-fg cq-md:invisible">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-fg">
              <BrandMark small decorative className="h-6 w-6" />
            </span>
            {BRAND}
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelect className="w-36" />
            <RobotAvatar state={robot} size={56} />
          </div>
        </div>
        {children}
      </div>
      </div>
    </div>
  );
}
