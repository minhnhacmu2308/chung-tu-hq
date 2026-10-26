import { awaitingContent, type CustomsStage, type DeclarationStatus } from "@kb/contracts";

/**
 * "Lô còn sửa được": tờ khai hiện hành DRAFT/APPROVED, không có outbox nội dung đang chờ và mọi tờ của lô chưa có kết quả truyền
 * hoặc đang chờ gửi lại nội dung (NOT_SENT / RECALLED / AMEND_RECALLED). Chưa gửi tờ nào (mảng rỗng) = còn sửa được.
 * Gọi về một phần khóa thông tin chung (1.63/2.53) nên không còn sửa được.
 */
export function isLotEditable(i: { declarationStatus: DeclarationStatus | null; stages: CustomsStage[]; contentPending: boolean }): boolean {
  if (i.declarationStatus !== "DRAFT" && i.declarationStatus !== "APPROVED") return false;
  return !i.contentPending && i.stages.every(awaitingContent);
}
