import { dossierProgressOf, type ProgressCode } from "@kb/contracts";
import { fill, StatusBadge, statusLabel, useMessages, useUiLocale, type Status, type UiLocale } from "@kb/ui";
import { AlertTriangle } from "lucide-react";
import type { CustomsChannel, Dossier } from "@/mocks/types";
import { DOSSIER_PROGRESS_MESSAGES } from "./dossier-progress.messages";

/** Tiến độ → mã StatusBadge của @kb/ui (nguồn duy nhất của nhãn + màu). */
export const PROGRESS_STATUS: Record<ProgressCode, Status> = {
  NOT_DECLARED: "DOSSIER_PROGRESS_NOT_DECLARED", PRE_DECLARED: "DOSSIER_PROGRESS_PRE_DECLARED", DECLARED: "DOSSIER_PROGRESS_DECLARED",
  AMEND_RECALLED: "DOSSIER_PROGRESS_AMEND_RECALLED", AMEND_PRE_DECLARED: "DOSSIER_PROGRESS_AMEND_PRE_DECLARED", AMENDED: "DOSSIER_PROGRESS_AMENDED",
  CLEARED: "DOSSIER_CLEARED", POST_AMENDED: "DOSSIER_PROGRESS_POST_AMENDED", CANCELLED: "DOSSIER_PROGRESS_CANCELLED", REJECTED: "DOSSIER_PROGRESS_REJECTED", DOSSIER_CANCELLED: "DOSSIER_CANCELLED",
};
const CHANNEL_STATUS: Record<CustomsChannel, Status> = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" };
/** Không hiện "k/N" khi hồ sơ đã hủy/từ chối (không còn tờ nào đang đi). */
const NO_COUNT: ReadonlySet<ProgressCode> = new Set(["CANCELLED", "REJECTED", "DOSSIER_CANCELLED"]);

/** Nhãn tiến độ theo ngôn ngữ (bộ lọc, tab…). */
export const progressLabel = (p: ProgressCode, locale: UiLocale) => statusLabel(PROGRESS_STATUS[p], locale);
export const channelLabel = (c: CustomsChannel, locale: UiLocale) => statusLabel(CHANNEL_STATUS[c], locale);

/** Tiến độ của hồ sơ từ trạng thái hồ sơ + các tờ khai nhánh (`customs.sheets`; chưa truyền → rỗng). */
export function progressOfDossier(d: Pick<Dossier, "status" | "customs">) {
  return dossierProgressOf(d.status, d.customs?.sheets ?? []);
}

/** Theo tiến độ hồ sơ: đã thông quan → tô xong cả quy trình; hồ sơ hủy / mọi tờ khai bị hủy hoặc từ chối → thanh xám (dừng).
 * Dùng chung: StepProgress ở danh sách, Stepper ở trang chi tiết (chỉ active/stopped). */
export function stepState(d: Pick<Dossier, "status" | "customs">): "complete" | "stopped" | "active" {
  const p = progressOfDossier(d).progress;
  if (p === "CLEARED" || p === "POST_AMENDED") return "complete";
  if (p === "CANCELLED" || p === "REJECTED" || p === "DOSSIER_CANCELLED") return "stopped";
  return "active";
}

/** Nhãn tiến độ (+ "· mức xa nhất k/N" khi lô lệch mức) + nhãn luồng + dòng phụ + cờ lỗi. Hẹp: các phần xuống dòng trong cùng ô. */
export function DossierProgressBadge({ dossier }: { dossier: Pick<Dossier, "status" | "customs"> }) {
  const t = useMessages(DOSSIER_PROGRESS_MESSAGES);
  const locale = useUiLocale();
  const p = progressOfDossier(dossier);
  const ahead = p.ahead && !NO_COUNT.has(p.progress) ? ` · ${progressLabel(p.ahead, locale)} ${fill("{done}/{of}", { done: p.done, of: p.of })}` : "";
  const flags = p.flags.filter((f) => f !== p.sub && f !== p.progress);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex flex-wrap items-center gap-1">
        <StatusBadge status={PROGRESS_STATUS[p.progress]} label={`${progressLabel(p.progress, locale)}${ahead}`} className="whitespace-normal text-start" />
        {p.channel && <StatusBadge status={CHANNEL_STATUS[p.channel]} />}
      </span>
      {p.sub && <span className="text-xs text-fg-muted">{t[p.sub]}</span>}
      {flags.map((f) => (
        <StatusBadge key={f} status={f === "REJECTED" ? "DOSSIER_PROGRESS_REJECTED" : "DOSSIER_PROGRESS_SEND_FAILED"} label={f === "REJECTED" ? t.flagRejected : t.flagSendFailed} icon={<AlertTriangle />} />
      ))}
    </span>
  );
}
