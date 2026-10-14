// Điều kiện chuyển bước/duyệt/truyền (bất biến 7: không truyền khi còn BLOCKER FAIL hoặc HS chưa xác nhận). Thuần.
import type { DeclarationStatus, Role } from "@kb/contracts";
import { dec } from "../../../shared/decimal.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

type ItemHs = { hsConfirmed: string | null };
const unconfirmed = (items: ItemHs[]) => items.filter((i) => !i.hsConfirmed).length;

export function canMoveToReview(items: ItemHs[], hasDeclaration: boolean): Result<void> {
  const n = unconfirmed(items);
  if (n > 0) return err(domainError("HS_UNCONFIRMED", `Còn ${n} mã HS chưa xác nhận`));
  if (!hasDeclaration) return err(domainError("NO_DECLARATION", "Chưa dựng tờ khai – chạy agent với lựa chọn có “Tạo tờ khai”"));
  return ok(undefined);
}

export function canApprove(p: { role: Role; userId: string; ownerId: string; fourEyes: boolean; blockerFails: number; items: ItemHs[]; status: DeclarationStatus; exchangeRate?: string }): Result<void> {
  if (p.role !== "APPROVER" && p.role !== "OWNER") return err(domainError("FORBIDDEN", "Chỉ Người duyệt hoặc Chủ sở hữu được phê duyệt tờ khai"));
  if (p.status !== "DRAFT") return err(domainError("INVALID_STATE", p.status === "NOT_CREATED" ? "Chưa có tờ khai" : "Tờ khai đã được duyệt"));
  if (p.blockerFails > 0) return err(domainError("BLOCKER_FAILED", `Còn ${p.blockerFails} luật lỗi chặn truyền – xử lý ở bước OCR & kiểm tra`));
  const n = unconfirmed(p.items);
  if (n > 0) return err(domainError("HS_UNCONFIRMED", `Còn ${n} mã HS chưa xác nhận`));
  if (p.exchangeRate !== undefined && dec(p.exchangeRate).isZero()) return err(domainError("INVALID_STATE", "Chưa có tỷ giá tính thuế – nhập tỷ giá rồi chạy lại agent"));
  // Nguyên tắc 4 mắt (cấu hình org): người duyệt khác người tạo hồ sơ; Chủ sở hữu được miễn.
  if (p.fourEyes && p.role !== "OWNER" && p.userId === p.ownerId) return err(domainError("FORBIDDEN", "Người duyệt phải khác người tạo hồ sơ (nguyên tắc 4 mắt)"));
  return ok(undefined);
}

export function canSubmit(p: { status: DeclarationStatus; blockerFails: number }): Result<void> {
  if (p.status === "SUBMITTED") return err(domainError("ALREADY_SUBMITTED", "Tờ khai đã truyền"));
  if (p.status !== "APPROVED") return err(domainError("NOT_APPROVED", "Tờ khai chưa được phê duyệt"));
  if (p.blockerFails > 0) return err(domainError("BLOCKER_FAILED", `Còn ${p.blockerFails} luật lỗi chặn truyền`));
  return ok(undefined);
}
