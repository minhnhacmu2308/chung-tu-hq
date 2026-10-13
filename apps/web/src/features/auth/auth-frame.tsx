import { AiBackdrop, AiScanCard, BrandMark, Card, RobotAvatar, type RobotAvatarState } from "@kb/ui";
import { FileCheck2, ScanText, Send } from "lucide-react";
import type { ReactNode } from "react";

const POINTS = [
  { icon: <ScanText className="h-4 w-4" />, text: "AI đọc cả bộ chứng từ, ra một bộ dữ liệu chuẩn" },
  { icon: <FileCheck2 className="h-4 w-4" />, text: "Đối chiếu chéo Invoice, Packing List, B/L, C/O" },
  { icon: <Send className="h-4 w-4" />, text: "Dựng tờ khai và truyền Hải quan qua Customs Hub" },
];

// Minh họa "AI vừa đọc được" – dữ liệu mẫu, chỉ để trang trí.
const SCAN_FIELDS = [
  { label: "Số invoice", value: "HP-2610-078" },
  { label: "Trị giá", value: "20.850,00 USD" },
  { label: "Điều kiện", value: "FCA" },
  { label: "Mã HS", value: "8482.10.00" },
];

/**
 * Khung trang đăng nhập/đăng ký: panel thương hiệu bên trái (ẩn trên mobile) + form.
 * `robot` = trạng thái linh vật trợ lý, phản ứng theo thao tác trên form (đang gõ, đang gửi, lỗi…).
 */
export function AuthFrame({ children, robot = "idle" }: { children: ReactNode; robot?: RobotAvatarState }) {
  return (
    <Card className="grid w-full max-w-5xl overflow-hidden p-0 motion-safe:animate-pop-in md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-primary p-10 text-primary-fg md:block">
        <AiBackdrop />
        <div className="stagger-children relative flex h-full flex-col justify-between gap-8">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-fg text-primary">
              <BrandMark decorative className="h-7 w-7" />
            </span>
            KhaiBáo AI
          </div>
          <AiScanCard title="COMMERCIAL INVOICE" fields={SCAN_FIELDS} />
          <div className="flex flex-col gap-5">
            <p className="text-2xl font-semibold leading-snug">Từ bộ chứng từ đến tờ khai hải quan trong một luồng.</p>
            <ul className="stagger-children flex flex-col gap-3 text-sm">
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
      </div>
      <div className="stagger-children flex flex-col gap-6 p-6 sm:p-10">
        {/* Hàng đầu: logo (chỉ mobile – desktop đã có ở panel trái) + linh vật. -mb kéo tiêu đề form lên sát hơn. */}
        <div className="-mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-base font-semibold text-fg md:invisible">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-fg">
              <BrandMark small decorative className="h-6 w-6" />
            </span>
            KhaiBáo AI
          </div>
          <RobotAvatar state={robot} size={56} />
        </div>
        {children}
      </div>
    </Card>
  );
}
