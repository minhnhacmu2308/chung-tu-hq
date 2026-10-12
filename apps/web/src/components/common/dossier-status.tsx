// Nhãn trạng thái hồ sơ / hạn khai – dùng chung cho danh sách và chi tiết hồ sơ.
import { Badge, StatusBadge, type Tone } from "@kb/ui";
import type { CustomsChannel, DossierStatus } from "@/mocks/types";
import { daysUntil, formatDue } from "@/lib/format";

export const DOSSIER_STATUS_META: Record<DossierStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Nháp", tone: "neutral" },
  PROCESSING: { label: "Đang xử lý", tone: "info" },
  NEEDS_REVIEW: { label: "Cần kiểm tra", tone: "warning" },
  APPROVED: { label: "Đã duyệt", tone: "primary" },
  SUBMITTED: { label: "Đã truyền HQ", tone: "info" },
  CLEARED: { label: "Đã thông quan", tone: "success" },
  CANCELLED: { label: "Đã hủy", tone: "neutral" },
};

export function DossierStatusBadge({ status }: { status: DossierStatus }) {
  const m = DOSSIER_STATUS_META[status];
  return (
    <Badge tone={m.tone}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {m.label}
    </Badge>
  );
}

/** Hạn khai: đỏ khi quá hạn, vàng khi còn ≤ 1 ngày. Hồ sơ đã xong thì không cần nhấn mạnh. */
export function DueBadge({ dueDate, done = false }: { dueDate: string; done?: boolean }) {
  const n = daysUntil(dueDate);
  const tone: Tone = done ? "neutral" : n < 0 ? "danger" : n <= 1 ? "warning" : "neutral";
  return (
    <Badge tone={tone} variant={tone === "neutral" ? "outline" : "subtle"}>
      {formatDue(dueDate)}
    </Badge>
  );
}

export function ChannelBadge({ channel }: { channel: CustomsChannel }) {
  return <StatusBadge status={`${channel}_CHANNEL`} />;
}
