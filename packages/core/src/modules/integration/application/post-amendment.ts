// Bản khai bổ sung sau thông quan (AMA) – bản riêng tham chiếu tờ khai gốc (tờ khai gốc giữ nguyên, khóa):
// lập khi bắt đầu sửa sau thông quan, xem, sửa ô (ghi field_audit), chọn dòng của tờ khai gốc, phê duyệt (người duyệt, 4 mắt).
// Gửi AMA/AMB/AMC: performOperation; phản hồi đổi trạng thái: process-outbox → applyPostAmendmentResult.
import {
  amaFieldIssue, amaHeaderFrom, amaHeaderLocked, amaLineFrom, amaLineLocked, applyAmaLineEdit, declarationFormValues, isAmaHeaderKey, isAmaLineKey,
  postAmendmentEditable, type CustomsOperation, type PostAmendment, type PostAmendmentView, type ProcessingContract, type UpdatePostAmendmentField,
} from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { amaSource, amaSourceLines, amendmentDeltaVnd } from "../domain/post-amendment.js";
import { stageOf } from "../domain/state-machine.js";
import type { CustomsDeps, CustomsRepos, PostAmendmentRow, ResultRow } from "./customs-ports.js";

export const toPostAmendment = (r: PostAmendmentRow): PostAmendment => {
  const { orgId: _o, approvedAt, createdAt, updatedAt, ...rest } = r;
  return { ...rest, ...(approvedAt ? { approvedAt: approvedAt.toISOString() } : {}), createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
};
const openOf = (list: PostAmendmentRow[]) => list.find((a) => a.status !== "REGISTERED") ?? null;

/** Lập bản khai bổ sung (khi bắt đầu sửa sau thông quan): đầu bản khai điền sẵn từ tờ khai gốc + số Hải quan trả về, chưa có dòng hàng. */
export async function createPostAmendment(deps: CustomsDeps, r: CustomsRepos, ctx: Ctx, dossierId: string, result: ResultRow): Promise<PostAmendmentRow> {
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) throw new Error("createPostAmendment: thiếu tờ khai");
  const all = await r.amendments.listForDossier(ctx.orgId, dossierId);
  const now = deps.clock.now();
  const rate = snap.payload.fields["TY_GIA"]?.value.trim();
  const row: PostAmendmentRow = {
    id: deps.idGen.next("pam"), orgId: ctx.orgId, dossierId, seq: all.length + 1, status: "DRAFT",
    header: amaHeaderFrom(amaSource(snap.payload, result.raw?.customsInfo ?? null, result.declarationNo ?? "", rate || undefined)),
    lines: [], approvedAt: null, createdAt: now, updatedAt: now,
  };
  await r.amendments.insert(row);
  return row;
}

/** Hợp đồng gia công trên tờ khai gốc (ô Số/Ngày hợp đồng gia công) – chọn để chèn vào ghi chú sau khai bổ sung. */
function processingContracts(kind: "IDA" | "EDA", fields: Record<string, { value: string }>): ProcessingContract[] {
  const v = declarationFormValues(kind, Object.entries(fields).map(([code, f]) => ({ code, value: f.value })));
  const no = v["APP_HDGC_SO"]?.trim();
  return no ? [{ no, date: v["APP_HDGC_NGAY"]?.trim() ?? "" }] : [];
}

export async function getPostAmendmentView(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<PostAmendmentView>> {
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NOT_FOUND", "Không tìm thấy tờ khai của hồ sơ"));
  const list = await deps.uow.asOrg(ctx, (r) => r.amendments.listForDossier(ctx.orgId, dossierId));
  const current = openOf(list);
  return ok({
    current: current ? toPostAmendment(current) : null,
    history: list.filter((a) => a.status === "REGISTERED").sort((a, b) => b.seq - a.seq).map(toPostAmendment),
    sourceLines: [...snap.payload.items].sort((a, b) => a.lineNo - b.lineNo).map((it) => ({ lineNo: it.lineNo, description: it.description, hsCode: it.hsConfirmed ?? "" })),
    contracts: processingContracts(snap.payload.kind, snap.payload.fields),
  });
}

type Edit = (a: PostAmendmentRow, r: CustomsRepos) => Promise<Result<PostAmendmentRow>>;

/** Sửa bản khai đang mở: kiểm quyền, trạng thái sửa được; sửa sau khi duyệt → về nháp (duyệt lại trước khi khai). */
async function editOpen(deps: CustomsDeps, ctx: Ctx, dossierId: string, fn: Edit): Promise<Result<PostAmendment>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const out = await deps.uow.asOrg(ctx, async (r): Promise<Result<PostAmendmentRow>> => {
    const a = openOf(await r.amendments.listForDossier(ctx.orgId, dossierId));
    if (!a) return err(domainError("NOT_FOUND", "Chưa lập bản khai bổ sung – bấm Bắt đầu sửa sau thông quan ở bước Khai báo Hải quan"));
    if (!postAmendmentEditable(a.status)) {
      return err(domainError("INVALID_STATE", a.status === "PRE_DECLARED" ? "Bản khai đã khai tạm AMA – gọi về (AMB) trước khi sửa" : "Bản khai đã khai chính thức AMC – khóa toàn bộ"));
    }
    const next = await fn(a, r);
    if (!next.ok) return next;
    const row: PostAmendmentRow = { ...next.value, updatedAt: deps.clock.now() };
    if (row.status === "APPROVED") {
      row.status = "DRAFT";
      delete row.approvedBy;
      row.approvedAt = null;
    }
    await r.amendments.update(row);
    return ok(row);
  });
  if (!out.ok) return out;
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok(toPostAmendment(out.value));
}

export async function updatePostAmendmentField(deps: CustomsDeps, ctx: Ctx, dossierId: string, input: UpdatePostAmendmentField): Promise<Result<PostAmendment>> {
  const issue = amaFieldIssue(input.key, input.value);
  if (issue) return err(domainError("VALIDATION", issue));
  let audit: { key: string; oldValue: string; newValue: string } | null = null;
  const res = await editOpen(deps, ctx, dossierId, async (a) => {
    if (input.lineId) {
      const i = a.lines.findIndex((l) => l.id === input.lineId);
      if (i < 0) return err(domainError("NOT_FOUND", "Không tìm thấy dòng hàng của bản khai"));
      if (!isAmaLineKey(input.key) || amaLineLocked(input.key)) return err(domainError("INVALID_STATE", "Ô này theo tờ khai gốc – không sửa"));
      const line = a.lines[i]!;
      audit = { key: `ama:${a.seq}:${line.ran}:${input.key}`, oldValue: line.values[input.key] ?? "", newValue: input.value.trim() };
      const lines = [...a.lines];
      lines[i] = applyAmaLineEdit(line, input.key, input.value);
      return ok({ ...a, lines });
    }
    if (!isAmaHeaderKey(input.key) || amaHeaderLocked(input.key)) return err(domainError("INVALID_STATE", "Ô này theo tờ khai gốc – không sửa"));
    audit = { key: `ama:${a.seq}:${input.key}`, oldValue: a.header[input.key] ?? "", newValue: input.value.trim() };
    return ok({ ...a, header: { ...a.header, [input.key]: input.value.trim() } });
  });
  // Bất biến 6: người dùng sửa trường → field_audit append-only.
  const row = audit as { key: string; oldValue: string; newValue: string } | null;
  if (res.ok && row) await deps.audit.append(ctx, { dossierId, ...row, source: "AMA_EDIT" });
  return res;
}

/** Thêm một hoặc nhiều dòng của tờ khai gốc (chọn nhiều dòng cùng lúc): Trước = tờ khai gốc + số Hải quan tính, Sau = bằng Trước. */
export async function addPostAmendmentLines(deps: CustomsDeps, ctx: Ctx, dossierId: string, lineNos: number[]): Promise<Result<PostAmendment>> {
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NOT_FOUND", "Không tìm thấy tờ khai của hồ sơ"));
  const result = await deps.uow.asOrg(ctx, (r) => r.results.get(ctx.orgId, dossierId));
  const all = amaSourceLines(snap.payload, result?.raw?.customsInfo ?? null);
  const wanted = [...new Set(lineNos)];
  const missing = wanted.filter((n) => !all.some((l) => l.lineNo === n));
  if (missing.length) return err(domainError("NOT_FOUND", `Tờ khai gốc không có dòng ${missing.join(", ")}`));
  return editOpen(deps, ctx, dossierId, async (a) => {
    const dup = wanted.filter((n) => a.lines.some((l) => l.ran === n));
    if (dup.length) return err(domainError("VALIDATION", `Dòng ${dup.join(", ")} đã có trong bản khai`));
    const added = wanted.map((n) => ({ id: deps.idGen.next("pal"), ran: n, values: amaLineFrom(all.find((l) => l.lineNo === n)!), manual: [] }));
    return ok({ ...a, lines: [...a.lines, ...added].sort((x, y) => x.ran - y.ran) });
  });
}

export async function removePostAmendmentLine(deps: CustomsDeps, ctx: Ctx, dossierId: string, lineId: string): Promise<Result<PostAmendment>> {
  return editOpen(deps, ctx, dossierId, async (a) => ok({ ...a, lines: a.lines.filter((l) => l.id !== lineId) }));
}

/** Phê duyệt bản khai bổ sung: Người duyệt / Chủ sở hữu, nguyên tắc 4 mắt như tờ khai; cần ít nhất một dòng và mã lý do. */
export async function approvePostAmendment(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<PostAmendment>> {
  if (ctx.role !== "APPROVER" && ctx.role !== "OWNER") return err(domainError("FORBIDDEN", "Chỉ Người duyệt hoặc Chủ sở hữu được phê duyệt bản khai bổ sung"));
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  if (ctx.role !== "OWNER" && dossier.ownerId === ctx.userId && (await deps.org.fourEyes(ctx.orgId))) return err(domainError("FORBIDDEN", "Người duyệt phải khác người tạo hồ sơ (nguyên tắc 4 mắt)"));
  const out = await deps.uow.asOrg(ctx, async (r): Promise<Result<PostAmendmentRow>> => {
    const a = openOf(await r.amendments.listForDossier(ctx.orgId, dossierId));
    if (!a || (a.status !== "DRAFT" && a.status !== "RECALLED")) return err(domainError("INVALID_STATE", a ? "Bản khai đã được duyệt hoặc đã khai" : "Chưa lập bản khai bổ sung"));
    if (!a.lines.length) return err(domainError("VALIDATION", "Chọn ít nhất một dòng hàng cần khai bổ sung"));
    if (!a.header["TK_REC"]?.trim()) return err(domainError("VALIDATION", "Chưa nhập mã lý do khai bổ sung"));
    const now = deps.clock.now();
    const row: PostAmendmentRow = { ...a, status: "APPROVED", approvedBy: ctx.userId, approvedAt: now, updatedAt: now };
    await r.amendments.update(row);
    return ok(row);
  });
  if (!out.ok) return out;
  await deps.dossiers.update(ctx.orgId, dossierId, { step: "submit" });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok(toPostAmendment(out.value));
}

/** Bản khai đang mở đã duyệt (performOperation AMA dùng làm "đã duyệt" thay cho tờ khai gốc). */
export async function openPostAmendment(r: CustomsRepos, orgId: string, dossierId: string): Promise<PostAmendmentRow | null> {
  return openOf(await r.amendments.listForDossier(orgId, dossierId));
}

/** Phản hồi AMA/AMB/AMC thành công → đổi trạng thái bản khai; AMA: số tờ khai bổ sung / số tiếp nhận Hải quan trả về. */
export async function applyPostAmendmentResult(r: CustomsRepos, orgId: string, dossierId: string, op: CustomsOperation, at: Date, reply: { receiptNo?: string | undefined }): Promise<void> {
  const a = await openPostAmendment(r, orgId, dossierId);
  if (!a) return;
  const row: PostAmendmentRow = { ...a, updatedAt: at };
  if (op === "AMA") {
    const delta = amendmentDeltaVnd(a);
    row.status = "PRE_DECLARED";
    row.result = {
      ...(reply.receiptNo ? { TK_SYN: reply.receiptNo } : {}), TK_A02: at.toISOString().slice(0, 10),
      TK_ADB: delta.startsWith("-") ? "-" : "+", TK_A23: delta.replace("-", ""), TK_A25: String(a.lines.length),
    };
    if (reply.receiptNo) row.header = { ...a.header, TK_SYN: reply.receiptNo };
  } else if (op === "AMB") {
    row.status = "RECALLED";
    delete row.approvedBy;
    row.approvedAt = null;
  } else if (op === "AMC") row.status = "REGISTERED";
  await r.amendments.update(row);
}

/** Giai đoạn sau thông quan đang mở bản khai bổ sung. */
export const isPostStage = (result: ResultRow | null) => Boolean(result && stageOf(result).startsWith("POST_"));
