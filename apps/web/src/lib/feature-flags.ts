/**
 * Bước 5 Review dùng form Phụ lục II cũ (tab "Tờ khai đầy đủ" + "Hải quan trả về") thay cho tờ khai dạng bản in.
 * Chỉ để dự phòng trong giai đoạn thử nghiệm bản in; mặc định tắt. Xóa cờ và form cũ sau thử nghiệm (docs/BACKEND-TODO.md).
 */
export function legacyReviewForm(): boolean {
  return process.env.NEXT_PUBLIC_REVIEW_LEGACY_FORM === "1";
}
