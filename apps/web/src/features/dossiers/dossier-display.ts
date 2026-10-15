// Cách hiển thị các mã của hồ sơ (dùng chung cho Tổng quan, danh sách, chi tiết).
import { PARTY_CLASS_LABELS, PartyClassSchema, TRANSPORT_MODE_INFO, TransportModeSchema, type TransportMode } from "@kb/contracts";
import { STATUS_META, type Status, type Tone } from "@kb/ui";
import type { CustomsChannel, Direction, Dossier, DossierStatus } from "@/mocks/types";

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

/** Nhãn + màu lấy từ StatusBadge – dùng cho bộ lọc, xuất Excel (không khai báo lại ở đây). */
export const DOSSIER_STATUS_DISPLAY = Object.fromEntries(
  (Object.keys(DOSSIER_STATUS) as DossierStatus[]).map((s) => [s, STATUS_META[DOSSIER_STATUS[s]]]),
) as Record<DossierStatus, { tone: Tone; label: string }>;

export const DIRECTION_LABELS: Record<Direction, string> = { NK: "Nhập khẩu", XK: "Xuất khẩu" };

export const TRANSPORT_LABELS = Object.fromEntries(
  TransportModeSchema.options.map((m) => [m, TRANSPORT_MODE_INFO[m].label]),
) as Record<TransportMode, string>;

/** Lựa chọn phân loại cá nhân/tổ chức: "1 – Cá nhân gửi cá nhân"… theo đúng mã VNACCS. */
export const PARTY_CLASS_OPTIONS = PartyClassSchema.options.map((c) => ({ value: c, label: `${c} – ${PARTY_CLASS_LABELS[c]}` }));

/** Lựa chọn cho ô chọn phương thức vận chuyển: "1 – Đường hàng không"… theo đúng mã VNACCS. */
export const TRANSPORT_OPTIONS = TransportModeSchema.options.map((m) => ({ value: m, label: `${TRANSPORT_MODE_INFO[m].code} – ${TRANSPORT_MODE_INFO[m].label}` }));

/** Ánh xạ sang StatusBadge của @kb/ui. */
export const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const satisfies Record<CustomsChannel, string>;

export const isOpen = (d: Dossier) => d.status !== "CLEARED" && d.status !== "CANCELLED";
