// Quy tắc trạng thái hiển thị và hạn dùng của số định danh: code thuần, không đụng DB.
import type { IdentifierDisplayStatus, IdentifierStatus } from "@kb/contracts";

/** Ngày hiện tại theo giờ Việt Nam (YYYY-MM-DD); hạn dùng tính theo ngày VN, không theo UTC. */
export const vnToday = (now: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);

/** Số định danh dùng được đến hết ngày 31/12 của năm cấp. */
export const identifierExpiresOn = (identifiedOn: string | null): string | null =>
  identifiedOn ? `${identifiedOn.slice(0, 4)}-12-31` : null;

export const identifierDisplayStatus = (
  row: { status: IdentifierStatus; identifierNo: string | null; usedAt: string | null; identifiedOn: string | null },
  today: string,
): IdentifierDisplayStatus => {
  if (row.status !== "ACCEPTED") return row.status;
  if (row.usedAt) return "USED";
  const expiresOn = identifierExpiresOn(row.identifiedOn);
  // So sánh chuỗi YYYY-MM-DD đúng thứ tự thời gian.
  return expiresOn && today > expiresOn ? "EXPIRED" : "AVAILABLE";
};

/** Sắp hết hạn: còn ≤ 30 ngày tới hết hạn (chưa kiểm đã dùng/đã hết – nơi gọi lọc theo displayStatus). */
export const isExpiringSoon = (expiresOn: string | null, today: string): boolean => {
  if (!expiresOn) return false;
  const days = (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days >= 0 && days <= 30;
};

/** Chỉ xóa được bản ghi lỗi/không phản hồi mà chưa có số; đang gửi hoặc đã có số thì không. */
export const canDeleteIdentifier = (row: { status: IdentifierStatus; identifierNo: string | null }): boolean =>
  (row.status === "REJECTED" || row.status === "NO_RESPONSE") && !row.identifierNo;
