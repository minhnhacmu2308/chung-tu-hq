// Nhãn trạng thái hồ sơ / hạn khai – dùng chung cho danh sách và chi tiết hồ sơ.
import { Badge, StatusBadge, type Tone } from "@kb/ui";
import type { CustomsChannel } from "@/mocks/types";
import { daysUntil, formatDue } from "@/lib/format";

// Trạng thái hồ sơ: một nguồn duy nhất ở features/dossiers (ánh xạ sang StatusBadge của @kb/ui).
export { DossierStatusBadge } from "@/features/dossiers/dossier-badges";

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
