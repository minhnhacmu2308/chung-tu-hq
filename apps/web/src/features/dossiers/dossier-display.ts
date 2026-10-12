// Cách hiển thị các mã của hồ sơ (dùng chung cho Tổng quan, danh sách, chi tiết).
import type { Tone } from "@kb/ui";
import type { CustomsChannel, Direction, Dossier, DossierStatus } from "@/mocks/types";

export const DOSSIER_STATUS_DISPLAY: Record<DossierStatus, { tone: Tone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Nháp" },
  PROCESSING: { tone: "info", label: "Đang xử lý" },
  NEEDS_REVIEW: { tone: "warning", label: "Cần kiểm tra" },
  APPROVED: { tone: "primary", label: "Đã duyệt, chờ truyền" },
  SUBMITTED: { tone: "info", label: "Đã truyền HQ" },
  CLEARED: { tone: "success", label: "Đã thông quan" },
  CANCELLED: { tone: "neutral", label: "Đã hủy" },
};

export const DIRECTION_LABELS: Record<Direction, string> = { NK: "Nhập khẩu", XK: "Xuất khẩu" };

export const TRANSPORT_LABELS: Record<Dossier["transportMode"], string> = { SEA: "Đường biển", AIR: "Hàng không", ROAD: "Đường bộ" };

/** Ánh xạ sang StatusBadge của @kb/ui. */
export const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const satisfies Record<CustomsChannel, string>;

export const isOpen = (d: Dossier) => d.status !== "CLEARED" && d.status !== "CANCELLED";
