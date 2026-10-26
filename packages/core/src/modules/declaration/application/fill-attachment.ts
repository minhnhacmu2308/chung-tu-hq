// Điền cặp phân loại đính kèm (TK_EA, bảng ATTACH_KIND) + số đính kèm (TK_EB) của 1.63 IDA / 2.53 EDA bằng số tiếp nhận HYS – hệ thống gọi từ worker, không kiểm vai trò.
// Khác updateDeclarationField: cho cả DRAFT lẫn APPROVED và KHÔNG đổi status/approvedAt/version (đính kèm HYS không làm mất bản duyệt).
import { extraFieldMeta, fillAttachmentSlot, type AttachmentValues } from "@kb/contracts";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { DeclarationDeps, StoredField } from "./ports.js";

/** `replaceSlot`: cặp người khai chọn thay khi 1.63/2.53 đã đủ 3 cặp có số (chỉ dùng khi không còn cặp trống). */
export type FillAttachmentInput = { attachKind: string; receiptNo: string; note: string; replaceSlot?: 1 | 2 | 3 };
export type FillAttachmentResult = {
  outcome: "FILLED" | "ALREADY" | "FULL" | "REPLACED" | "LOCKED";
  slot?: 1 | 2 | 3;
  /** REPLACED: cặp cũ bị thay. */
  replaced?: { code: string; receipt: string };
  afterApproval: boolean;
};

export async function fillAttachmentFromHys(
  deps: DeclarationDeps,
  ctx: { orgId: OrgId; userId: UserId },
  dossierId: string,
  input: FillAttachmentInput,
): Promise<Result<FillAttachmentResult>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const now = deps.clock.now();
  const done = await deps.uow.asOrg(ctx, async (r) => {
    const decl = await r.declarations.latest(ctx.orgId, dossierId);
    if (!decl) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
    if (decl.status !== "DRAFT" && decl.status !== "APPROVED") return ok({ outcome: "LOCKED" as const, afterApproval: false, changes: [] as { key: string; oldValue: string; newValue: string }[] });
    const values: AttachmentValues = {};
    for (const n of [1, 2, 3] as const) {
      values[`TK_EA${n}`] = decl.fields[`TK_EA${n}`]?.value ?? "";
      values[`TK_EB${n}`] = decl.fields[`TK_EB${n}`]?.value ?? "";
    }
    const fill = fillAttachmentSlot(values, input.attachKind, input.receiptNo, input.replaceSlot);
    const afterApproval = decl.status === "APPROVED";
    if ((fill.outcome !== "FILLED" && fill.outcome !== "REPLACED") || !fill.set) return ok({ outcome: fill.outcome, ...(fill.slot ? { slot: fill.slot } : {}), afterApproval, changes: [] });
    const fields = { ...decl.fields };
    const changes: { key: string; oldValue: string; newValue: string }[] = [];
    for (const [code, value] of Object.entries(fill.set)) {
      const meta = extraFieldMeta(decl.kind, code);
      if (!meta) return err(domainError("NOT_FOUND", `Không có chỉ tiêu ${code} trên tờ khai`));
      const old = fields[code];
      const next: StoredField = { no: old?.no ?? meta.no ?? "", label: old?.label ?? meta.label, section: old?.section ?? meta.section, value, source: "SYSTEM", note: input.note };
      fields[code] = next;
      changes.push({ key: `decl:${code}`, oldValue: old?.value ?? "", newValue: value });
    }
    await r.declarations.update(decl.orgId, decl.id, { fields, updatedAt: now });
    return ok({ outcome: fill.outcome, slot: fill.slot!, ...(fill.replaced ? { replaced: fill.replaced } : {}), afterApproval, changes });
  });
  if (!done.ok) return done;
  const { changes, ...result } = done.value;
  for (const c of changes) await deps.audit.append(ctx, { dossierId, ...c, source: "HYS_FILL" });
  return ok(result);
}
