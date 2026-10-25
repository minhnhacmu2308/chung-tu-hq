import { Badge, fill, StatusBadge, useMessages } from "@kb/ui";
import { AlertTriangle } from "lucide-react";
import { daysUntil, formatDue } from "@/lib/format";
import type { CustomsSummary, Dossier, DossierStatus } from "@/mocks/types";
import { CHANNEL_STATUS, DOSSIER_STATUS } from "./dossier-display";
import { DOSSIER_CUSTOMS_MESSAGES } from "./dossiers.messages";

/**
 * Trạng thái hồ sơ. Lô nhiều tờ khai (`customs.of > 1`): một số tờ đã thông quan → "Thông quan k/N" (hồ sơ vẫn SUBMITTED, spec §6.5);
 * tờ bị từ chối / lỗi gửi → cảnh báo bằng chữ "Tờ k: …" cạnh nhãn. Lô 1 tờ giữ nhãn cũ.
 */
export function DossierStatusBadge({ status, customs }: { status: DossierStatus; customs?: CustomsSummary | undefined }) {
  const t = useMessages(DOSSIER_CUSTOMS_MESSAGES);
  const multi = customs !== undefined && customs.of > 1 && status !== "CANCELLED";
  const partial = multi && status !== "CLEARED" && customs.cleared > 0 && customs.cleared < customs.of;
  const badge = <StatusBadge status={DOSSIER_STATUS[status]} {...(partial ? { label: fill(t.clearedPartial, { cleared: customs.cleared, of: customs.of }) } : {})} />;
  if (!multi || !customs.problems.length) return badge;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {badge}
      {customs.problems.map((p) => (
        <Badge key={p.no} tone="danger" size="sm" icon={<AlertTriangle />}>
          {fill(t[p.kind], { no: p.no })}
        </Badge>
      ))}
    </span>
  );
}

/** Hạn khai: đỏ khi quá hạn, vàng khi còn ≤ 1 ngày. Hồ sơ đã truyền/xong không cảnh báo. */
export function DueBadge({ dossier }: { dossier: Pick<Dossier, "dueDate" | "status"> }) {
  if (dossier.status === "CLEARED" || dossier.status === "CANCELLED" || dossier.status === "SUBMITTED") {
    return <span className="text-fg-subtle">—</span>;
  }
  const n = daysUntil(dossier.dueDate);
  const tone = n < 0 ? "danger" : n <= 1 ? "warning" : "neutral";
  return <Badge tone={tone}>{formatDue(dossier.dueDate)}</Badge>;
}

export function ChannelBadge({ channel }: { channel: Dossier["channel"] }) {
  if (!channel) return <span className="text-fg-subtle">—</span>;
  return <StatusBadge status={CHANNEL_STATUS[channel]} />;
}
