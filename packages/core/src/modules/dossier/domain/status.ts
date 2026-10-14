import { STEP_ORDER, type DossierStatus, type StepId } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

export const isLocked = (s: DossierStatus) => s === "SUBMITTED" || s === "CLEARED";

/** Lùi bước luôn được; tiến tới submit chỉ khi tờ khai đã duyệt (status APPROVED); hồ sơ khóa không đổi. */
export function canChangeStep(d: { status: DossierStatus; step: StepId }, next: StepId): Result<void> {
  if (isLocked(d.status)) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã truyền, không thay đổi được"));
  if (d.status === "CANCELLED") return err(domainError("INVALID_STATE", "Hồ sơ đã hủy"));
  if (STEP_ORDER.indexOf(next) <= STEP_ORDER.indexOf(d.step)) return ok(undefined);
  if (next === "submit" && d.status !== "APPROVED") return err(domainError("INVALID_STATE", "Tờ khai chưa được phê duyệt"));
  return ok(undefined);
}

export function canCancel(s: DossierStatus): Result<void> {
  if (isLocked(s)) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã truyền, không hủy được"));
  return ok(undefined);
}

export function canModify(s: DossierStatus): Result<void> {
  if (isLocked(s)) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã truyền, không sửa được"));
  if (s === "CANCELLED") return err(domainError("INVALID_STATE", "Hồ sơ đã hủy"));
  return ok(undefined);
}
