import { Card } from "@kb/ui";
import { FileCheck2, ScanText, Send, Wrench } from "lucide-react";
import type { ReactNode } from "react";

const POINTS = [
  { icon: <ScanText className="h-4 w-4" />, text: "AI đọc cả bộ chứng từ, ra một bộ dữ liệu chuẩn" },
  { icon: <FileCheck2 className="h-4 w-4" />, text: "Đối chiếu chéo Invoice, Packing List, B/L, C/O" },
  { icon: <Send className="h-4 w-4" />, text: "Dựng tờ khai và truyền Hải quan qua Customs Hub" },
];

/** Khung trang đăng nhập/đăng ký: panel thương hiệu bên trái (ẩn trên mobile) + form. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <Card className="grid w-full max-w-5xl overflow-hidden p-0 md:grid-cols-2">
      <div className="hidden flex-col justify-between gap-10 bg-primary p-10 text-primary-fg md:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-fg text-primary">
            <Wrench className="h-5 w-5" aria-hidden="true" />
          </span>
          KhaiBáo AI
        </div>
        <div className="flex flex-col gap-6">
          <p className="text-2xl font-semibold leading-snug">Từ bộ chứng từ đến tờ khai hải quan trong một luồng.</p>
          <ul className="flex flex-col gap-3 text-sm">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-hover" aria-hidden="true">
                  {p.icon}
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-80">Dữ liệu mỗi doanh nghiệp được tách riêng theo MST.</p>
      </div>
      <div className="flex flex-col gap-6 p-6 sm:p-10">
        <div className="flex items-center gap-2 text-base font-semibold text-fg md:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-fg">
            <Wrench className="h-4 w-4" aria-hidden="true" />
          </span>
          KhaiBáo AI
        </div>
        {children}
      </div>
    </Card>
  );
}
