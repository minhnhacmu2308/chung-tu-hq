// Cách hiển thị các mã của hồ sơ (dùng chung cho Tổng quan, danh sách, chi tiết).
import { PARTY_CLASS_LABELS, PartyClassSchema, TRANSPORT_MODE_INFO, TransportModeSchema, type TransportMode } from "@kb/contracts";
import { STATUS_META, statusLabel, type Status, type Tone, type UiLocale } from "@kb/ui";
import type { CustomsChannel, Dossier, DossierStatus } from "@/mocks/types";
import { DIRECTION_LABELS, TRANSPORT_MODE_LABELS_INTL } from "./dossiers.messages";

/** Trạng thái hồ sơ → mã StatusBadge của @kb/ui (nguồn duy nhất của nhãn + màu). */
export const DOSSIER_STATUS: Record<DossierStatus, Status> = {
  DRAFT: "DOSSIER_DRAFT",
  PROCESSING: "DOSSIER_PROCESSING",
  NEEDS_REVIEW: "DOSSIER_NEEDS_REVIEW",
  APPROVED: "DOSSIER_APPROVED",
  SUBMITTED: "DOSSIER_SUBMITTED",
  CLEARED: "DOSSIER_CLEARED",
  CANCELLED: "DOSSIER_CANCELLED",
};

/** Màu + nhãn (theo ngôn ngữ) lấy từ StatusBadge của @kb/ui – dùng cho bộ lọc, tìm kiếm, xuất Excel. */
export function dossierStatusDisplay(locale: UiLocale = "vi"): Record<DossierStatus, { tone: Tone; label: string }> {
  return Object.fromEntries(
    (Object.keys(DOSSIER_STATUS) as DossierStatus[]).map((s) => [s, { tone: STATUS_META[DOSSIER_STATUS[s]].tone, label: statusLabel(DOSSIER_STATUS[s], locale) }]),
  ) as Record<DossierStatus, { tone: Tone; label: string }>;
}

/** Bộ nhãn 3 ngôn ngữ: `useMessages(DIRECTION_LABELS)[d.direction]`. */
export { DIRECTION_LABELS };

/** Nhãn phương thức vận chuyển theo ngôn ngữ; "vi" = nhãn VNACCS trong @kb/contracts. */
export function transportLabels(locale: UiLocale = "vi"): Record<TransportMode, string> {
  if (locale !== "vi") return TRANSPORT_MODE_LABELS_INTL[locale];
  return Object.fromEntries(TransportModeSchema.options.map((m) => [m, TRANSPORT_MODE_INFO[m].label])) as Record<TransportMode, string>;
}

/** Bản tiếng Việt – giữ cho nơi gọi chưa truyền ngôn ngữ (steps/create-step). Nơi mới dùng transportLabels(locale). */
export const TRANSPORT_LABELS = transportLabels("vi");

/** Lựa chọn phân loại cá nhân/tổ chức: "1 – Cá nhân gửi cá nhân"… theo đúng mã VNACCS. */
export const PARTY_CLASS_OPTIONS = PartyClassSchema.options.map((c) => ({ value: c, label: `${c} – ${PARTY_CLASS_LABELS[c]}` }));

/** Lựa chọn cho ô chọn phương thức vận chuyển: "1 – Đường hàng không"… theo đúng mã VNACCS. */
export function transportOptions(locale: UiLocale = "vi") {
  const labels = transportLabels(locale);
  return TransportModeSchema.options.map((m) => ({ value: m, label: `${TRANSPORT_MODE_INFO[m].code} – ${labels[m]}` }));
}

/** Ánh xạ sang StatusBadge của @kb/ui. */
export const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const satisfies Record<CustomsChannel, string>;

export const isOpen = (d: Dossier) => d.status !== "CLEARED" && d.status !== "CANCELLED";
