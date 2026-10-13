import { Badge, StatusBadge } from "@kb/ui";
import { daysUntil, formatDue } from "@/lib/format";
import type { Dossier, DossierStatus } from "@/mocks/types";
import { CHANNEL_STATUS, DOSSIER_STATUS } from "./dossier-display";

export function DossierStatusBadge({ status }: { status: DossierStatus }) {
  return <StatusBadge status={DOSSIER_STATUS[status]} />;
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
