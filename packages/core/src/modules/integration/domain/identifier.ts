// Khai báo định danh hàng hóa (KHAI BAO LAY MA DINH DANH v1.1) – luật thuần.

/**
 * Trạng thái tiếp nhận (TRANG_THAI) → kết quả: 15 "Hải quan đã duyệt (có mã định danh)" kèm số định danh → ACCEPTED; 10 "Từ chối" → REJECTED;
 * 0 nhập mới / 11 chưa có phản hồi / 12 đã tiếp nhận (chưa có mã) / 15 mà chưa có số → PENDING (hỏi tiếp).
 */
export function identifierState(customsState: string | null | undefined, identifierNo: string | null | undefined): "PENDING" | "ACCEPTED" | "REJECTED" {
  const code = (customsState ?? "").trim();
  if (code === "10") return "REJECTED";
  if (code === "15" && (identifierNo ?? "").trim()) return "ACCEPTED";
  return "PENDING";
}
